export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

export class QueryRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: unknown,
  ) {
    super(`Query endpoint returned HTTP ${statusCode}`);
  }
}

export function queryEndpoint(baseUrl: string): string {
  return new URL("/query", baseUrl).toString();
}

export async function queryHandbook(
  question: string,
  baseUrl = DEFAULT_API_BASE_URL,
  fetchImplementation: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetchImplementation(queryEndpoint(baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = { error: "INVALID_RESPONSE", message: "Query endpoint returned invalid JSON" };
  }

  if (!response.ok) {
    throw new QueryRequestError(response.status, body);
  }

  return body;
}
