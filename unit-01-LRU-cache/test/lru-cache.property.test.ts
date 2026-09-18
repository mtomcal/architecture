import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { LruCache } from "../src/cache/lru-cache.js";

const distinctKeys = fc.uniqueArray(fc.integer({ min: 0, max: 100 }), {
  minLength: 2,
  maxLength: 12,
});

describe("LruCache properties", () => {
  it("keeps an entry that was read immediately before one overflow", () => {
    fc.assert(
      fc.property(distinctKeys, fc.nat(), (keys, selection) => {
        const cache = new LruCache<number, number>(keys.length);
        keys.forEach((key, index) => cache.put(key, index));
        const selectedIndex = selection % keys.length;
        const selectedKey = keys[selectedIndex]!;

        expect(cache.get(selectedKey)).toBe(selectedIndex);
        cache.put(101, 101);

        expect(cache.get(selectedKey)).toBe(selectedIndex);
        expect(cache.stats().evictions).toBe(1);
      }),
      { numRuns: 300 },
    );
  });

  it("keeps an entry that was updated immediately before one overflow", () => {
    fc.assert(
      fc.property(distinctKeys, fc.nat(), (keys, selection) => {
        const cache = new LruCache<number, number>(keys.length);
        keys.forEach((key, index) => cache.put(key, index));
        const selectedKey = keys[selection % keys.length]!;

        cache.put(selectedKey, -1);
        cache.put(101, 101);

        expect(cache.get(selectedKey)).toBe(-1);
        expect(cache.stats().evictions).toBe(1);
      }),
      { numRuns: 300 },
    );
  });

  it("counts membership queries as exactly one hit or miss", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 20 }), { maxLength: 10 }),
        fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 50 }),
        (storedKeys, queries) => {
          const cache = new LruCache<number, number>(Math.max(storedKeys.length, 1));
          const stored = new Set(storedKeys);
          storedKeys.forEach((key) => cache.put(key, key));

          queries.forEach((key) => cache.get(key));

          const expectedHits = queries.filter((key) => stored.has(key)).length;
          expect(cache.stats()).toEqual({
            hits: expectedHits,
            misses: queries.length - expectedHits,
            evictions: 0,
            hitRate: queries.length === 0 ? 0 : expectedHits / queries.length,
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});
