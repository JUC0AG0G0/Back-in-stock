// Client of the plugin routes (GET /api/plugins, POST /api/plugins/.../test).
// Types mirror apps/server/src/application/test-plugins.ts until a shared Zod package exists.

export type WatchType = 'product' | 'listing';
export type PluginKind = 'source' | 'notifier';
export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'UNKNOWN';

export interface Price {
  amountCents: number;
  currency: string;
}

export interface PluginList {
  sources: { id: string; name: string; version: string; supports: WatchType[] }[];
  notifiers: { id: string; name: string; version: string }[];
  rejected: { origin: string; id?: string; errors: string[] }[];
}

export interface ListingItem {
  id: string;
  title: string;
  url: string;
  price?: Price;
}

export type SourceTestOutput =
  | {
      type: 'product';
      product: {
        status: StockStatus;
        title?: string;
        price?: Price;
        variant?: string;
        signal?: string;
      };
    }
  | { type: 'listing'; itemCount: number; complete: boolean; items: ListingItem[] };

export interface PluginTestResult {
  kind: PluginKind;
  pluginId: string;
  status: 'passed' | 'failed' | 'skipped';
  target?: { label: string; url?: string; type?: WatchType; channelId?: string };
  durationMs: number;
  skipReason?: 'no-test-target' | 'no-channel';
  output?: SourceTestOutput;
  error?: { message: string; kind?: string };
}

export interface SourceTestInput {
  url?: string;
  type?: WatchType;
}

/** Custom test message. Empty fields are left out by the server. */
export interface TestMessageContent {
  title?: string;
  text?: string;
  url?: string;
  imageUrl?: string;
}

export interface NotifierTestInput {
  /** Only this channel. Defaults to every channel of the notifier. */
  channelId?: string;
  message?: TestMessageContent;
  locale?: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

export const fetchPlugins = () => request<PluginList>('/api/plugins');

export async function testAllPlugins(): Promise<PluginTestResult[]> {
  return (await post<{ results: PluginTestResult[] }>('/api/plugins/test')).results;
}

export async function testPlugin(
  kind: PluginKind,
  id: string,
  input?: SourceTestInput | NotifierTestInput,
): Promise<PluginTestResult[]> {
  const path = `/api/plugins/${kind === 'source' ? 'sources' : 'notifiers'}/${encodeURIComponent(id)}/test`;
  return (await post<{ results: PluginTestResult[] }>(path, input ?? {})).results;
}
