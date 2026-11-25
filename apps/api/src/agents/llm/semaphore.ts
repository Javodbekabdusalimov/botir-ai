import { LlmError } from './llm-error';

/** FIFO gate: at most `max` holders at once; a waiter gives up after `timeoutMs`, so nothing waits forever. */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(readonly max: number) {}

  /** Resolves with a release function (safe to call twice). Rejects with LlmError('timeout') when the wait is too long. */
  acquire(timeoutMs: number): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const grant = (): void => {
        clearTimeout(timer);
        this.active++;
        resolve(this.releaser());
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(grant);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new LlmError('timeout', `queue wait > ${timeoutMs}ms (max ${this.max} concurrent calls)`));
      }, timeoutMs);
      this.waiters.push(grant);
    });
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      this.waiters.shift()?.();
    };
  }
}
