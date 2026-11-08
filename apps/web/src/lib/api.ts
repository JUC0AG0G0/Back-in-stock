/** Same shape as SetupStep in @back-in-stock/plugin-sdk. Texts are plugin translation keys. */
export interface SetupStep {
  id: string;
  title: string;
  description?: string;
  links?: Array<{ label: string; url: string; qrCode?: boolean }>;
  copyText?: string;
  fields?: string[];
  action?: 'validate' | 'discover' | 'test';
}

/** Subset of JSON Schema produced by the server from a notifier's configSchema. */
export interface FieldSchema {
  type?: string;
  default?: unknown;
  writeOnly?: boolean;
  pattern?: string;
}

export interface ConfigSchema {
  type: 'object';
  properties?: Record<string, FieldSchema>;
  required?: string[];
}

export interface NotifierInfo {
  id: string;
  name: string;
  version: string;
  configSchema: ConfigSchema;
  secretFields: string[];
  setupGuide: SetupStep[];
  translations: Partial<Record<string, Record<string, string>>>;
  capabilities: { validate: boolean; discover: boolean };
}

export type ChannelConfig = Record<string, unknown>;

export interface ChannelView {
  id: string;
  notifierId: string;
  name: string;
  config: ChannelConfig;
  secretsSet: string[];
  enabled: boolean;
  isDefault: boolean;
  /** False when the channel's plugin is no longer installed. */
  available: boolean;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
export type ValidateResult =
  { ok: true; info?: Record<string, string> } | { ok: false; error: string };
export type DiscoverResult =
  | { ok: true; candidates: Array<{ label: string; config: ChannelConfig }> }
  | { ok: false; error: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data.issues);
  return data as T;
}

interface ActionBody {
  config: ChannelConfig;
  channelId?: string;
  locale?: string;
}

export const api = {
  notifiers: () => request<NotifierInfo[]>('GET', '/api/notifiers'),
  validate: (id: string, body: ActionBody) =>
    request<ValidateResult>('POST', `/api/notifiers/${id}/validate`, body),
  discover: (id: string, body: ActionBody) =>
    request<DiscoverResult>('POST', `/api/notifiers/${id}/discover`, body),
  testSettings: (id: string, body: ActionBody) =>
    request<ActionResult>('POST', `/api/notifiers/${id}/test`, body),

  channels: () => request<ChannelView[]>('GET', '/api/channels'),
  createChannel: (body: {
    notifierId: string;
    name: string;
    config: ChannelConfig;
    isDefault: boolean;
  }) => request<ChannelView>('POST', '/api/channels', body),
  updateChannel: (
    id: string,
    body: Partial<{ name: string; config: ChannelConfig; enabled: boolean; isDefault: boolean }>,
  ) => request<ChannelView>('PATCH', `/api/channels/${id}`, body),
  deleteChannel: (id: string) => request<void>('DELETE', `/api/channels/${id}`),
  testChannel: (id: string, locale: string) =>
    request<ActionResult>('POST', `/api/channels/${id}/test`, { locale }),
};
