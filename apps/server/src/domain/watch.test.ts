import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import { Interval } from './value-objects.js';
import { createWatch, effectiveInterval } from './watch.js';

const base = {
  id: 'w1',
  type: 'listing' as const,
  url: 'https://fanatec.com/eu/en/refurbished',
  sourceId: 'fanatec',
};

describe('createWatch', () => {
  it('applies the defaults', () => {
    const watch = createWatch({ ...base, channelIds: ['tg', 'tg', 'mail'] });
    expect(watch).toMatchObject({
      name: 'fanatec.com',
      interval: null,
      active: true,
      confirmRestock: true,
      channelIds: ['tg', 'mail'],
    });
  });

  it('rejects an invalid URL, a missing source or a zero interval', () => {
    expect(() => createWatch({ ...base, url: 'nope' })).toThrow(DomainError);
    expect(() => createWatch({ ...base, sourceId: ' ' })).toThrow(DomainError);
    expect(() => createWatch({ ...base, intervalSeconds: 0 })).toThrow(DomainError);
  });
});

describe('effectiveInterval', () => {
  const globalDefault = Interval.parse('5m');
  const floor = Interval.parse('1m');

  it('follows the global default when the watch has none', () => {
    expect(effectiveInterval(createWatch(base), globalDefault, floor).seconds).toBe(300);
  });

  it('uses the watch interval when set', () => {
    const watch = createWatch({ ...base, intervalSeconds: 120 });
    expect(effectiveInterval(watch, globalDefault, floor).seconds).toBe(120);
  });

  it('never goes below the floor', () => {
    const watch = createWatch({ ...base, intervalSeconds: 10 });
    expect(effectiveInterval(watch, globalDefault, floor).seconds).toBe(60);
  });
});
