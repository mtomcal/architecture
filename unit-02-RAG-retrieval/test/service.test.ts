import { describe, expect, it, vi } from "vitest";
import type { GroundingModel } from "../src/model.js";
import type { HandbookRetriever } from "../src/retriever.js";
import { HANDBOOK_FALLBACK, QueryError, QueryService } from "../src/service.js";
import type { HandbookDocument, VerificationResult } from "../src/types.js";

const document: HandbookDocument = {
  title: "Detention",
  documentId: "KFL-OPS-01",
  revision: "2025-02",
  status: "Current",
  sourceFile: "detention.md",
  content: "Each stop includes 2 hours free time.",
};

function harness(
  results: HandbookDocument[],
  drafts: string[],
  verifications: VerificationResult[],
) {
  const retriever = {
    search: vi.fn().mockReturnValue(results),
  } as unknown as HandbookRetriever;
  const model: GroundingModel = {
    generate: vi.fn().mockImplementation(async () => drafts.shift() ?? ""),
    verify: vi.fn().mockImplementation(async () => verifications.shift()),
  };
  return { service: new QueryService(retriever, model), model };
}

describe("QueryService", () => {
  it("returns the exact fallback without model calls when retrieval is empty", async () => {
    const { service, model } = harness([], [], []);

    await expect(service.query("Unknown topic")).resolves.toEqual({
      answer: HANDBOOK_FALLBACK,
      citations: [],
    });
    expect(model.generate).not.toHaveBeenCalled();
    expect(model.verify).not.toHaveBeenCalled();
  });

  it("returns a verified answer with mapped citations", async () => {
    const { service, model } = harness(
      [document],
      ["Free time is two hours. [KFL-OPS-01]"],
      [{ supported: true, unsupportedClaims: [], reason: "All claims supported." }],
    );

    await expect(service.query("How long is free time?")).resolves.toEqual({
      answer: "Free time is two hours. [KFL-OPS-01]",
      citations: [
        {
          documentId: "KFL-OPS-01",
          title: "Detention",
          revision: "2025-02",
          sourceFile: "detention.md",
        },
      ],
    });
    expect(model.generate).toHaveBeenCalledTimes(1);
    expect(model.verify).toHaveBeenCalledTimes(1);
  });

  it("regenerates once using verifier findings", async () => {
    const { service, model } = harness(
      [document],
      ["Free time is three hours. [KFL-OPS-01]", "Free time is two hours. [KFL-OPS-01]"],
      [
        { supported: false, unsupportedClaims: ["three hours"], reason: "Wrong duration." },
        { supported: true, unsupportedClaims: [], reason: "Supported." },
      ],
    );

    await expect(service.query("How long is free time?")).resolves.toMatchObject({
      answer: "Free time is two hours. [KFL-OPS-01]",
    });
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(model.generate).toHaveBeenLastCalledWith(
      expect.any(String),
      [document],
      expect.stringContaining("three hours"),
    );
    expect(model.verify).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing citation even when the verifier accepts the prose", async () => {
    const { service, model } = harness(
      [document],
      ["Free time is two hours.", "Free time is two hours. [KFL-OPS-01]"],
      [
        { supported: true, unsupportedClaims: [], reason: "Supported." },
        { supported: true, unsupportedClaims: [], reason: "Supported." },
      ],
    );

    await expect(service.query("How long is free time?")).resolves.toMatchObject({
      answer: "Free time is two hours. [KFL-OPS-01]",
    });
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  it("fails without returning either answer after two failed checks", async () => {
    const { service, model } = harness(
      [document],
      ["Bad one [KFL-OPS-01]", "Bad two [KFL-OPS-01]"],
      [
        { supported: false, unsupportedClaims: ["Bad one"], reason: "Unsupported." },
        { supported: false, unsupportedClaims: ["Bad two"], reason: "Unsupported." },
      ],
    );

    await expect(service.query("Question")).rejects.toMatchObject({
      statusCode: 502,
      code: "VERIFICATION_FAILED",
    } satisfies Partial<QueryError>);
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(model.verify).toHaveBeenCalledTimes(2);
  });
});
