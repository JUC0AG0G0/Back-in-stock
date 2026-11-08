import { createTranslator, type Locale } from '@back-in-stock/i18n';
import type { Fetcher, Logger, NotifierContext, NotifierPlugin } from '@back-in-stock/plugin-sdk';

export interface NotifierDeps {
  fetch: Fetcher;
  logger: Logger;
  /** Cancels the call, e.g. on timeout. */
  signal?: AbortSignal;
}

/** Context handed to a notifier, with a 20 s timeout unless the caller gives a signal. */
export function notifierContext<C>(config: C, deps: NotifierDeps): NotifierContext<C> {
  return {
    config,
    fetch: deps.fetch,
    logger: deps.logger,
    signal: deps.signal ?? AbortSignal.timeout(20_000),
  };
}

/**
 * Content of a custom test message (Plugins screen): lets the user check how a channel renders
 * a link, an image, or a link without image. A missing title uses the translated default
 * (notifiers need one), a missing text is sent empty, e.g. to send only a link.
 */
export interface TestMessageContent {
  title?: string;
  text?: string;
  url?: string;
  imageUrl?: string;
}

/**
 * "Send a test" (SPEC §7): the plugin's own `test` when it has one, otherwise a
 * translated test message sent with `send`. Throws when the message could not be sent.
 * With `content`, the message is always sent with `send`, so it goes through the real
 * rendering (link, photo…). `config` must already be validated by the plugin's configSchema.
 */
export async function testNotifier(
  plugin: NotifierPlugin,
  config: unknown,
  deps: NotifierDeps & { locale: Locale },
  content?: TestMessageContent,
): Promise<void> {
  const ctx = notifierContext(config, deps);
  if (plugin.test && !content) {
    await plugin.test(ctx);
    return;
  }
  const t = createTranslator(deps.locale);
  await plugin.send(ctx, {
    event: 'Test',
    locale: deps.locale,
    title: content?.title ?? t('notifications.test.title'),
    text: content ? (content.text ?? '') : t('notifications.test.text'),
    ...(content?.url ? { url: content.url } : {}),
    ...(content?.imageUrl ? { imageUrl: content.imageUrl } : {}),
  });
}
