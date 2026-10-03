# Build Narration Transcript

## 00:00 — Scope and baseline

I read the repository instructions and reviewed `SCOPE.md` against the supplied corpus before implementation. The scope is internally consistent: a missing lexical result has a deliberate successful fallback, while database and model failures are explicit errors. The corpus has one uniform metadata line per file and one deliberately superseded cargo-claims revision. I committed the planning document and all supplied corpus files before writing code, excluding `.DS_Store` files.

## 00:10 — Small architecture choice

I kept one Fastify process and used Node's built-in `node:sqlite` API for an in-memory FTS5 index. That avoids a native package and durable database lifecycle. The boundary is split into corpus parsing, retrieval, prompt construction, model access, orchestration, and HTTP handling so model behavior can be replaced with deterministic fakes in tests without creating a larger abstraction hierarchy.

## 00:25 — Retrieval and corpus behavior

The loader fails on malformed metadata and keeps only current documents. FTS5 stores one row per full document. An early real retrieval probe showed that plain tokenization ranked related documents above the Detention document for the stated example. I switched the FTS5 tokenizer to Porter stemming and weighted the title. This kept the fixed top-three result set and avoided adding the explicitly out-of-scope reranker.

## 00:35 — Grounding gate

Generation gets only the question, bounded retrieved text, and grounding instructions. It must put a concrete document ID after each factual claim. Verification is a separate Ollama request with a JSON schema. The service allows one regeneration with verifier findings and then fails closed. It independently rejects missing or unknown citation IDs and creates response citations only from retrieved document metadata.

## 00:50 — Focused tests

I added tests for metadata parsing, malformed metadata, superseded exclusion, relevant and empty retrieval, prompt content and bounds, citation mapping, model-free fallback, verification success, one regeneration, missing citations, repeated rejection, request limits, HTTP success, and unavailable Ollama behavior. The suite used the same Vitest and Fastify choices as Unit 1.

## 01:00 — Real model exercise

Ollama was available locally with `qwen3:8b`. The first end-to-end detention request failed closed with HTTP 502. Inspection showed the generated citation format was semantically clear but did not match the application's strict parser. I made the prompt's expected syntax concrete and accepted the model's equivalent `Doc ID:` prefix.

The next cargo-claims exercise exposed verifier false negatives: the verifier said several facts were missing even though they appeared directly in the current policy. I did not weaken or bypass the verifier. Instead, I limited generation to the asked question and three sentences, and passed only documents actually cited by the draft into verification. This matches the scoped verification boundary and removed distracting related policies.

## 01:15 — Receipts and documentation

The final real requests returned verified current-policy answers for detention and cargo claims. The unrelated question took the exact model-free fallback path. A second server configured with an unreachable Ollama URL returned 503 without answer content. I recorded those observed timings in the README, along with the initial failed-closed tuning run, Node's experimental SQLite warning, and the npm audit result.

## Explicit cuts

I did not add chunking, embeddings, reranking, a general evaluation harness, a UI, streaming, model routing, persistence, concurrency management, or production security controls. Those would dilute the unit's central demonstration: bounded lexical retrieval and a claim-verification release gate.
