# Unit 01: LRU Cache

## Timebox

90 minutes.

## Goal

Build a tiny fake e-commerce HTTP API backed by an artificial slow store to demonstrate a cache-aside architecture. The application will use an in-memory LRU cache implemented from scratch in TypeScript on Node.js as a separate module and bounded context.

The unit is intended to demonstrate cache behavior, service boundaries, failure handling, and the consistency tradeoffs of cache-aside—not to build a production-ready store.

## Scope

- Create one Node.js HTTP service using TypeScript, Fastify, npm, and Vitest, with separate application, store, and cache boundaries. This establishes the HTTP framework, package manager, and test runner for later units.
- Keep the LRU cache in its own module and bounded context. It is in-process and in-memory, not a separately deployed service.
- Expose the smallest useful store workflow through a fixed HTTP contract:
  - `GET /products/:id` reads a product and its current inventory;
  - `POST /products/:id/purchase` attempts to purchase one unit of a product;
  - `GET /cache/stats` reports cache hits, misses, evictions, and hit rate.
- Return JSON error envelopes in the form `{ "error": { "code": string, "message": string } }`. Use conventional HTTP statuses, including `404` for an unknown product, `409` for insufficient inventory, and `503` when the authoritative store operation fails.
- Use cache-aside for product reads:
  1. the application asks the cache module for the product;
  2. on a cache hit, the API returns the cached value;
  3. on a cache miss, the API calls the authoritative fake store, returns the value, and populates the cache.
- On a successful purchase, update the authoritative store first and then invalidate the cached product entry with `delete`.
- Make `store.purchaseOne(productId)` the sole inventory transition. It must perform the availability check and decrement atomically, without an `await` between them.
- Simulate slow authoritative reads with an artificial 80 ms delay so cache hits and misses perform observably different work. Do not apply this synthetic delay to purchases.
- Implement the cache's LRU eviction policy from scratch using a hash map plus a doubly linked list.
- Implement the cache as a reusable generic `LruCache<K, V>` with public `get`, `put`, `delete`, and `stats` operations. `get`, `put`, and `delete` must run in average O(1) time, with `get` and `put` updating recency order.
- Add focused automated tests for LRU ordering and eviction, cache hit and miss behavior, purchase-driven invalidation, and statistics.
- Build a pressure-test harness to exercise the API and collect reproducible throughput and cache-effectiveness measurements.
- Develop the core behavior with red-green TDD. Add property-based tests after the example-based core tests pass.
- Add TTL only after the non-TTL cache is correct and tested. Cut TTL if the 90-minute timebox expires first.
- Record observed behavior and any measured numbers in `README.md` after implementation.

## Consistency Model

The authoritative product and inventory state lives in the store API's data store. The cache is disposable and must never be treated as the source of truth for a purchase.

Reads are eventually consistent. A product response can be stale between a successful inventory change and cache invalidation, or when invalidation fails. A purchase must validate inventory against the authoritative store before it succeeds.

The cache is separated from store and application concerns by a module boundary, not a network boundary. The application owns the cache-aside policy; domain code should depend on the generic cache module's small public interface rather than on its hash map or linked-list implementation.

## Cost of a Stale Read

A stale inventory read can tell a shopper that an item is available after another shopper has bought the last unit. The first shopper may spend time making a purchase that is then rejected when the store checks authoritative inventory. The cost is a poor user experience, reduced trust in availability information, and an extra request—not overselling inventory.

For this unit, that cost is acceptable because inventory is revalidated during purchase. Returning stale availability is tolerated; accepting a purchase based only on stale cached inventory is not.

## Write Failure Semantics

A failed authoritative inventory update must fail the purchase and return an error so the shopper can retry. The API must not report success until the authoritative write succeeds.

If the authoritative write succeeds but cache invalidation fails, the purchase remains successful and the cache may temporarily serve stale data. This is an accepted cache-aside failure mode and must not be described as a lost write. A truly acknowledged-but-lost purchase write is out of tolerance for this unit.

Client retries can create duplicate purchase attempts, so production would require idempotency. Implementing idempotency is outside this unit's timebox.

## Why Cache-Aside

Cache-aside keeps persistence authoritative and puts cache population and invalidation policy in the application layer. It prevents the cache from becoming the system of record and keeps the cache implementation replaceable behind a small interface.

Write-behind is not selected because it would acknowledge work before the authoritative store is updated, introduce asynchronous delivery and recovery concerns, and create a greater risk of lost writes. Those mechanisms are unnecessary for this demonstration.

## Assumptions

- Product and inventory data may be held in memory; durability across process restarts is not required.
- The exercise runs locally with a single API process and an in-process cache instance.
- A purchase requests one unit at a time.
- Inventory updates go through `store.purchaseOne(productId)` and are synchronous and atomic for this single-process demonstration.
- Cache capacity is configurable and small enough that an in-memory implementation is appropriate.
- Cache entries contain whole product-read responses keyed by product ID.
- The cache may be empty after restart without affecting correctness.
- The fake store's 80 ms delay is synthetic and exists to make the cache's effect observable; it is not presented as a production latency measurement.
- Hit rate is derived from recorded hits and misses and has a defined zero-request result.

## Non-Goals

- Production persistence or database integration.
- Redis, Memcached, or any other external cache or data service.
- Payments, carts, customers, authentication, authorization, shipping, or order fulfillment.
- Distributed cache replication, sharding, leader election, or cross-region behavior.
- Multiple API replicas or coordination between cache instances.
- Write-through or write-behind caching.
- Preventing every stale read or guaranteeing read-your-writes consistency.
- Overselling based on cached inventory.
- Retry queues, idempotency keys, distributed transactions, or exactly-once processing.
- Cache warming, compression, persistence, or advanced eviction policies.
- A formal immutable data model, generalized defensive copying, or public value-ownership guarantees for cached objects.
- Treating TTL as required if the core implementation and tests consume the timebox.
- Production observability, security hardening, deployment automation, or load testing.

## Risks and Mitigations

- **Stale inventory:** invalidation is not atomic with the store update. Mitigation: revalidate inventory against the authoritative store during purchase.
- **Invalidation failure:** a completed purchase can leave stale cached inventory. Mitigation: make invalidation best-effort, expose the failure in logs, and document TTLs or retryable invalidation as production follow-up work.
- **Concurrent purchases:** naive read-then-write logic could oversell. Mitigation: keep the authoritative inventory decrement atomic in the store process and test the zero-inventory boundary.
- **Duplicate retries:** a client retry after an ambiguous response could repeat a purchase. Mitigation: document idempotency keys as required production work.
- **Linked-list defects:** pointer updates can corrupt recency order or retain evicted entries. Mitigation: drive insertion, update, promotion, eviction, and boundary cases with tests before HTTP integration.
- **Misleading benchmark results:** the artificial delay and local pressure test do not predict production performance. Mitigation: document the harness, inputs, environment, and measured results without generalizing beyond them.
- **Timebox pressure:** HTTP plumbing, measurement, and optional features could crowd out the core LRU work. Mitigation: use an in-memory store and minimal endpoints; cut TTL before cutting core correctness tests.

## Definition of Done

- `SCOPE.md` is committed before implementation.
- The API runs locally using TypeScript on Node.js with Fastify, npm, and Vitest.
- The generic `LruCache<K, V>` module uses a hash map plus a doubly linked list and implements average O(1) `get`, `put`, and `delete` operations.
- The API implements the fixed product, purchase, and cache-statistics routes and returns the defined JSON error envelope with the appropriate HTTP status.
- Product reads demonstrate cache miss, cache population, cache hit, and LRU eviction.
- A successful purchase atomically updates authoritative inventory through `store.purchaseOne(productId)` and then attempts cache invalidation.
- A purchase cannot succeed from cached inventory alone.
- The statistics endpoint reports hits, misses, evictions, and hit rate.
- The fake slow store applies an artificial 80 ms read delay.
- Automated example-based tests cover the scoped correctness and failure cases using red-green TDD.
- Property-based tests exercise LRU invariants after the core behavior is passing.
- The pressure-test harness produces reproducible measurements suitable for the README.
- TTL is implemented only if time remains after the required behavior is correct and tested.
- `README.md` documents the architecture, tradeoffs, failure modes, measured results, and production follow-up work.
- A narration transcript is included for the build.
