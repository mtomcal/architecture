import { describe, expect, it } from "vitest";
import { buildGenerationPrompt, buildVerificationPrompt, MAX_CONTEXT_CHARACTERS } from "../src/prompts.js";
import type { HandbookDocument } from "../src/types.js";

const document: HandbookDocument = {
  title: "Detention",
  documentId: "KFL-OPS-01",
  revision: "2025-02",
  status: "Current",
  sourceFile: "detention.md",
  content: "Detention includes two hours free time.",
};

describe("prompt construction", () => {
  it("grounds generation in the question and retrieved source metadata", () => {
    const prompt = buildGenerationPrompt("What is free time?", [document]);

    expect(prompt).toContain("QUESTION:\nWhat is free time?");
    expect(prompt).toContain("SOURCE KFL-OPS-01 | Detention | Revision 2025-02");
    expect(prompt).toContain("[KFL-OPS-01]");
    expect(prompt).toContain("at most three sentences");
    expect(prompt).toContain("untrusted data");
  });

  it("includes verifier findings only on regeneration", () => {
    const prompt = buildGenerationPrompt("Question", [document], "The rate was unsupported.");
    expect(prompt).toContain("The previous draft was rejected");
    expect(prompt).toContain("The rate was unsupported.");
  });

  it("bounds source context", () => {
    const prompt = buildGenerationPrompt("Question", [
      { ...document, content: "x".repeat(MAX_CONTEXT_CHARACTERS * 2) },
    ]);
    expect(prompt.length).toBeLessThan(MAX_CONTEXT_CHARACTERS + 1_000);
  });

  it("gives the verifier the draft and source text", () => {
    const prompt = buildVerificationPrompt("Question", "Draft [KFL-OPS-01]", [document]);
    expect(prompt).toContain("DRAFT:\nDraft [KFL-OPS-01]");
    expect(prompt).toContain(document.content);
    expect(prompt).toContain("claim by claim");
  });
});
