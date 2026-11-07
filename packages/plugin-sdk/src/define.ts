import type { NotifierPlugin, NotifierPluginDefinition } from './notifier.js';
import type { SourcePlugin, SourcePluginDefinition } from './source.js';
import { SDK_API_VERSION } from './version.js';

/** Declares a source plugin with full typing. `Config` is inferred from `configSchema`. */
export function defineSourcePlugin<Config = unknown>(
  definition: SourcePluginDefinition<Config>,
): SourcePlugin<Config> {
  return { ...definition, kind: 'source', apiVersion: SDK_API_VERSION };
}

/** Declares a notifier plugin with full typing. `Config` is inferred from `configSchema`. */
export function defineNotifierPlugin<Config>(
  definition: NotifierPluginDefinition<Config>,
): NotifierPlugin<Config> {
  return { ...definition, kind: 'notifier', apiVersion: SDK_API_VERSION };
}
