/** Tasks with the same key run one after another (one API process), so check-then-write cannot race. */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(key) ?? Promise.resolve()).then(task);
    const settled = next.catch(() => undefined);
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key);
    });
    return next;
  }
}
