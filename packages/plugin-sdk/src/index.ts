export { SDK_API_VERSION } from './version.js';
export type {
  FetchOptions,
  FetchResult,
  Fetcher,
  HtmlHelpers,
  Logger,
  PostOptions,
  Price,
} from './common.js';
export type {
  FetchMode,
  ListingAttributeValue,
  ListingItem,
  ListingSnapshot,
  ProductSnapshot,
  SourceContext,
  SourcePlugin,
  SourcePluginDefinition,
  SourceTestTarget,
  StockStatus,
  WatchType,
} from './source.js';
export type {
  NotificationEventType,
  NotificationMessage,
  NotifierContext,
  NotifierPlugin,
  NotifierPluginDefinition,
  DiscoveryCandidate,
  DiscoveryResult,
  SetupLink,
  SetupStep,
  ValidationResult,
} from './notifier.js';
export { SourceError, type SourceErrorKind } from './errors.js';
export { defineNotifierPlugin, defineSourcePlugin } from './define.js';
export { validatePlugin, type AnyPlugin, type PluginValidation } from './validate.js';
/** Re-exported so that plugins describe their config with the same Zod as the core. */
export { z } from 'zod';
