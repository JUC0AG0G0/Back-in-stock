import type {
  Fetcher,
  HtmlHelpers,
  ListingItem,
  Logger,
  NotifierPlugin,
  ProductSnapshot,
  SourcePlugin,
  WatchType,
} from '@back-in-stock/plugin-sdk';
import { SourceError } from '@back-in-stock/plugin-sdk';
import type { ChannelRepository } from './ports.js';

/**
 * Generic plugin self-test (Plugins screen, "Test" and "Test all plugins" buttons).
 * - A source fetches and parses a page like a real check, and nothing is saved.
 * - A notifier sends a test notification through each channel configured with it.
 * A failing plugin never throws here: every outcome becomes a result the UI can show.
 */

export type PluginKind = 'source' | 'notifier';

export type PluginTestStatus = 'passed' | 'failed' | 'skipped';

export type PluginTestSkipReason =
  /** A source without `testTargets`, tested without a URL. */
  | 'no-test-target'
  /** A notifier with no channel configured yet. */
  | 'no-channel';

/** How many listing items a test result carries, to keep the response small. */
export const LISTING_SAMPLE_SIZE = 20;

export type SourceTestOutput =
  | { type: 'product'; product: ProductSnapshot }
  | { type: 'listing'; itemCount: number; complete: boolean; items: ListingItem[] };

export interface PluginTestResult {
  kind: PluginKind;
  pluginId: string;
  status: PluginTestStatus;
  /** What was tested: a page URL for a source, a channel for a notifier. */
  target?: { label: string; url?: string; type?: WatchType; channelId?: string };
  durationMs: number;
  skipReason?: PluginTestSkipReason;
  output?: SourceTestOutput;
  error?: { message: string; kind?: string };
}

/** Sends a test notification with a config already validated by the plugin's configSchema. Throws on failure. */
export type NotifierTestFn = (
  plugin: NotifierPlugin,
  config: unknown,
  deps: { fetch: Fetcher; logger: Logger; signal: AbortSignal },
) => Promise<void>;

export interface PluginTesterDeps {
  sources: { get(id: string): SourcePlugin | undefined; list(): SourcePlugin[] };
  notifiers: { get(id: string): NotifierPlugin | undefined; list(): NotifierPlugin[] };
  /** Saved channels. Without it, notifier tests are skipped with "no-channel". */
  channels?: Pick<ChannelRepository, 'list'>;
  fetch: Fetcher;
  html: HtmlHelpers;
  logger: Logger;
  testNotifier: NotifierTestFn;
  /** Per test. A page or an API that hangs must not block the whole run. */
  timeoutMs?: number;
  now?: () => number;
}

export interface SourceTestInput {
  /** Page to test. Without it, the plugin's `testTargets` are used. */
  url?: string;
  /** Watch type to test. Defaults to the first type the plugin supports. */
  type?: WatchType;
  config?: unknown;
}

export class UnknownPluginError extends Error {
  override readonly name = 'UnknownPluginError';
  constructor(
    readonly kind: PluginKind,
    readonly pluginId: string,
  ) {
    super(`unknown ${kind} plugin "${pluginId}"`);
  }
}

/** The input is not usable (unsupported type, invalid URL…): a 400, not a failed test. */
export class InvalidTestInputError extends Error {
  override readonly name = 'InvalidTestInputError';
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class PluginTester {
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly deps: PluginTesterDeps) {
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = deps.now ?? Date.now;
  }

  /** Every plugin, or every plugin of one kind. Plugins run in parallel. */
  async testAll(kind?: PluginKind): Promise<PluginTestResult[]> {
    const runs: Promise<PluginTestResult[]>[] = [];
    if (kind !== 'notifier') {
      for (const plugin of this.deps.sources.list()) runs.push(this.runSource(plugin, {}));
    }
    if (kind !== 'source') {
      const channels = await this.listChannels();
      for (const plugin of this.deps.notifiers.list())
        runs.push(this.runNotifier(plugin, channels));
    }
    return (await Promise.all(runs)).flat();
  }

  async testSource(id: string, input: SourceTestInput = {}): Promise<PluginTestResult[]> {
    const plugin = this.deps.sources.get(id);
    if (!plugin) throw new UnknownPluginError('source', id);
    return this.runSource(plugin, input);
  }

  async testNotifier(id: string): Promise<PluginTestResult[]> {
    const plugin = this.deps.notifiers.get(id);
    if (!plugin) throw new UnknownPluginError('notifier', id);
    return this.runNotifier(plugin, await this.listChannels());
  }

  private async runSource(
    plugin: SourcePlugin,
    input: SourceTestInput,
  ): Promise<PluginTestResult[]> {
    if (input.url !== undefined) {
      const type = input.type ?? plugin.supports[0];
      if (type === undefined || !plugin.supports.includes(type)) {
        throw new InvalidTestInputError(`plugin "${plugin.id}" does not support "${String(type)}"`);
      }
      if (!URL.canParse(input.url) || !/^https?:$/.test(new URL(input.url).protocol)) {
        throw new InvalidTestInputError('url: must be an http(s) URL');
      }
      return [await this.checkPage(plugin, { url: input.url, type, config: input.config })];
    }

    const targets = (plugin.testTargets ?? []).filter(
      (target) => input.type === undefined || target.type === input.type,
    );
    if (targets.length === 0) {
      return [
        {
          kind: 'source',
          pluginId: plugin.id,
          status: 'skipped',
          skipReason: 'no-test-target',
          durationMs: 0,
        },
      ];
    }
    return Promise.all(targets.map((target) => this.checkPage(plugin, target)));
  }

  private async checkPage(
    plugin: SourcePlugin,
    page: { url: string; type: WatchType; config?: unknown; label?: string },
  ): Promise<PluginTestResult> {
    const target = { label: page.label ?? page.url, url: page.url, type: page.type };
    return this.measure('source', plugin.id, target, async (signal) => {
      const config = parseConfig(plugin.configSchema, page.config);
      const ctx = {
        url: new URL(page.url),
        config,
        fetch: this.deps.fetch,
        html: this.deps.html,
        logger: this.deps.logger,
        signal,
      };
      if (page.type === 'product') {
        if (!plugin.checkProduct) throw new Error('checkProduct is missing');
        return { type: 'product', product: await plugin.checkProduct(ctx) };
      }
      if (!plugin.checkListing) throw new Error('checkListing is missing');
      const listing = await plugin.checkListing(ctx);
      return {
        type: 'listing',
        itemCount: listing.items.length,
        complete: listing.complete,
        items: listing.items.slice(0, LISTING_SAMPLE_SIZE),
      };
    });
  }

  private async runNotifier(
    plugin: NotifierPlugin,
    channels: Awaited<ReturnType<ChannelRepository['list']>>,
  ): Promise<PluginTestResult[]> {
    const own = channels.filter((channel) => channel.notifierId === plugin.id);
    if (own.length === 0) {
      return [
        {
          kind: 'notifier',
          pluginId: plugin.id,
          status: 'skipped',
          skipReason: 'no-channel',
          durationMs: 0,
        },
      ];
    }
    return Promise.all(
      own.map((channel) =>
        this.measure(
          'notifier',
          plugin.id,
          { label: channel.name, channelId: channel.id },
          async (signal) => {
            const config = parseConfig(plugin.configSchema, channel.config);
            await this.deps.testNotifier(plugin, config, {
              fetch: this.deps.fetch,
              logger: this.deps.logger,
              signal,
            });
            return undefined;
          },
        ),
      ),
    );
  }

  private async listChannels() {
    return (await this.deps.channels?.list()) ?? [];
  }

  private async measure(
    kind: PluginKind,
    pluginId: string,
    target: NonNullable<PluginTestResult['target']>,
    run: (signal: AbortSignal) => Promise<SourceTestOutput | undefined>,
  ): Promise<PluginTestResult> {
    const started = this.now();
    const signal = AbortSignal.timeout(this.timeoutMs);
    const base = { kind, pluginId, target };
    try {
      const output = await raceAbort(run(signal), signal);
      return {
        ...base,
        status: 'passed',
        durationMs: this.now() - started,
        ...(output === undefined ? {} : { output }),
      };
    } catch (err) {
      this.deps.logger.warn('plugin test failed', {
        kind,
        pluginId,
        target: target.label,
        error: String(err),
      });
      return {
        ...base,
        status: 'failed',
        durationMs: this.now() - started,
        error: describeError(err),
      };
    }
  }
}

function parseConfig(
  schema: SourcePlugin['configSchema'] | NotifierPlugin['configSchema'],
  config: unknown,
): unknown {
  if (!schema) return config ?? {};
  const result = schema.safeParse(config ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );
    throw new Error(`invalid config: ${issues.join('; ')}`);
  }
  return result.data;
}

/** A plugin that ignores the signal must still be cut off at the timeout. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('timed out'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function describeError(err: unknown): NonNullable<PluginTestResult['error']> {
  if (err instanceof SourceError) return { message: err.message, kind: err.kind };
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}
