import { DomainError } from './errors.js';

/**
 * Value objects: validated at construction, immutable, compared by value.
 * The domain never handles a raw string or number for these concepts.
 */

/** An http(s) URL, normalized so the same page always gives the same string. */
export class Url {
  private constructor(readonly value: string) {}

  static parse(input: string): Url {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      throw new DomainError(`Invalid URL: ${input}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new DomainError(`URL must use http or https: ${input}`);
    }
    // The fragment is never sent to the server, so it cannot change the page.
    url.hash = '';
    return new Url(url.toString());
  }

  get hostname(): string {
    return new URL(this.value).hostname;
  }

  toURL(): URL {
    return new URL(this.value);
  }

  equals(other: Url): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** An amount in the smallest currency unit (cents), never a float. */
export class Money {
  private constructor(
    readonly amountCents: number,
    readonly currency: string,
  ) {}

  static of(amountCents: number, currency: string): Money {
    if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
      throw new DomainError(`Amount must be a non-negative integer of cents: ${amountCents}`);
    }
    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new DomainError(`Currency must be an ISO 4217 code like EUR: ${currency}`);
    }
    return new Money(amountCents, code);
  }

  equals(other: Money): boolean {
    return this.amountCents === other.amountCents && this.currency === other.currency;
  }
}

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** A duration between two checks, in whole seconds. */
export class Interval {
  private constructor(readonly seconds: number) {}

  static ofSeconds(seconds: number): Interval {
    if (!Number.isSafeInteger(seconds) || seconds <= 0) {
      throw new DomainError(`Interval must be a positive whole number of seconds: ${seconds}`);
    }
    return new Interval(seconds);
  }

  /** Parses "30s", "5m", "1h", "1d" (as in BIS_DEFAULT_INTERVAL). */
  static parse(input: string): Interval {
    const match = /^(\d+)\s*([smhd])$/i.exec(input.trim());
    if (!match) {
      throw new DomainError(`Invalid interval "${input}", expected e.g. 30s, 5m, 1h`);
    }
    const unit = match[2]!.toLowerCase() as keyof typeof UNIT_SECONDS;
    return Interval.ofSeconds(Number(match[1]) * UNIT_SECONDS[unit]);
  }

  get milliseconds(): number {
    return this.seconds * 1000;
  }

  max(other: Interval): Interval {
    return this.seconds >= other.seconds ? this : other;
  }
}

/** Stable identifier of an item on a listing page (SKU, product id or normalized URL). */
export class ItemId {
  private static readonly MAX_LENGTH = 512;

  private constructor(readonly value: string) {}

  static of(input: string): ItemId {
    const value = input.trim();
    if (value.length === 0) {
      throw new DomainError('Item id must not be empty');
    }
    if (value.length > ItemId.MAX_LENGTH) {
      throw new DomainError(`Item id is longer than ${ItemId.MAX_LENGTH} characters`);
    }
    return new ItemId(value);
  }

  equals(other: ItemId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
