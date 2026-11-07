/** A business rule was broken, e.g. an invalid URL or a negative price. */
export class DomainError extends Error {
  override readonly name = 'DomainError';
}
