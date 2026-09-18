import { describe, expect, it } from "vitest";

import { LruCache } from "../src/cache/lru-cache.js";

describe("LruCache", () => {
  it("evicts the least recently used entry when capacity is exceeded", () => {
    const cache = new LruCache<string, number>(2);

    cache.put("first", 1);
    cache.put("second", 2);
    expect(cache.get("first")).toBe(1);

    cache.put("third", 3);

    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe(1);
    expect(cache.get("third")).toBe(3);
  });

  it("promotes an updated entry without evicting an extra entry", () => {
    const cache = new LruCache<string, number>(2);

    cache.put("first", 1);
    cache.put("second", 2);
    cache.put("first", 10);
    cache.put("third", 3);

    expect(cache.get("first")).toBe(10);
    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("third")).toBe(3);
  });

  it("deletes entries and handles list boundaries", () => {
    const cache = new LruCache<string, number>(2);

    cache.put("only", 1);
    expect(cache.delete("only")).toBe(true);
    expect(cache.delete("only")).toBe(false);
    expect(cache.get("only")).toBeUndefined();

    cache.put("new", 2);
    expect(cache.get("new")).toBe(2);
  });

  it("reports hits, misses, evictions, and a zero-safe hit rate", () => {
    const cache = new LruCache<string, number>(1);

    expect(cache.stats()).toEqual({
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
    });

    cache.put("first", 1);
    expect(cache.get("first")).toBe(1);
    expect(cache.get("missing")).toBeUndefined();
    cache.put("second", 2);

    expect(cache.stats()).toEqual({
      hits: 1,
      misses: 1,
      evictions: 1,
      hitRate: 0.5,
    });
  });

  it("rejects capacities that cannot bound the cache", () => {
    expect(() => new LruCache(0)).toThrow("capacity");
    expect(() => new LruCache(1.5)).toThrow("capacity");
  });
});
