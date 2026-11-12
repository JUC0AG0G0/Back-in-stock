import {
  validatePlugin,
  type AnyPlugin,
  type Logger,
  type NotifierPlugin,
  type SourcePlugin,
  type WatchType,
} from '@back-in-stock/plugin-sdk';

/** A plugin that failed to load, shown in the UI instead of crashing the app (SPEC §4). */
export interface RejectedPlugin {
  /** Where it came from: "builtin", an npm package name or a /data/plugins folder. */
  origin: string;
  /** Plugin id when it could be read. */
  id?: string;
  errors: string[];
}

export type RegistrationResult = { ok: true; id: string } | { ok: false; errors: string[] };

/**
 * Plugin + Registry pattern: plugins register at startup, the core finds them by id.
 * Anything is accepted as input (an npm default export can be anything) and validated first.
 */
abstract class PluginRegistry<P extends AnyPlugin> {
  private readonly plugins = new Map<string, P>();
  private readonly rejectedList: RejectedPlugin[] = [];

  constructor(
    private readonly kind: P['kind'],
    private readonly logger?: Logger,
  ) {}

  register(value: unknown, origin = 'builtin'): RegistrationResult {
    const validation = validatePlugin(value);
    const id = readId(value);

    const reject = (errors: string[]): RegistrationResult => {
      this.rejectedList.push({ origin, ...(id === undefined ? {} : { id }), errors });
      this.logger?.warn('plugin rejected', { origin, id, errors });
      return { ok: false, errors };
    };

    if (!validation.ok) return reject(validation.errors);
    const plugin = validation.plugin;
    if (plugin.kind !== this.kind) {
      return reject([`kind: expected a ${this.kind} plugin, got a ${plugin.kind} plugin`]);
    }
    if (this.plugins.has(plugin.id)) {
      return reject([`id: "${plugin.id}" is already registered`]);
    }
    this.plugins.set(plugin.id, plugin as P);
    this.logger?.info('plugin registered', { origin, id: plugin.id, version: plugin.version });
    return { ok: true, id: plugin.id };
  }

  get(id: string): P | undefined {
    return this.plugins.get(id);
  }

  list(): P[] {
    return [...this.plugins.values()];
  }

  rejected(): readonly RejectedPlugin[] {
    return this.rejectedList;
  }
}

function readId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('id' in value)) return undefined;
  return typeof value.id === 'string' ? value.id : undefined;
}

export interface SourceMatch {
  plugin: SourcePlugin;
  score: number;
}

export class SourceRegistry extends PluginRegistry<SourcePlugin> {
  constructor(logger?: Logger) {
    super('source', logger);
  }

  /**
   * Picks the plugin that best reads this URL for this watch type (Strategy + Chain of
   * Responsibility, SPEC §3): highest `match()` score wins, a site-specific plugin (score 1)
   * beats a generic one (e.g. JSON-LD, 0.5). Ties keep the registration order.
   * A plugin whose `match()` throws is skipped.
   */
  resolve(url: URL, type: WatchType): SourceMatch | undefined {
    let best: SourceMatch | undefined;
    for (const plugin of this.list()) {
      if (!plugin.supports.includes(type)) continue;
      const score = this.score(plugin, url);
      if (score > 0 && (best === undefined || score > best.score)) {
        best = { plugin, score };
      }
    }
    return best;
  }

  /** `match()` score clamped to 0..1, or 0 when it throws or returns garbage. */
  score(plugin: SourcePlugin, url: URL): number {
    return safeScore(plugin, url);
  }
}

function safeScore(plugin: SourcePlugin, url: URL): number {
  try {
    const score = plugin.match(url);
    return Number.isFinite(score) ? Math.min(Math.max(score, 0), 1) : 0;
  } catch {
    return 0;
  }
}

export class NotifierRegistry extends PluginRegistry<NotifierPlugin> {
  constructor(logger?: Logger) {
    super('notifier', logger);
  }
}
