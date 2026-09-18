import { createApp } from "../dist/app.js";
import { LruCache } from "../dist/cache/lru-cache.js";
import { FakeProductStore } from "../dist/store/fake-product-store.js";

const totalRequests = Number(process.env.REQUESTS ?? 200);
const concurrency = Number(process.env.CONCURRENCY ?? 10);
const readDelayMs = Number(process.env.READ_DELAY_MS ?? 80);
const productCount = 5;
const products = Array.from({ length: productCount }, (_, index) => ({
  id: `p-${index}`,
  name: `Product ${index}`,
  priceCents: 1000 + index,
  inventory: 100,
}));

async function runScenario(name, cacheCapacity) {
  const cache = new LruCache(cacheCapacity);
  const app = createApp({
    store: new FakeProductStore(products, { readDelayMs }),
    cache,
  });
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  let nextRequest = 0;

  const started = process.hrtime.bigint();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextRequest < totalRequests) {
        const requestNumber = nextRequest;
        nextRequest += 1;
        const productId = products[requestNumber % productCount].id;
        const response = await fetch(`${address}/products/${productId}`);
        if (!response.ok) {
          throw new Error(`request failed with ${response.status}`);
        }
        await response.arrayBuffer();
      }
    }),
  );
  const elapsedSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  const stats = cache.stats();
  await app.close();

  return {
    name,
    cacheCapacity,
    elapsedMs: Number((elapsedSeconds * 1000).toFixed(1)),
    requestsPerSecond: Number((totalRequests / elapsedSeconds).toFixed(1)),
    ...stats,
  };
}

const results = {
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    totalRequests,
    concurrency,
    productCount,
    artificialReadDelayMs: readDelayMs,
  },
  scenarios: [
    await runScenario("thrashing-cache", 1),
    await runScenario("working-set-fits", productCount),
  ],
};

console.log(JSON.stringify(results, null, 2));
