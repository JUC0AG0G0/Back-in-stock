import type { Logger } from '@back-in-stock/plugin-sdk';
import type { FastifyBaseLogger } from 'fastify';

/** Adapts the server's pino logger to the plugin Logger, prefixing lines with the source. */
export function pluginLogger(
  log: FastifyBaseLogger,
  bindings: Record<string, unknown> = {},
): Logger {
  const child = log.child(bindings);
  return {
    debug: (message, data) => child.debug(data ?? {}, message),
    info: (message, data) => child.info(data ?? {}, message),
    warn: (message, data) => child.warn(data ?? {}, message),
    error: (message, data) => child.error(data ?? {}, message),
  };
}
