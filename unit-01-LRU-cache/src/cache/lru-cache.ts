export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

interface Entry<K, V> {
  key: K;
  value: V;
  newer: Entry<K, V> | undefined;
  older: Entry<K, V> | undefined;
}

export class LruCache<K, V> {
  readonly #capacity: number;
  readonly #entries = new Map<K, Entry<K, V>>();
  #newest: Entry<K, V> | undefined;
  #oldest: Entry<K, V> | undefined;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("capacity must be a positive integer");
    }
    this.#capacity = capacity;
  }

  get(key: K): V | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      this.#misses += 1;
      return undefined;
    }

    this.#hits += 1;
    this.#promote(entry);
    return entry.value;
  }

  put(key: K, value: V): void {
    const existing = this.#entries.get(key);
    if (existing !== undefined) {
      existing.value = value;
      this.#promote(existing);
      return;
    }

    const entry: Entry<K, V> = {
      key,
      value,
      newer: undefined,
      older: undefined,
    };
    this.#entries.set(key, entry);
    this.#append(entry);

    if (this.#entries.size > this.#capacity) {
      this.#evictOldest();
    }
  }

  delete(key: K): boolean {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return false;
    }

    this.#detach(entry);
    return this.#entries.delete(key);
  }

  stats(): CacheStats {
    const requests = this.#hits + this.#misses;
    return {
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      hitRate: requests === 0 ? 0 : this.#hits / requests,
    };
  }

  #promote(entry: Entry<K, V>): void {
    if (entry === this.#newest) {
      return;
    }
    this.#detach(entry);
    this.#append(entry);
  }

  #append(entry: Entry<K, V>): void {
    entry.older = this.#newest;
    entry.newer = undefined;

    if (this.#newest !== undefined) {
      this.#newest.newer = entry;
    } else {
      this.#oldest = entry;
    }
    this.#newest = entry;
  }

  #detach(entry: Entry<K, V>): void {
    if (entry.older !== undefined) {
      entry.older.newer = entry.newer;
    } else {
      this.#oldest = entry.newer;
    }

    if (entry.newer !== undefined) {
      entry.newer.older = entry.older;
    } else {
      this.#newest = entry.older;
    }

    entry.older = undefined;
    entry.newer = undefined;
  }

  #evictOldest(): void {
    const victim = this.#oldest;
    if (victim === undefined) {
      return;
    }
    this.#detach(victim);
    this.#entries.delete(victim.key);
    this.#evictions += 1;
  }
}
