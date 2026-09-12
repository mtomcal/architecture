1. What runtime, TypeScript, package-manager, HTTP-framework, and test-runner choices are already established in the repository, and which of those choices remain unspecified? (`AGENTS.md:9`, `AGENTS.md:10`, `unit-01-LRU-cache/SCOPE.md:103`)

   Answer: Use the latest Node.js LTS release available when implementation begins, the latest stable TypeScript release, npm, Fastify, and Jest.

2. What does the current branch history show about the requirement to commit `SCOPE.md` before implementation begins? (`AGENTS.md:7`, `AGENTS.md:15`, `unit-01-LRU-cache/SCOPE.md:102`)

   Answer: `SCOPE.md` was committed on the unit branch before implementation began.

3. What product fields, inventory representation, initial records, and product-ID rules are currently defined for the fake store? (`unit-01-LRU-cache/SCOPE.md:17`, `unit-01-LRU-cache/SCOPE.md:18`, `unit-01-LRU-cache/SCOPE.md:65`, `unit-01-LRU-cache/SCOPE.md:70`)

   Answer: Model tabletop RPG sourcebooks with `id`, `title`, `description`, `inventory`, `priceCents`, and `shippingCostCents`. Inventory is a non-negative integer, and monetary values are integer cents. Seed 10 fictional books with human-readable sequential IDs from `book-001` through `book-010`. Product versions are covered by answer 9.

4. What HTTP routes, methods, request bodies, response bodies, status codes, and error shapes are currently specified for product reads, purchases, and cache statistics? (`unit-01-LRU-cache/SCOPE.md:17`, `unit-01-LRU-cache/SCOPE.md:20`, `unit-01-LRU-cache/SCOPE.md:51`)

   Answer: Defer the detailed HTTP contract to the planning and design phase. The failure-status decisions recorded in answer 10 remain constraints on that design.

5. What cache interface is currently defined for lookup, insertion, invalidation, and statistics, and how is purchase-driven invalidation represented when the stated public operations are `get`, `put`, and statistics? (`unit-01-LRU-cache/SCOPE.md:25`, `unit-01-LRU-cache/SCOPE.md:28`, `unit-01-LRU-cache/SCOPE.md:41`)

   Answer: Use a synchronous `Cache<K, V>` interface with `get(key): V`, `put(key, value): void`, `delete(key): void`, and `getStats(): Readonly<CacheStats>`. `get` returns the value or throws, `put` inserts a new value, `delete` provides purchase-driven invalidation and throws when the key is absent, and `getStats` returns `hits`, `misses`, `evictions`, and `hitRate` without resetting them.

6. What behavior is currently specified for zero or invalid capacity, missing keys, replacement of an existing key, eviction ties, and operations on an empty or single-entry cache? (`unit-01-LRU-cache/SCOPE.md:27`, `unit-01-LRU-cache/SCOPE.md:28`, `unit-01-LRU-cache/SCOPE.md:69`, `unit-01-LRU-cache/SCOPE.md:96`)

   Answer: Use fail-fast semantics. Construction throws unless capacity is a positive integer. A missing `get` or `delete` throws. `put` throws if the key already exists, so replacement requires an explicit `delete` followed by `put`. Invalid operations do not silently alter cache contents. Recency order makes eviction deterministic, and a capacity-one cache evicts its existing entry when a different key is inserted.

7. Which operations currently change recency order, and how are hits, misses, evictions, invalidations, overwrites, and the zero-request hit rate counted? (`unit-01-LRU-cache/SCOPE.md:20`, `unit-01-LRU-cache/SCOPE.md:28`, `unit-01-LRU-cache/SCOPE.md:73`, `unit-01-LRU-cache/SCOPE.md:108`)

   Answer: A successful `get` increments hits and promotes the entry to most-recently used. A missing `get` increments misses before throwing but does not change recency. A successful `put` inserts the entry as most-recently used and increments evictions only when it removes the least-recently used entry. A successful `delete` removes its entry but is not an eviction. Duplicate `put` operations are rejected, so overwrites are not counted. Other failed operations change neither recency nor statistics. `hitRate` is `hits / (hits + misses)`, or `0` when both counters are zero.

8. Which fake-store read paths currently incur the 80 ms delay, including successful reads, unknown-product reads, purchase validation, and test doubles? (`unit-01-LRU-cache/SCOPE.md:24`, `unit-01-LRU-cache/SCOPE.md:26`, `unit-01-LRU-cache/SCOPE.md:72`)

   Answer: Every authoritative store operation incurs the artificial 80 ms processing delay, including reads, writes, validations, and failed operations. Cache operations do not incur the delay.

9. What current mechanism makes an inventory decrement synchronous and atomic, and what behavior is defined for concurrent attempts to purchase the final unit? (`unit-01-LRU-cache/SCOPE.md:39`, `unit-01-LRU-cache/SCOPE.md:68`, `unit-01-LRU-cache/SCOPE.md:94`)

   Answer: Use optimistic concurrency control. Every product document returned by the API includes a version, and a purchase submits its expected version. The authoritative store atomically verifies the version and available inventory, decrements inventory, and advances the version. A version mismatch fails the write and requires the caller to refetch before retrying. Concurrent attempts against the final unit cannot both succeed. The authoritative store write is attempted independently of cache availability and always precedes cache invalidation.

10. What store-write and cache-invalidation failure mechanisms are currently representable, and what externally observable API and logging behavior is specified for each failure point? (`unit-01-LRU-cache/SCOPE.md:49`, `unit-01-LRU-cache/SCOPE.md:53`, `unit-01-LRU-cache/SCOPE.md:93`)

   Answer: Inject store-write and cache-invalidation failures through test doubles; do not add public failure-control endpoints. Use `404` for missing products, `409` for version or other write conflicts, and `500` for unexpected store failures. Log each failure in structured form so tests and operators can reconstruct what occurred. If the authoritative write succeeds but cache invalidation fails, keep the purchase successful and expose the invalidation failure through the log rather than changing the response to a failure.

11. What test structure, naming conventions, assertion style, and property-testing library already exist in the repository, and which cache, application, store, and HTTP boundaries can currently be tested independently? (`unit-01-LRU-cache/SCOPE.md:15`, `unit-01-LRU-cache/SCOPE.md:29`, `unit-01-LRU-cache/SCOPE.md:31`, `unit-01-LRU-cache/SCOPE.md:111`)

   Answer: Use BDD-style Jest tests and assertions, with `fast-check` for property-based testing. Test the cache bounded context and HTTP API bounded context through their public behavior rather than testing the individual internal pieces of each context independently.

12. Which LRU invariants and operation sequences are explicitly identified for example-based and property-based coverage, and which correctness cases are only implied by the scope? (`unit-01-LRU-cache/SCOPE.md:29`, `unit-01-LRU-cache/SCOPE.md:96`, `unit-01-LRU-cache/SCOPE.md:110`, `unit-01-LRU-cache/SCOPE.md:111`)

   Answer: Example-based tests cover insertion and successful lookup, promotion after `get`, deterministic LRU eviction, empty-cache and capacity-one behavior, missing `get` incrementing misses before throwing, missing `delete`, duplicate `put`, invalid capacity, failed-operation immutability, successful deletion, and statistics calculations. Property-based tests cover capacity bounds, key uniqueness, recency changes, failed-operation behavior, correct LRU eviction, and the hit-rate formula. They also compare generated operation sequences against a deliberately simple test-only reference model, checking results or errors, retained keys, the next eviction, and statistics after each step without asserting on private linked-list pointers.

13. What workload, concurrency, warm-up, duration, cache-capacity, dataset, output metrics, and environment details are currently defined for the pressure-test harness? (`unit-01-LRU-cache/SCOPE.md:30`, `unit-01-LRU-cache/SCOPE.md:72`, `unit-01-LRU-cache/SCOPE.md:97`, `unit-01-LRU-cache/SCOPE.md:112`)

   Answer: Target 500 requests per second for 30 seconds against the 10 seeded products, using a fixed random seed and cache capacity of 5. Run the primary read workload from a cold cache without warm-up. Report achieved requests per second, successful and failed request counts, hits, misses, evictions, and hit rate. Record the machine, Node.js version, and exact command for reproducibility without expanding the harness beyond these needs.

14. What TTL behavior, clock source, expiration semantics, statistics effects, and timebox cut criteria are currently specified? (`unit-01-LRU-cache/SCOPE.md:32`, `unit-01-LRU-cache/SCOPE.md:87`, `unit-01-LRU-cache/SCOPE.md:113`)

   Answer: If time remains, use system wall-clock time with configurable TTL and expiration jitter. Remove expired entries lazily when read; an expired `get` increments misses before throwing. Cut TTL entirely if the required core behavior and tests are not complete first.

15. What filename, format, and recording convention currently exists for the required narration transcript? (`AGENTS.md:13`, `AGENTS.md:17`, `unit-01-LRU-cache/SCOPE.md:115`)

   Answer: The narration is recorded separately on a phone. Do not create a narration transcript file in the repository.

16. What evidence and measured outputs are currently required for `README.md`, and what repository conventions distinguish observed results from synthetic inputs and production follow-up work? (`AGENTS.md:16`, `AGENTS.md:27`, `AGENTS.md:28`, `unit-01-LRU-cache/SCOPE.md:33`, `unit-01-LRU-cache/SCOPE.md:114`)

   Answer: Use the same workload to compare a warmed cache-hit path with a cache-bypassed path that reads directly from the delayed store. Report measured throughput and p90 response latency for both, along with cache hits, misses, evictions, and hit rate. Label the 80 ms store delay and generated workload as synthetic inputs, record the measurement environment and commands, and keep unmeasured production expectations in a separate follow-up discussion rather than presenting them as results.
