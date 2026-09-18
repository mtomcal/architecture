import Fastify, { type FastifyInstance } from "fastify";

import type { CacheStats } from "./cache/lru-cache.js";
import type { Product, ProductStore } from "./store/fake-product-store.js";

export interface ProductCache {
  get(key: string): Product | undefined;
  put(key: string, value: Product): void;
  delete(key: string): boolean;
  stats(): CacheStats;
}

interface AppDependencies {
  store: ProductStore;
  cache: ProductCache;
  logger?: boolean;
}

function error(code: string, message: string) {
  return { error: { code, message } };
}

export function createApp({
  store,
  cache,
  logger = false,
}: AppDependencies): FastifyInstance {
  const app = Fastify({ logger });

  app.get<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
    const { id } = request.params;
    const cached = cache.get(id);
    if (cached !== undefined) {
      return cached;
    }

    let product: Product | undefined;
    try {
      product = await store.getProduct(id);
    } catch (cause) {
      request.log.error({ cause, productId: id }, "authoritative read failed");
      return reply
        .code(503)
        .send(
          error("STORE_UNAVAILABLE", "The authoritative store is unavailable"),
        );
    }

    if (product === undefined) {
      return reply
        .code(404)
        .send(error("PRODUCT_NOT_FOUND", `Product ${id} was not found`));
    }

    cache.put(id, product);
    return product;
  });

  return app;
}
