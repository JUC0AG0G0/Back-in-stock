import { testPlugin, type PluginTestResult } from '@/lib/plugin-tests-api';

// Client of the watch routes (POST /api/sources/match, /api/watches).
// Types mirror apps/server/src/http/watch-routes.ts until a shared Zod package exists.

export type WatchType = 'product' | 'listing';

export interface SourceCandidate {
  id: string;
  name: string;
  supports: WatchType[];
  /** match() score, 0 to 1: 1 is a site-specific plugin, 0.5 a generic one. */
  score: number;
}

export interface SourceMatch {
  url: string;
  hostname: string;
  /** Plugins able to read the URL, best first. */
  candidates: SourceCandidate[];
  suggested: Partial<Record<WatchType, string>>;
}

export interface WatchView {
  id: string;
  type: WatchType;
  url: string;
  name: string;
  sourceId: string;
  active: boolean;
  channelIds: string[];
}

export interface NewWatchInput {
  url: string;
  type: WatchType;
  sourceId: string;
  name?: string;
  /** Channels to notify. Omitted: the enabled default channels. */
  channelIds?: string[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

const postJson = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const matchSources = (url: string) => postJson<SourceMatch>('/api/sources/match', { url });
export const fetchWatches = () => request<WatchView[]>('/api/watches');
export const createWatch = (input: NewWatchInput) => postJson<WatchView>('/api/watches', input);

/**
 * Current product info, read live by the source plugin (the "Test" route: nothing is saved).
 * Shown in the dialog so the user checks it is the right product before watching it.
 */
export async function previewProduct(sourceId: string, url: string): Promise<PluginTestResult> {
  const [result] = await testPlugin('source', sourceId, { url, type: 'product' });
  if (!result) throw new Error('No result');
  return result;
}
