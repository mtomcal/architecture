import { createApp } from "./app.js";
import { LruCache } from "./cache/lru-cache.js";
import {
  FakeProductStore,
  type Product,
} from "./store/fake-product-store.js";

const products: Product[] = [
  { id: "widget", name: "Practice Widget", priceCents: 2500, inventory: 10 },
  { id: "gadget", name: "Practice Gadget", priceCents: 1800, inventory: 5 },
  { id: "doodad", name: "Practice Doodad", priceCents: 900, inventory: 20 },
];

const port = Number(process.env.PORT ?? 3000);
const cacheCapacity = Number(process.env.CACHE_CAPACITY ?? 100);
const app = createApp({
  store: new FakeProductStore(products),
  cache: new LruCache(cacheCapacity),
  logger: true,
});

try {
  await app.listen({ host: "127.0.0.1", port });
} catch (cause) {
  app.log.error(cause);
  process.exitCode = 1;
}
