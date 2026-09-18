# Build Narration Transcript

## Opening

I am keeping the unit centered on one architectural claim: reads may use a disposable cache, but inventory changes must go through the authoritative store. I will build that claim in thin vertical slices and stop before optional TTL if the required behavior consumes the timebox.

## Slice 1: generic LRU cache

Red: I wrote examples for capacity, read promotion, update promotion, eviction, deletion at list boundaries, statistics, and invalid capacity. The suite failed because the cache module did not exist.

Green: I added a generic cache with a `Map` from key to node and a doubly linked list from oldest to newest. The behavior examples passed. Strict TypeScript then caught that optional link fields were too narrow under `exactOptionalPropertyTypes`; changing the links and head/tail fields to explicit `Entry | undefined` unions made both tests and typechecking green.

After the examples passed, I added property tests. The initial idea used a small reference LRU, but that repeated the same algorithm and could share its defects. I replaced it with independent invariants: read and update promotion must protect an entry from the next overflow, and membership queries must exactly account for hits and misses. The resulting 900 generated cases stay fast.

## Slice 2: authoritative fake store

Red: store tests failed on the missing store boundary. They specified an 80 ms delayed read, a synchronous availability-check-and-decrement transition, distinct unknown and insufficient-inventory failures, and isolation of authoritative records from returned objects.

Green: I implemented `FakeProductStore`. Only reads await the synthetic timer. `purchaseOne` contains the lookup, availability check, and decrement without an `await`, then returns a copy.

## Slice 3: cache-aside product reads

Red: integration tests failed because the Fastify application did not exist. They drove two reads through the HTTP boundary, exercised LRU eviction using three products and capacity two, and required the 404 and 503 JSON envelopes.

Green: I added `createApp`, keeping the store and generic cache behind small injected interfaces. The route checks the cache, calls the store only on a miss, populates only successful product reads, and maps a store exception to `503`.

## Slice 4: authoritative purchases and statistics

Red: seven HTTP tests received Fastify's default route-not-found response. The tests required store-first purchase behavior, cache invalidation, stale-cache independence, 404/409/503 responses, successful writes despite invalidation failure, and live cache statistics.

Green: I added the purchase and statistics routes. The purchase route calls `purchaseOne` without reading the cache. It invalidates only after success, logs and tolerates invalidation exceptions, and maps domain failures explicitly. All 23 tests then passed.

## Slice 5: runnable system and measurement

I added the production entry point and a dependency-free pressure harness. The first harness run was blocked because the sandbox disallowed binding localhost; after explicit approval, the real Fastify listener ran on an ephemeral port.

With 200 requests at concurrency 10 over five products and an 80 ms artificial store delay, capacity one measured 136.8 requests per second and a 16.5% hit rate. Capacity five measured 1,411.5 requests per second and a 95.0% hit rate. The ten cold misses in the fit case show a cache-aside stampede under concurrent startup; I am documenting that rather than adding request coalescing outside scope.

## Close

The required cache, store, API, failure handling, example tests, property tests, harness, and documentation are complete. I am cutting optional TTL. This preserves the timebox and avoids adding clock and expiry edge cases after the core demonstration is already coherent.
