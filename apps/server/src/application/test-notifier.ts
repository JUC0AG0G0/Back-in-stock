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
 * "Send a test" (SPEC §7): the plugin's own `test` when it has one, otherwise a
 * translated test message sent with `send`. Throws when the message could not be sent.
 * `config` must already be validated by the plugin's configSchema.
 */
export async function testNotifier(
  plugin: NotifierPlugin,
  config: unknown,
  deps: NotifierDeps & { locale: Locale },
): Promise<void> {
  const ctx = notifierContext(config, deps);
  if (plugin.test) {
    await plugin.test(ctx);
    return;
  }
  const t = createTranslator(deps.locale);
  await plugin.send(ctx, {
    event: 'Test',
    locale: deps.locale,
    title: t('notifications.test.title'),
    text: t('notifications.test.text'),
  });
}
