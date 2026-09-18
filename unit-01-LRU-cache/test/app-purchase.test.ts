import { describe, expect, it, vi } from "vitest";

import { createApp, type ProductCache } from "../src/app.js";
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

describe("purchase API", () => {
  it("updates the store first, invalidates the cache, and refreshes the next read", async () => {
    const store = new FakeProductStore(products, { readDelayMs: 0 });
    const getProduct = vi.spyOn(store, "getProduct");
    const cache = new LruCache<string, Product>(2);
    const app = createApp({ store, cache });

    expect(
      (await app.inject({ method: "GET", url: "/products/p-1" })).json(),
    ).toMatchObject({ inventory: 2 });

    const purchase = await app.inject({
      method: "POST",
      url: "/products/p-1/purchase",
    });
    const refreshed = await app.inject({ method: "GET", url: "/products/p-1" });

    expect(purchase.statusCode).toBe(200);
    expect(purchase.json()).toMatchObject({ id: "p-1", inventory: 1 });
    expect(refreshed.json()).toMatchObject({ inventory: 1 });
    expect(getProduct).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it("never decides availability from a stale cached value", async () => {
    const store = new FakeProductStore(products, { readDelayMs: 0 });
    const cache = new LruCache<string, Product>(2);
    cache.put("p-1", { ...products[0]!, inventory: 0 });
    const app = createApp({ store, cache });

    const response = await app.inject({
      method: "POST",
      url: "/products/p-1/purchase",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ inventory: 1 });
    expect(cache.get("p-1")).toBeUndefined();

    await app.close();
  });

  it.each([
    {
      id: "unknown",
      status: 404,
      body: {
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "Product unknown was not found",
        },
      },
    },
    {
      id: "sold-out",
      status: 409,
      body: {
        error: {
          code: "INSUFFICIENT_INVENTORY",
          message: "Product sold-out has no inventory available",
        },
      },
    },
  ])("returns $status for $id", async ({ id, status, body }) => {
    const store = new FakeProductStore(
      [
        ...products,
        {
          id: "sold-out",
          name: "Gone",
          priceCents: 100,
          inventory: 0,
        },
      ],
      { readDelayMs: 0 },
    );
    const app = createApp({ store, cache: new LruCache(2) });

    const response = await app.inject({
      method: "POST",
      url: `/products/${id}/purchase`,
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual(body);
    await app.close();
  });

  it("maps an authoritative write failure to 503", async () => {
    const store: ProductStore = {
      getProduct: vi.fn(),
      purchaseOne: vi.fn(() => {
        throw new Error("disk unavailable");
      }),
    };
    const app = createApp({ store, cache: new LruCache(2) });

    const response = await app.inject({
      method: "POST",
      url: "/products/p-1/purchase",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "STORE_UNAVAILABLE",
        message: "The authoritative store is unavailable",
      },
    });
    await app.close();
  });

  it("keeps a successful purchase successful when invalidation fails", async () => {
    const backingCache = new LruCache<string, Product>(2);
    const cache: ProductCache = {
      get: (key) => backingCache.get(key),
      put: (key, value) => backingCache.put(key, value),
      delete: () => {
        throw new Error("cache unavailable");
      },
      stats: () => backingCache.stats(),
    };
    const app = createApp({
      store: new FakeProductStore(products, { readDelayMs: 0 }),
      cache,
    });

    const response = await app.inject({
      method: "POST",
      url: "/products/p-1/purchase",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ inventory: 1 });
    await app.close();
  });
});
