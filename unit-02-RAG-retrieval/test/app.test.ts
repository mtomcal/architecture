import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { ModelError } from "../src/model.js";
import type { HandbookRetriever } from "../src/retriever.js";
import { QueryService } from "../src/service.js";
import type { HandbookDocument } from "../src/types.js";

const document: HandbookDocument = {
  title: "Detention",
  documentId: "KFL-OPS-01",
  revision: "2025-02",
  status: "Current",
  sourceFile: "detention.md",
  content: "Each stop includes 2 hours free time.",
};

function serviceWith(model: { generate: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> }) {
  const retriever = { search: vi.fn().mockReturnValue([document]) } as unknown as HandbookRetriever;
  return new QueryService(retriever, model);
}

describe("POST /query", () => {
  it("returns a verified response", async () => {
    const app = createApp(
      serviceWith({
        generate: vi.fn().mockResolvedValue("Two hours. [KFL-OPS-01]"),
        verify: vi
          .fn()
          .mockResolvedValue({ supported: true, unsupportedClaims: [], reason: "Supported." }),
      }),
    );

    const response = await app.inject({ method: "POST", url: "/query", payload: { question: "Free time?" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      answer: "Two hours. [KFL-OPS-01]",
      citations: [{ documentId: "KFL-OPS-01" }],
    });
    await app.close();
  });

  it("rejects empty and oversized questions", async () => {
    const app = createApp(serviceWith({ generate: vi.fn(), verify: vi.fn() }));

    expect(
      (await app.inject({ method: "POST", url: "/query", payload: { question: "   " } })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: "POST", url: "/query", payload: { question: "x".repeat(1_001) } }))
        .statusCode,
    ).toBe(400);
    await app.close();
  });

  it("returns 503 with no answer when Ollama is unavailable", async () => {
    const app = createApp(
      serviceWith({
        generate: vi.fn().mockRejectedValue(new ModelError("Ollama is unavailable", "unavailable")),
        verify: vi.fn(),
      }),
    );

    const response = await app.inject({ method: "POST", url: "/query", payload: { question: "Free time?" } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "MODEL_FAILED", message: "Ollama is unavailable" });
    expect(response.json()).not.toHaveProperty("answer");
    await app.close();
  });

  it("returns an error without answer content after repeated verification failure", async () => {
    const app = createApp(
      serviceWith({
        generate: vi.fn().mockResolvedValue("Unsupported. [KFL-OPS-01]"),
        verify: vi
          .fn()
          .mockResolvedValue({ supported: false, unsupportedClaims: ["Unsupported"], reason: "No." }),
      }),
    );

    const response = await app.inject({ method: "POST", url: "/query", payload: { question: "Free time?" } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: "VERIFICATION_FAILED",
      message: "Generated answer could not be verified",
    });
    expect(response.json()).not.toHaveProperty("answer");
    await app.close();
  });
});
