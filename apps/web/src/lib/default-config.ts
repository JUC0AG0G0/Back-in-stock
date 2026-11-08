import type { ChannelConfig, NotifierInfo } from './api';

/** Initial values of the form: the schema defaults (e.g. "include images" on). */
export function defaultConfig(notifier: NotifierInfo): ChannelConfig {
  return Object.fromEntries(
    Object.entries(notifier.configSchema.properties ?? {})
      .filter(([, field]) => field.default !== undefined)
      .map(([name, field]) => [name, field.default]),
  );
}
