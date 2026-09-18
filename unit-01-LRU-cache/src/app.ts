import Fastify, { type FastifyInstance } from "fastify";

import type { CacheStats } from "./cache/lru-cache.js";
import {
  InsufficientInventoryError,
  type Product,
  type ProductStore,
  UnknownProductError,
} from "./store/fake-product-store.js";

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

  app.post<{ Params: { id: string } }>(
    "/products/:id/purchase",
    async (request, reply) => {
      const { id } = request.params;
      let product: Product;

      try {
        product = store.purchaseOne(id);
      } catch (cause) {
        if (cause instanceof UnknownProductError) {
          return reply
            .code(404)
            .send(error("PRODUCT_NOT_FOUND", cause.message));
        }
        if (cause instanceof InsufficientInventoryError) {
          return reply
            .code(409)
            .send(error("INSUFFICIENT_INVENTORY", cause.message));
        }

        request.log.error({ cause, productId: id }, "authoritative write failed");
        return reply
          .code(503)
          .send(
            error("STORE_UNAVAILABLE", "The authoritative store is unavailable"),
          );
      }

      try {
        cache.delete(id);
      } catch (cause) {
        request.log.error({ cause, productId: id }, "cache invalidation failed");
      }

      return product;
    },
  );

  app.get("/cache/stats", async () => cache.stats());

  return app;
}
