import type { GroundingModel } from "./model.js";
import { ModelError } from "./model.js";
import type { HandbookRetriever } from "./retriever.js";
import type { Citation, HandbookDocument, VerificationResult } from "./types.js";

export const HANDBOOK_FALLBACK =
  "Not in the handbook. Please consult the proper web portal.";

export class QueryError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export interface QueryResult {
  answer: string;
  citations: Citation[];
}

export type QueryTrace = (event: Record<string, unknown>) => void;

function citedDocumentIds(answer: string): string[] {
  return [...answer.matchAll(/\[(?:Doc ID:\s*)?(KFL-[A-Z]+-\d+)\]/g)].map(
    (match) => match[1] ?? "",
  );
}

function citationFinding(answer: string, documents: HandbookDocument[]): string | null {
  const allowedIds = new Set(documents.map((document) => document.documentId));
  const citedIds = citedDocumentIds(answer);
  if (citedIds.length === 0) {
    return "The answer has no [Doc ID] citation.";
  }

  const invalid = [...new Set(citedIds.filter((id) => !allowedIds.has(id)))];
  return invalid.length > 0
    ? `The answer cites unknown source(s): ${invalid.join(", ")}.`
    : null;
}

function findings(result: VerificationResult, citationIssue: string | null): string {
  return [result.reason, ...result.unsupportedClaims, citationIssue]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function mapCitations(answer: string, documents: HandbookDocument[]): Citation[] {
  const citedIds = new Set(citedDocumentIds(answer));
  return documents
    .filter((document) => citedIds.has(document.documentId))
    .map(({ documentId, title, revision, sourceFile }) => ({
      documentId,
      title,
      revision,
      sourceFile,
    }));
}

export class QueryService {
  constructor(
    private readonly retriever: HandbookRetriever,
    private readonly model: GroundingModel,
    private readonly trace: QueryTrace = () => {},
  ) {}

  async query(question: string): Promise<QueryResult> {
    let documents: HandbookDocument[];
    try {
      documents = this.retriever.search(question);
    } catch {
      throw new QueryError("Retrieval failed", 500, "RETRIEVAL_FAILED");
    }

    this.trace({
      stage: "retrieval",
      question,
      sources: documents.map(({ documentId, revision, sourceFile }) => ({
        documentId,
        revision,
        sourceFile,
      })),
    });

    if (documents.length === 0) {
      this.trace({ stage: "fallback", reason: "no retrieval results" });
      return { answer: HANDBOOK_FALLBACK, citations: [] };
    }

    try {
      let draft = await this.model.generate(question, documents);
      this.trace({ stage: "generation", attempt: 1, draft });
      let verification = await this.model.verify(question, draft, documents);
      let citationIssue = citationFinding(draft, documents);
      this.trace({
        stage: "verification",
        attempt: 1,
        ...verification,
        citationIssue,
      });

      if (!verification.supported || citationIssue) {
        const verifierFindings = findings(verification, citationIssue);
        this.trace({ stage: "retry", findings: verifierFindings });
        draft = await this.model.generate(
          question,
          documents,
          verifierFindings,
        );
        this.trace({ stage: "generation", attempt: 2, draft });
        verification = await this.model.verify(question, draft, documents);
        citationIssue = citationFinding(draft, documents);
        this.trace({
          stage: "verification",
          attempt: 2,
          ...verification,
          citationIssue,
        });
      }

      if (!verification.supported || citationIssue) {
        throw new QueryError(
          "Generated answer could not be verified",
          502,
          "VERIFICATION_FAILED",
        );
      }

      const citations = mapCitations(draft, documents);
      this.trace({
        stage: "complete",
        citedDocumentIds: citations.map((citation) => citation.documentId),
      });
      return { answer: draft, citations };
    } catch (error) {
      this.trace({
        stage: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      if (error instanceof QueryError) {
        throw error;
      }
      if (error instanceof ModelError) {
        const statusCode = error.kind === "unavailable" ? 503 : 502;
        throw new QueryError(error.message, statusCode, "MODEL_FAILED");
      }
      throw new QueryError("Model operation failed", 502, "MODEL_FAILED");
    }
  }
}
