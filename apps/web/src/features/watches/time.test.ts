import { describe, expect, it } from 'vitest';
import { formatTimeAgo } from './time';

const now = new Date('2026-11-12T21:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe('formatTimeAgo', () => {
  it('says how long ago, in the UI language', () => {
    expect(formatTimeAgo(ago(5 * 60), now, 'fr')).toBe('il y a 5 minutes');
    expect(formatTimeAgo(ago(2 * 3600), now, 'en')).toBe('2 hours ago');
    expect(formatTimeAgo(ago(24 * 3600), now, 'fr')).toBe('hier');
  });

  it('says "now" under a minute', () => {
    expect(formatTimeAgo(ago(20), now, 'en')).toBe('now');
    expect(formatTimeAgo(ago(20), now, 'fr')).toBe('maintenant');
  });
});
