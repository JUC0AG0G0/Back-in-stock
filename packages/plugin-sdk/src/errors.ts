export type SourceErrorKind =
  /** Captcha, bot protection or HTTP 403. */
  | 'blocked'
  /** The product or page no longer exists. */
  | 'not-found'
  /** The page was fetched but its content was not understood. */
  | 'parse'
  /** Timeout, DNS, connection reset, HTTP 5xx. */
  | 'network';

/**
 * Thrown by source plugins when a page cannot be read.
 * The core records the check as an error and never turns it into a stock change.
 */
export class SourceError extends Error {
  override readonly name = 'SourceError';

  constructor(
    readonly kind: SourceErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
