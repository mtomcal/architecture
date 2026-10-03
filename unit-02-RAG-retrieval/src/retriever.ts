import { DatabaseSync } from "node:sqlite";
import type { HandbookDocument } from "./types.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "and",
  "are",
  "does",
  "for",
  "from",
  "how",
  "into",
  "is",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
]);

interface DocumentRow {
  title: string;
  documentId: string;
  revision: string;
  status: string;
  sourceFile: string;
  content: string;
}

function toFtsQuery(question: string): string | null {
  const terms = [
    ...new Set(
      question
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((term) => term.length >= 3 && !STOP_WORDS.has(term)) ?? [],
    ),
  ];

  return terms.length === 0
    ? null
    : terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}

export class HandbookRetriever {
  private readonly database = new DatabaseSync(":memory:");

  constructor(documents: HandbookDocument[], private readonly resultLimit = 3) {
    this.database.exec(`
      CREATE VIRTUAL TABLE handbook USING fts5(
        title,
        content,
        documentId UNINDEXED,
        revision UNINDEXED,
        status UNINDEXED,
        sourceFile UNINDEXED,
        tokenize = 'porter unicode61'
      );
    `);

    const insert = this.database.prepare(`
      INSERT INTO handbook (title, content, documentId, revision, status, sourceFile)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const document of documents) {
      insert.run(
        document.title,
        document.content,
        document.documentId,
        document.revision,
        document.status,
        document.sourceFile,
      );
    }
  }

  search(question: string): HandbookDocument[] {
    const query = toFtsQuery(question);
    if (!query) {
      return [];
    }

    const rows = this.database
      .prepare(`
        SELECT title, documentId, revision, status, sourceFile, content
        FROM handbook
        WHERE handbook MATCH ?
        ORDER BY bm25(handbook, 10.0, 1.0)
        LIMIT ?
      `)
      .all(query, this.resultLimit) as unknown as DocumentRow[];

    return rows.map((row) => ({ ...row }));
  }

  close(): void {
    this.database.close();
  }
}
