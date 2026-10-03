# Unit 02: RAG Retrieval

A small local retrieval-augmented generation service for the Kestrel Freight Lines handbook. It uses whole-document SQLite FTS5 retrieval, local `qwen3:8b` generation through Ollama, and a separate model call that must verify every answer before release.

## Run it

Prerequisites:

- Node.js 22 or newer with `node:sqlite` and FTS5
- npm
- Ollama listening on `127.0.0.1:11434` with `qwen3:8b` installed

```sh
npm install
npm test
npm run typecheck
npm run build
npm start
```

Then query the service:

```sh
npm run query -- "How is detention billed after the free period?"
```

The command builds the small CLI client and sends `POST /query` to the running service. Set `QUERY_API_BASE_URL` to target a service on another host or port; the command always calls its `/query` endpoint.

```sh
QUERY_API_BASE_URL=http://127.0.0.1:4000 npm run query -- "How do I file a cargo claim?"
```

`PORT`, `CORPUS_DIR`, `OLLAMA_URL`, and `OLLAMA_MODEL` can override the service defaults.

For a compact trace of retrieval and the model-verifier exchange, start the service with debug tracing:

```sh
RAG_DEBUG=true npm start
```

Each query logs the retrieved source metadata, generated draft, verification result and reason, retry findings when applicable, and final cited document IDs. It does not dump the full prompt or corpus text. Because drafts and questions may still be sensitive, tracing is off by default.

## Architecture

Startup reads every Markdown file in `corpus/`, validates its visible title and metadata line, drops documents whose status is not `Current`, and creates an in-memory FTS5 table. Each source document remains one retrieval unit. The Porter tokenizer handles small word-form differences, and BM25 gives the title extra weight. Retrieval is fixed at three documents.

`POST /query` accepts a nonblank question of at most 1,000 characters. The service turns meaningful question terms into a quoted FTS5 OR query. No match returns the exact handbook fallback without calling Ollama.

For a match, generation receives only the question and at most 12,000 characters of retrieved source text. The prompt requires a short answer with a source document ID after every factual claim. A second `qwen3:8b` call receives only the question, draft, and documents actually cited by that draft. It returns structured JSON describing whether every claim is supported.

An unsupported draft is regenerated once with the verifier findings. The replacement is verified separately. The service also checks citation syntax and maps cited IDs back to retrieved metadata. A second rejection returns `502` and exposes neither draft. Ollama unavailability returns `503` with no answer.

The hot path is therefore:

```text
question -> FTS5 top 3 -> generate -> verify cited text -> response
                                      |
                                      +-> reject -> regenerate once -> verify -> response or 502
```

## Response contract

A verified answer returns HTTP 200:

```json
{
  "answer": "After the free period, detention is billed at $75 per hour [KFL-OPS-01].",
  "citations": [
    {
      "documentId": "KFL-OPS-01",
      "title": "Detention",
      "revision": "2025-02",
      "sourceFile": "detention.md"
    }
  ]
}
```

No lexical match also returns HTTP 200, with the exact answer `Not in the handbook. Please consult the proper web portal.` and an empty `citations` array. Operational and grounding failures return an `error` and `message`, never an `answer`.

## Tradeoffs and failure modes

- Whole-document lexical retrieval is transparent and sufficient for this small corpus, but synonyms with no shared terms can miss relevant policy. That miss intentionally returns the handbook fallback.
- OR queries favor recall and can include related documents. The result count and prompt size bounds prevent that from growing without limit.
- The index is ephemeral. Malformed metadata or SQLite initialization fails startup rather than serving a partial corpus.
- The same local model performs generation and verification in separate calls. Separation creates a hard release gate, but it is not proof against correlated model mistakes or false rejections.
- Only documents cited in the draft go to verification. This follows the claim-checking boundary and avoids unrelated retrieved policies distracting the verifier.
- Local model cold starts and serialized inference can dominate latency. There is no queue, concurrency control, or capacity management in this unit.
- Node 22 reports `node:sqlite` as experimental. A production service should select and pin a supported SQLite integration.
- The installed npm dependency tree reported two moderate-severity audit findings during this build. They were not changed with a forced, potentially breaking upgrade inside the timebox.

If Ollama is unreachable or the model is missing, the service returns `503`. Timeouts, malformed model data, and malformed verifier JSON return `502`. Two unsupported drafts return `502 VERIFICATION_FAILED`. Retrieval errors return `500`. Failures are logged without prompts or corpus text.

## Observed receipts

Measurements below were made locally on October 3, 2026 with Node `v22.22.3`, Ollama on loopback, and `qwen3:8b` (`Q4_K_M`). They are observations, not performance guarantees.

- `npm test`: 5 files and 23 tests passed in the debug-tracing follow-up run.
- `npm run typecheck` and `npm run build`: both completed successfully.
- Detention request: HTTP 200 in 5.739 seconds. It cited current `KFL-OPS-01` and related layover policy `KFL-OPS-02`.
- Cargo-claims request: HTTP 200 in 6.451 seconds. It cited `KFL-CLM-01`, revision `2025-07`, from `cargo-claims.md`; the superseded 2024 file was absent.
- Out-of-corpus capital-of-France request: HTTP 200 in 0.001763 seconds with the exact fallback and no citations, demonstrating the model-free path.
- A second service pointed at unreachable `127.0.0.1:9`: HTTP 503 in 0.013581 seconds with `MODEL_FAILED` and no answer.
- During prompt tuning, a real detention draft failed both checks and returned HTTP 502 with no answer in 25.043 seconds. After tightening citation syntax and verifier context, the known detention and cargo-claims requests completed successfully.
- `npm run query -- "What is the capital of France?"` called `POST /query` and printed the exact fallback response.

## Production work

A production implementation would need authentication and policy-set authorization, tenant separation, provenance and update controls for source documents, durable and atomic index refresh, stronger prompt-injection defenses, rate and concurrency limits, request deadlines, audit logging, redaction, metrics and tracing, model/version evaluation, and a deployable SQLite support strategy. Semantic or hybrid retrieval, chunking, reranking, streaming, caching, remote models, and a general evaluation harness are intentionally outside this unit.
