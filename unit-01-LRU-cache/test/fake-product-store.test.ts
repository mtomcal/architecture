import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FakeProductStore,
  InsufficientInventoryError,
  UnknownProductError,
} from "../src/store/fake-product-store.js";

const product = {
  id: "p-1",
  name: "Practice Widget",
  priceCents: 2500,
  inventory: 2,
};

describe("FakeProductStore", () => {
  afterEach(() => vi.useRealTimers());

  it("applies the default 80 ms artificial delay to reads", async () => {
    vi.useFakeTimers();
    const store = new FakeProductStore([product]);
    let settled = false;

    const read = store.getProduct(product.id).then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(79);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(read).resolves.toEqual(product);
  });

  it("checks availability and decrements in one synchronous transition", () => {
    const store = new FakeProductStore([product], { readDelayMs: 0 });

    expect(store.purchaseOne(product.id).inventory).toBe(1);
    expect(store.purchaseOne(product.id).inventory).toBe(0);
    expect(() => store.purchaseOne(product.id)).toThrow(
      InsufficientInventoryError,
    );
  });

  it("distinguishes an unknown product", () => {
    const store = new FakeProductStore([product], { readDelayMs: 0 });

    expect(() => store.purchaseOne("unknown")).toThrow(UnknownProductError);
  });

  it("does not expose mutable authoritative records", async () => {
    const store = new FakeProductStore([product], { readDelayMs: 0 });
    const firstRead = await store.getProduct(product.id);

    if (firstRead !== undefined) {
      firstRead.inventory = 0;
    }

    await expect(store.getProduct(product.id)).resolves.toEqual(product);
  });
});
