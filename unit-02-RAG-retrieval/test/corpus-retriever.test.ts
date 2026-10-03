import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadCorpus, parseDocument } from "../src/corpus.js";
import { HandbookRetriever } from "../src/retriever.js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const openRetrievers: HandbookRetriever[] = [];

afterEach(() => {
  for (const retriever of openRetrievers.splice(0)) {
    retriever.close();
  }
});

describe("corpus ingestion", () => {
  it("parses document metadata", () => {
    const document = parseDocument(
      "# Policy\n\nDoc ID: KFL-TST-01 · Revision: 2025-01 · Status: Current\n\nText.",
      "policy.md",
    );

    expect(document).toMatchObject({
      title: "Policy",
      documentId: "KFL-TST-01",
      revision: "2025-01",
      status: "Current",
      sourceFile: "policy.md",
    });
  });

  it("identifies the source file when metadata is malformed", () => {
    expect(() => parseDocument("# Broken", "broken.md")).toThrow("broken.md");
  });

  it("excludes superseded documents", async () => {
    const documents = await loadCorpus(path.join(projectDirectory, "corpus"));

    expect(documents).toHaveLength(13);
    expect(documents.some((document) => document.sourceFile === "cargo-claims-2024.md")).toBe(
      false,
    );
  });
});

describe("FTS5 retrieval", () => {
  it("finds the core detention policy in the bounded result set", async () => {
    const documents = await loadCorpus(path.join(projectDirectory, "corpus"));
    const retriever = new HandbookRetriever(documents);
    openRetrievers.push(retriever);

    const results = retriever.search("How is detention billed after the free period?");

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.documentId)).toContain("KFL-OPS-01");
  });

  it("retrieves only the current cargo-claims policy", async () => {
    const documents = await loadCorpus(path.join(projectDirectory, "corpus"));
    const retriever = new HandbookRetriever(documents);
    openRetrievers.push(retriever);

    const results = retriever.search("How do I file a cargo claim?");

    expect(results[0]).toMatchObject({
      documentId: "KFL-CLM-01",
      revision: "2025-07",
      sourceFile: "cargo-claims.md",
    });
    expect(results.some((result) => result.revision === "2024-03")).toBe(false);
  });

  it("returns an empty result for unrelated terms", async () => {
    const documents = await loadCorpus(path.join(projectDirectory, "corpus"));
    const retriever = new HandbookRetriever(documents);
    openRetrievers.push(retriever);

    expect(retriever.search("What is the capital of France?")).toEqual([]);
  });
});
