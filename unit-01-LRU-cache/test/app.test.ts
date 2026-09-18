import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { LruCache } from "../src/cache/lru-cache.js";
import {
  FakeProductStore,
  type Product,
  type ProductStore,
} from "../src/store/fake-product-store.js";

const products: Product[] = [
  { id: "p-1", name: "Widget", priceCents: 2500, inventory: 2 },
  { id: "p-2", name: "Gadget", priceCents: 1800, inventory: 1 },
  { id: "p-3", name: "Doodad", priceCents: 900, inventory: 4 },
];

describe("product read API", () => {
  it("populates on a miss and serves the next read from cache", async () => {
    const store = new FakeProductStore(products, { readDelayMs: 0 });
    const getProduct = vi.spyOn(store, "getProduct");
    const cache = new LruCache<string, Product>(2);
    const app = createApp({ store, cache });

    const first = await app.inject({ method: "GET", url: "/products/p-1" });
    const second = await app.inject({ method: "GET", url: "/products/p-1" });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual(products[0]);
    expect(second.json()).toEqual(products[0]);
    expect(getProduct).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toEqual({
      hits: 1,
      misses: 1,
      evictions: 0,
      hitRate: 0.5,
    });

    await app.close();
  });

  it("exercises LRU promotion and eviction through product reads", async () => {
    const store = new FakeProductStore(products, { readDelayMs: 0 });
    const getProduct = vi.spyOn(store, "getProduct");
    const cache = new LruCache<string, Product>(2);
    const app = createApp({ store, cache });

    for (const id of ["p-1", "p-2", "p-1", "p-3", "p-2"]) {
      expect(
        (await app.inject({ method: "GET", url: `/products/${id}` })).statusCode,
      ).toBe(200);
    }

    expect(getProduct).toHaveBeenCalledTimes(4);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 4, evictions: 2 });

    await app.close();
  });

  it("returns the error envelope for an unknown product", async () => {
    const app = createApp({
      store: new FakeProductStore(products, { readDelayMs: 0 }),
      cache: new LruCache(2),
    });

    const response = await app.inject({
      method: "GET",
      url: "/products/unknown",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "PRODUCT_NOT_FOUND", message: "Product unknown was not found" },
    });

    await app.close();
  });

  it("maps an authoritative read failure to 503", async () => {
    const store: ProductStore = {
      getProduct: vi.fn().mockRejectedValue(new Error("store unavailable")),
      purchaseOne: vi.fn(),
    };
    const app = createApp({ store, cache: new LruCache(2) });

    const response = await app.inject({ method: "GET", url: "/products/p-1" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "STORE_UNAVAILABLE",
        message: "The authoritative store is unavailable",
      },
    });

    await app.close();
  });
});
