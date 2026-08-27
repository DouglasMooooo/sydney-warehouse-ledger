/**
 * Serializes Feishu operational-ledger appends within this Node process.
 * It is intentionally process-local: FEISHU_UAT must run as one instance.
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const turn = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.tail;
    this.tail = previous.catch(() => undefined).then(() => turn);
    await previous.catch(() => undefined);
    try { return await operation(); } finally { release(); }
  }
}

export const operationalLedgerWriteMutex = new AsyncMutex();
