import { describe, expect, it, vi } from "vitest";
import { QueryRequestError, queryEndpoint, queryHandbook } from "../src/query-client.js";

describe("query command client", () => {
  it("always targets POST /query", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ answer: "Grounded.", citations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      queryHandbook("What is the policy?", "http://localhost:4567/api", fetchImplementation),
    ).resolves.toEqual({ answer: "Grounded.", citations: [] });
    expect(fetchImplementation).toHaveBeenCalledWith("http://localhost:4567/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "What is the policy?" }),
    });
  });

  it("constructs the documented default endpoint path", () => {
    expect(queryEndpoint("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000/query");
  });

  it("preserves API errors for command output", async () => {
    const responseBody = { error: "MODEL_FAILED", message: "Ollama is unavailable" };
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const request = queryHandbook("Question", undefined, fetchImplementation);

    await expect(request).rejects.toMatchObject({
      statusCode: 503,
      responseBody,
    } satisfies Partial<QueryRequestError>);
  });
});
