import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { HandbookDocument } from "./types.js";

const METADATA_PATTERN =
  /^Doc ID:\s*(.+?)\s*·\s*Revision:\s*(.+?)\s*·\s*Status:\s*(.+?)\s*$/m;

export function parseDocument(content: string, sourceFile: string): HandbookDocument {
  const titleMatch = content.match(/^#\s+(.+?)\s*$/m);
  const metadataMatch = content.match(METADATA_PATTERN);

  if (!titleMatch?.[1] || !metadataMatch?.[1] || !metadataMatch[2] || !metadataMatch[3]) {
    throw new Error(`Malformed document metadata: ${sourceFile}`);
  }

  return {
    title: titleMatch[1].trim(),
    documentId: metadataMatch[1].trim(),
    revision: metadataMatch[2].trim(),
    status: metadataMatch[3].trim(),
    sourceFile,
    content,
  };
}

export async function loadCorpus(corpusDirectory: string): Promise<HandbookDocument[]> {
  const entries = (await readdir(corpusDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .sort((left, right) => left.name.localeCompare(right.name));

  const documents = await Promise.all(
    entries.map(async (entry) => {
      const sourceFile = entry.name;
      const content = await readFile(path.join(corpusDirectory, sourceFile), "utf8");
      return parseDocument(content, sourceFile);
    }),
  );

  return documents.filter((document) => document.status.toLowerCase() === "current");
}
