import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateScheduler } from './update-scheduler.js';

const HOUR = 60 * 60 * 1000;

function fakeChecker() {
  const checker = {
    active: true,
    checkedAt: null as string | null,
    check: vi.fn(async () => {
      checker.checkedAt = new Date().toISOString();
      return {} as never;
    }),
    status: () => ({ checkedAt: checker.checkedAt }) as never,
  };
  return checker;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-08T00:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('UpdateScheduler', () => {
  it('checks shortly after startup, then at every interval', async () => {
    const checker = fakeChecker();
    const scheduler = new UpdateScheduler({ checker, intervalMs: 6 * HOUR, firstDelayMs: 1000 });
    scheduler.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(checker.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6 * HOUR);
    expect(checker.check).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('counts a new interval from the last check', async () => {
    const checker = fakeChecker();
    const scheduler = new UpdateScheduler({ checker, intervalMs: 6 * HOUR, firstDelayMs: 0 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(checker.check).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * HOUR);
    scheduler.setInterval(3 * HOUR); // next one is due 1 h from now
    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(checker.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(checker.check).toHaveBeenCalledTimes(2);

    scheduler.setInterval(HOUR / 2);
    await vi.advanceTimersByTimeAsync(HOUR / 2);
    expect(checker.check).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('checks right away when a shorter interval is already overdue', async () => {
    const checker = fakeChecker();
    const scheduler = new UpdateScheduler({ checker, intervalMs: 6 * HOUR, firstDelayMs: 0 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3 * HOUR);

    scheduler.setInterval(HOUR);
    await vi.advanceTimersByTimeAsync(0);
    expect(checker.check).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('stops checking while the checker is off, and resumes when it is back on', async () => {
    const checker = fakeChecker();
    checker.active = false;
    const scheduler = new UpdateScheduler({ checker, intervalMs: HOUR, firstDelayMs: 0 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(checker.check).not.toHaveBeenCalled();

    checker.active = true;
    scheduler.reschedule();
    await vi.advanceTimersByTimeAsync(0);
    expect(checker.check).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});
