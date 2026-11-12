const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const AUTO: Intl.RelativeTimeFormatOptions = { numeric: 'auto' };

/** "il y a 5 minutes" / "5 minutes ago". Under a minute: "maintenant" / "now". */
export function formatTimeAgo(date: Date, now: Date, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, AUTO);
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
}

export type IntervalUnit = 'minute' | 'hour' | 'day';

const INTERVAL_UNITS: [IntervalUnit, number][] = [
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** A check frequency in the largest whole unit: 5400 s is 90 minutes, 7200 s is 2 hours. */
export function intervalParts(seconds: number): { unit: IntervalUnit; count: number } {
  for (const [unit, size] of INTERVAL_UNITS) {
    if (seconds >= size && seconds % size === 0) return { unit, count: seconds / size };
  }
  return { unit: 'minute', count: Math.max(1, Math.round(seconds / 60)) };
}
