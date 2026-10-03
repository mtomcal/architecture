# Unit 02: RAG Retrieval

## Timebox

Target: 90 minutes. Prioritize a complete, explainable retrieval path, grounded answers, focused tests, and clear failure behavior over production features.

## Scope

Build a small local HTTP service for Kestrel Freight Lines that answers questions from the supplied Markdown policy corpus.

The service will use TypeScript on Node.js, Fastify, npm, Vitest, SQLite FTS5 for lexical retrieval, and the local Ollama `qwen3:8b` model for answer generation. It will run as one process and expose one query endpoint.

In scope:

- Load the Markdown files in `corpus/` into an ephemeral SQLite FTS5 index at startup, with one searchable row per document.
- Preserve enough document metadata to identify the title, document ID, revision, status, and source file in results.
- Exclude documents marked as superseded from retrieval.
- Accept a question through `POST /query`.
- Retrieve a small, fixed number of relevant documents with FTS5.
- Send only the question, retrieved context, and grounding instructions to the local Qwen model through Ollama.
- Make a second Qwen call that checks the draft answer claim by claim against the cited source text before anything is returned to the caller.
- If verification fails, regenerate once using the verifier's findings and verify the replacement. If the replacement still fails, return an API error without an answer.
- Return the generated answer with citations identifying the retrieved source documents.
- Return explicit errors when retrieval or generation cannot complete; do not silently produce an ungrounded fallback answer.
- Add focused tests around ingestion, retrieval, prompt construction, citations, and HTTP failure behavior.

## Path

The end-to-end hot path is:

1. At startup, read the corpus, parse each document's metadata, discard superseded documents, and build the in-memory FTS5 index.
2. A caller sends a question to `POST /query`.
3. The service validates and normalizes the question.
4. FTS5 retrieves the most relevant current documents.
5. The service constructs a bounded prompt containing the question and retrieved documents.
6. Ollama runs `qwen3:8b` locally and returns a draft answer grounded in that context.
7. A separate Qwen call checks every factual claim in the draft against the cited retrieved text.
8. If the check fails, regenerate and verify one more time. If the retry also fails, return an error without exposing either unsupported answer.
9. The service returns only a verified answer plus its source citations.

Example hot path:

- Question: "How is detention billed after the free period?"
- Retrieval: the query matches the current Detention policy, document `KFL-OPS-01`.
- Generation: Qwen receives that policy and drafts a summary of the two-hour free period, the $75 hourly rate in 15-minute increments, the eight-hour cap, and the required signed or stamped in/out times.
- Verification: a separate Qwen call checks those claims against the cited text from `KFL-OPS-01`.
- Response: the service returns the verified answer with the citation and does not expose a draft containing policy absent from the retrieved document.

## Invariants

- Every factual answer must be grounded in retrieved corpus text.
- Every citation must refer to a document actually included in the model prompt.
- No generated answer may leave the service until a separate verification call confirms that its factual claims are supported by its cited source text.
- Verification must inspect only the question, draft answer, citations, and cited source text; it must not introduce outside knowledge.
- A failed verification gets at most one regeneration attempt. A second failure must return an error without an answer.
- Superseded documents must not be eligible retrieval sources. A cargo-claims question must use the current 2025 revision, not the superseded 2024 revision.
- An empty or unusable retrieval result must return exactly: "Not in the handbook. Please consult the proper web portal." It must not call the generation or verification model.
- Retrieval limits and prompt size must be fixed and bounded.
- Corpus documents and user questions are untrusted data, not executable instructions.
- The service must not require an external model API or send corpus content off the machine.
- A model or database failure must be visible to the caller and must not be presented as a successful answer.

## Degradation

- **Ollama unavailable or model missing:** return `503`; do not fall back to an ungrounded answer.
- **Model timeout or malformed response:** return a generation error and log the failure without exposing the full prompt.
- **Unsupported generated answer:** regenerate and re-check once. If the second answer is still unsupported, return an API error without answer content.
- **Verifier timeout or malformed result:** return an API error; do not assume the draft passed.
- **Frequent verification rejection:** treat repeated rejection of otherwise answerable handbook questions as a prompt-design problem. Tighten the generation and verification system prompts, shorten the requested answer, and make the verifier return a structured reason before adding retries or weakening the grounding gate.
- **SQLite or corpus initialization failure:** fail startup rather than serve an incomplete index.
- **Malformed document metadata:** fail startup with the affected source file identified so corpus state is explicit.
- **Weak lexical match:** return "Not in the handbook. Please consult the proper web portal." FTS5 will miss semantic matches that do not share useful terms; that limitation is accepted for this unit.
- **Multi-document comparison phrasing:** a comparative question can retrieve one relevant policy while lexical noise or a compound spelling such as `freetime` pushes the other relevant policy below the fixed top-three cutoff. Query rewriting, synonym expansion, and corpus-specific term normalization are deferred rather than adding a brittle fix inside the timebox. A production iteration should use hybrid retrieval: combine semantic results from embeddings in a vector database with BM25 candidates, then rerank the merged set before constructing context.
- **Large or adversarial input:** reject requests over a small configured body/question limit.
- **Long retrieved documents:** cap the result count and prompt size; truncation may reduce answer completeness but must not invent missing facts.
- **Concurrent requests:** the local model may serialize or slow under load. Capacity management is documented as production work, not solved here.

## Entry Paths and Access Concerns

Implemented entry paths are intentionally narrow:

- HTTP input through `POST /query`.
- Read-only startup access to the checked-in `corpus/` directory.
- Local HTTP access from the service to Ollama on its loopback address.

This exercise will not implement authentication or authorization. A production service would require authenticated callers, authorization to the appropriate policy set, tenant separation, rate limiting, request-size limits, abuse controls, timeouts, and audit logging.

Production hardening would also treat both questions and corpus text as prompt-injection inputs, enforce corpus provenance and update permissions, restrict model-network egress, redact sensitive prompt data from logs, allowlist readable files, and define retention rules for questions and answers. These concerns are documented only and are outside the timebox.

## Receipts

Success will be demonstrated with observable, repeatable evidence:

- `npm test` passes focused Vitest tests for metadata parsing, exclusion of superseded documents, relevant FTS5 retrieval, empty retrieval, prompt grounding, citation mapping, verification success, one bounded regeneration, repeated verification failure, successful HTTP responses, and Ollama failure behavior.
- The TypeScript project builds without errors.
- A real local request using `qwen3:8b` answers the detention example with a non-empty grounded response and a citation to `KFL-OPS-01`.
- A cargo-claims request cites the current policy and does not cite the superseded 2024 policy.
- A question outside the corpus returns exactly "Not in the handbook. Please consult the proper web portal." without invoking either model call.
- A deliberately unsupported draft is withheld, regenerated once, and returned only if the second verification passes.
- Two failed verification checks produce an API error with no generated answer in the response.
- The detention and current cargo-claims examples complete without exhausting the verification retry, demonstrating that the safety gate does not make the known happy paths unusable.
- A stopped or unreachable Ollama service produces the documented error response.
- The README records only commands and measurements actually observed during the build.

This unit will not include a general evaluation harness or claim model-quality metrics. The receipts prove the scoped paths and invariants, not broad answer quality.

## Assumptions

- The supplied corpus is small, local, and stable during a process run.
- Documents use the visible title and metadata format already present in the corpus.
- One document is small enough to serve as one FTS5 retrieval unit; chunking is unnecessary for this corpus.
- Ollama is already installed locally, its API is reachable on the loopback interface, and `qwen3:8b` is available.
- The service runs locally as a single process for demonstration.
- SQLite durability is unnecessary because the index can be rebuilt from the corpus at startup.
- A small fixed top-k result set is enough for the demonstration.

## Non-Goals

- Embeddings, vector search, a vector database, hybrid retrieval, or semantic search.
- Re-ranking retrieved documents.
- Query rewriting, synonym expansion, or corpus-specific spelling normalization.
- A model-quality evaluation harness, benchmark dataset, or quality score.
- Authentication, authorization, tenant isolation, or user management.
- A browser UI, chat interface, or conversation history.
- Streaming responses or multi-turn memory.
- Corpus upload, editing, watching, hot reload, or incremental indexing.
- Document chunking or generalized parsing for arbitrary file formats.
- Remote model providers, model routing, fallback models, or fine-tuning.
- Production deployment, durable query storage, distributed workers, queues, caching, or horizontal scaling.
- Production observability, tracing, alerting, secrets management, or security hardening.
- Prompt-injection prevention beyond narrow grounding instructions and bounded context.

## Risks

- **Lexical retrieval can miss relevant wording.** Accept the limitation and use corpus-shaped tests; embeddings are explicitly out of scope.
- **The generation or verification model can still make a mistake.** Bound both prompts, verify claims against cited text, allow only one regeneration, and return no answer after repeated failure; do not claim this fully eliminates hallucination.
- **The verifier can reject valid answers and make the service appear unreliable.** Keep answers concise, require claim-level citations, use a structured verifier result with a rejection reason, and tune the two system prompts against the named receipt cases if normal handbook questions exhaust the retry. Do not hide the problem with unbounded retries or by bypassing verification.
- **Superseded policy could produce a wrong operational answer.** Parse status metadata and test that superseded documents never enter the candidate set.
- **Local model startup can dominate latency.** Treat cold-start behavior as an observed characteristic and avoid unmeasured performance claims.
- **The 90-minute limit can be consumed by infrastructure.** Keep one endpoint, one retrieval strategy, whole-document indexing, and a small response contract; cut optional polish before core tests and failure semantics.
