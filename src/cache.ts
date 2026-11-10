// Memory only: never persist credentials, authenticated URLs or server data.
// Values are serialized so callers cannot mutate a cached response by reference.
const resets = new Set<() => void>();
export function resetCaches(): void { for (const reset of resets) reset(); }

export class MemoryCache {
  private entries = new Map<string, { value: string; expires: number; size: number }>();
  private pending = new Map<string, Promise<string>>();
  private size = 0;
  private generation = 0;

  constructor(private ttl: number, private limit: number, private maxBytes: number) {
    resets.add(() => this.clear());
  }

  clear(): void {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.size = 0;
  }

  get(key: string): string | undefined {
    const item = this.entries.get(key);
    if (!item) return undefined;
    this.entries.delete(key);
    if (Date.now() >= item.expires) {
      this.size -= item.size;
      return undefined;
    }
    this.entries.set(key, item); // Least recently used entries stay first.
    return item.value;
  }

  set(key: string, value: string): void {
    const previous = this.entries.get(key);
    if (previous) this.size -= previous.size;
    this.entries.delete(key);
    // Conservative UTF-16 payload estimate, not a claim about total VM memory.
    const size = 2 * (key.length + value.length);
    if (size > this.maxBytes) return;
    this.entries.set(key, { value, expires: Date.now() + this.ttl, size });
    this.size += size;
    for (const [oldest, item] of this.entries) {
      if (this.entries.size <= this.limit && this.size <= this.maxBytes) break;
      this.entries.delete(oldest);
      this.size -= item.size;
    }
  }

  async load(key: string, read: () => Promise<string>): Promise<string> {
    const value = this.get(key);
    if (value !== undefined) return value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const generation = this.generation;
    // Bound bookkeeping even when many distinct requests arrive together.
    const retained = this.pending.size < 64;
    const promise = read().then((result) => {
      if (generation === this.generation) this.set(key, result);
      return result;
    });
    if (retained) this.pending.set(key, promise);
    try { return await promise; }
    finally { if (this.pending.get(key) === promise) this.pending.delete(key); }
  }
}
