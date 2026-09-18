# Unit 01: LRU Cache

A small Fastify API demonstrating cache-aside reads and authoritative-first inventory writes. The cache is a generic in-process `LruCache<K, V>` implemented with a `Map` and a doubly linked list; it is a module boundary, not a network service.

## Run it

Use Node.js 20 or 22. This unit was built and measured with Node.js 22.22.3.

```sh
npm install
npm test
npm run typecheck
npm run build
```

Start the server and leave it running:

```sh
npm start
```

The server listens on `127.0.0.1:3000`. `PORT` and `CACHE_CAPACITY` can override the defaults. Run the following from a second terminal:

```sh
curl http://127.0.0.1:3000/products/widget
curl -X POST http://127.0.0.1:3000/products/widget/purchase
curl http://127.0.0.1:3000/cache/stats
```

Successful product reads and purchases return a product object:

```json
{"id":"widget","name":"Practice Widget","priceCents":2500,"inventory":10}
```

Errors use `{ "error": { "code": string, "message": string } }`. Unknown products return `404`, insufficient inventory returns `409`, and failed authoritative operations return `503`.

## Architecture

The application layer owns the cache-aside policy:

```text
GET /products/:id
  -> LruCache.get
     -> hit: return cached product
     -> miss: FakeProductStore.getProduct (80 ms artificial delay)
               -> LruCache.put -> return product

POST /products/:id/purchase
  -> FakeProductStore.purchaseOne (synchronous check + decrement)
     -> success: best-effort LruCache.delete -> return updated product
     -> failure: return an error; do not touch the cache
```

`LruCache` maps keys to linked-list nodes. The list orders entries from least to most recently used. Hash lookup plus constant-time detach/append operations make `get`, `put`, and `delete` average O(1). `get` and both insert/update forms of `put` promote an entry. Statistics are cumulative for the process lifetime.

The fake store owns authoritative product state. `purchaseOne` has no `await` between checking inventory and decrementing it, so the transition cannot interleave in this single Node.js process. Store reads return copies so cached product objects do not alias authoritative records.

## Tests and TDD

The implementation was developed in vertical red/green slices: cache, store, cached reads, purchases, and statistics. The final suite has 23 example and property tests. Examples cover linked-list boundaries, ordering, eviction, cache-aside hits/misses, HTTP errors, authoritative inventory checks, invalidation, and the accepted invalidation-failure behavior.

After the examples passed, 900 generated property cases check model-free invariants: a just-read entry survives one overflow, a just-updated entry survives one overflow, and independently counted membership queries match hit/miss statistics. This avoids using a second LRU implementation as a potentially correlated oracle.

## Measured behavior

Run the reproducible harness with:

```sh
npm run pressure
```

Optional `REQUESTS`, `CONCURRENCY`, and `READ_DELAY_MS` environment variables change its inputs. The harness starts the real Fastify HTTP listener on an ephemeral localhost port and issues the same round-robin five-product workload twice.

One observed run on 2026-09-18 used Node.js v22.22.3 on `darwin/arm64`, 200 requests, concurrency 10, five products, and the artificial 80 ms store-read delay:

| Scenario | Capacity | Elapsed | Requests/s | Hits | Misses | Evictions | Hit rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Thrashing cache | 1 | 1,461.9 ms | 136.8 | 33 | 167 | 165 | 16.5% |
| Working set fits | 5 | 141.7 ms | 1,411.5 | 190 | 10 | 0 | 95.0% |

These are local demonstration numbers, not production capacity estimates. The roughly 10.3x throughput difference is dominated by the deliberately inserted delay. The fit case has ten rather than five cold misses because concurrent requests can observe the same empty cache before an earlier store read populates it; request coalescing is intentionally out of scope.

## Tradeoffs and failure modes

- Reads are eventually consistent. A successful purchase updates the store before invalidating the cache, leaving a small stale-read window.
- If invalidation throws after a store update, the purchase still succeeds and the failure is logged. This can serve stale inventory but is not a lost write.
- If the authoritative read or write throws, the API returns `503`. A failed write never reports success.
- Purchases never use cached inventory for their decision, preventing overselling based on a stale cache value.
- The cache is process-local and disappears on restart. Multiple replicas would have independent, potentially inconsistent caches.
- Cache misses are not coalesced, so a cold or newly invalidated hot key can cause a read stampede.
- Statistics are process-local counters and are not durable or aggregated.
- Cached objects have no general ownership or immutability guarantee; this unit only prevents store/cache aliasing at the fake-store boundary.

TTL was deliberately cut after the required core behavior, failure paths, property tests, and measurement harness were complete. It is optional in the scope, and adding time semantics would expand the correctness surface.

## Production follow-up

A production version would need durable transactional storage, idempotency keys for purchase retries, authentication and authorization, input and response schemas, structured metrics and tracing, dependency/security maintenance, graceful shutdown, and deployment configuration. Depending on scale and staleness tolerance, it could also require a shared cache, bounded TTLs, invalidation retries or events, request coalescing, and cache-failure circuit breaking. Those concerns are documented rather than implemented in this timeboxed unit.
