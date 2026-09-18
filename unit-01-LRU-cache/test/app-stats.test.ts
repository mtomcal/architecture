import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { LruCache } from "../src/cache/lru-cache.js";
import {
  FakeProductStore,
  type Product,
} from "../src/store/fake-product-store.js";

const products: Product[] = [
  { id: "p-1", name: "Widget", priceCents: 2500, inventory: 2 },
];

describe("cache statistics API", () => {
  it("reports live cache statistics", async () => {
    const app = createApp({
      store: new FakeProductStore(products, { readDelayMs: 0 }),
      cache: new LruCache(2),
    });

    await app.inject({ method: "GET", url: "/products/p-1" });
    await app.inject({ method: "GET", url: "/products/p-1" });
    const response = await app.inject({ method: "GET", url: "/cache/stats" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      hits: 1,
      misses: 1,
      evictions: 0,
      hitRate: 0.5,
    });
    await app.close();
  });
});
