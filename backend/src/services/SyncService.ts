type BufferedEvent = { seq: number; type: string; payload: any };

class SyncService {
  private seq = 1;
  private buffer: BufferedEvent[] = [];
  private maxBuffer = 1000;
  private lastSnapshot: Map<string, any> = new Map();

  recordEvent(type: string, payload: any) {
    const entry: BufferedEvent = { seq: this.seq++, type, payload };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.shift();
    return entry.seq;
  }

  recordSnapshot(type: string, snapshot: any) {
    this.lastSnapshot.set(type, snapshot);
    return this.recordEvent(type + ":snapshot", { snapshot });
  }

  // Return either { full: true, snapshot, seq } or { full: false, diffs, seq }
  getReplay(type: string, sinceSeq: number) {
    const oldest = this.buffer.length ? this.buffer[0].seq : this.seq;
    const latest = this.buffer.length
      ? this.buffer[this.buffer.length - 1].seq
      : this.seq - 1;
    if (sinceSeq < oldest) {
      // need full snapshot
      return {
        full: true,
        snapshot: this.lastSnapshot.get(type) || null,
        seq: latest,
      };
    }
    const diffs = this.buffer.filter(
      (e) =>
        e.seq > sinceSeq && (e.type === type || e.type === type + ":snapshot"),
    );
    return { full: false, diffs, seq: latest };
  }
}

export const syncService = new SyncService();
