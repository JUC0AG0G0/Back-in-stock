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
