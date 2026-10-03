import { buildGenerationPrompt, buildVerificationPrompt } from "./prompts.js";
import type { HandbookDocument, VerificationResult } from "./types.js";

export interface GroundingModel {
  generate(
    question: string,
    documents: HandbookDocument[],
    verifierFindings?: string,
  ): Promise<string>;
  verify(
    question: string,
    draft: string,
    documents: HandbookDocument[],
  ): Promise<VerificationResult>;
}

interface OllamaResponse {
  response?: unknown;
}

const VERIFICATION_SCHEMA = {
  type: "object",
  properties: {
    supported: { type: "boolean" },
    unsupportedClaims: { type: "array", items: { type: "string" } },
    reason: { type: "string" },
  },
  required: ["supported", "unsupportedClaims", "reason"],
  additionalProperties: false,
} as const;

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "timeout" | "malformed",
  ) {
    super(message);
  }
}

export class OllamaModel implements GroundingModel {
  constructor(
    private readonly baseUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
    private readonly model = process.env.OLLAMA_MODEL ?? "qwen3:8b",
    private readonly timeoutMilliseconds = 120_000,
  ) {}

  async generate(
    question: string,
    documents: HandbookDocument[],
    verifierFindings?: string,
  ): Promise<string> {
    const response = await this.call({
      prompt: buildGenerationPrompt(question, documents, verifierFindings),
      options: { temperature: 0, num_predict: 350 },
    });

    if (typeof response.response !== "string" || response.response.trim().length === 0) {
      throw new ModelError("Ollama returned an empty generation", "malformed");
    }

    return response.response.trim();
  }

  async verify(
    question: string,
    draft: string,
    documents: HandbookDocument[],
  ): Promise<VerificationResult> {
    const citedIds = new Set(
      [...draft.matchAll(/\[(?:Doc ID:\s*)?(KFL-[A-Z]+-\d+)\]/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    const citedDocuments = documents.filter((document) => citedIds.has(document.documentId));
    const response = await this.call({
      prompt: buildVerificationPrompt(question, draft, citedDocuments),
      format: VERIFICATION_SCHEMA,
      options: { temperature: 0, num_predict: 350 },
    });

    if (typeof response.response !== "string") {
      throw new ModelError("Ollama returned a malformed verification", "malformed");
    }

    try {
      const value = JSON.parse(response.response) as Partial<VerificationResult>;
      if (
        typeof value.supported !== "boolean" ||
        !Array.isArray(value.unsupportedClaims) ||
        !value.unsupportedClaims.every((claim) => typeof claim === "string") ||
        typeof value.reason !== "string"
      ) {
        throw new Error("schema mismatch");
      }
      return value as VerificationResult;
    } catch {
      throw new ModelError("Ollama returned invalid verifier JSON", "malformed");
    }
  }

  private async call(body: Record<string, unknown>): Promise<OllamaResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          ...body,
        }),
        signal: AbortSignal.timeout(this.timeoutMilliseconds),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new ModelError("Ollama request timed out", "timeout");
      }
      throw new ModelError("Ollama is unavailable", "unavailable");
    }

    if (!response.ok) {
      throw new ModelError(`Ollama returned HTTP ${response.status}`, "unavailable");
    }

    try {
      return (await response.json()) as OllamaResponse;
    } catch {
      throw new ModelError("Ollama returned malformed JSON", "malformed");
    }
  }
}
