import type { UpdateChecker } from './update-checker.js';

export interface UpdateSchedulerOptions {
  checker: Pick<UpdateChecker, 'active' | 'check' | 'status'>;
  intervalMs: number;
  /** Delay of the first check after startup: kept off the critical path of the start. */
  firstDelayMs?: number;
  now?: () => number;
}

/**
 * Runs the new version check at a regular interval (SPEC §7quater).
 * The interval and the on/off switch can change at runtime from Settings: the next check is
 * then rescheduled from the last one (manual checks included), never lost or doubled.
 */
export class UpdateScheduler {
  private timer: NodeJS.Timeout | undefined;
  private intervalMs: number;
  private readonly now: () => number;

  constructor(private readonly options: UpdateSchedulerOptions) {
    this.intervalMs = options.intervalMs;
    this.now = options.now ?? Date.now;
  }

  start(): void {
    this.schedule(this.options.firstDelayMs ?? 10_000);
  }

  stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  get interval(): number {
    return this.intervalMs;
  }

  /** New interval: the next check is due `intervalMs` after the last one, or now if overdue. */
  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
    this.reschedule();
  }

  /** Call after the checker was turned on or off, or after a manual check. */
  reschedule(): void {
    const last = this.options.checker.status().checkedAt;
    if (last === null) {
      this.schedule(this.options.firstDelayMs ?? 10_000);
      return;
    }
    this.schedule(Math.max(0, Date.parse(last) + this.intervalMs - this.now()));
  }

  private schedule(delayMs: number): void {
    this.stop();
    if (!this.options.checker.active) return;
    this.timer = setTimeout(() => void this.run(), delayMs);
    this.timer.unref?.();
  }

  private async run(): Promise<void> {
    this.timer = undefined;
    await this.options.checker.check();
    this.schedule(this.intervalMs);
  }
}
