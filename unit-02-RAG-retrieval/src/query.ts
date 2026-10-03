import {
  DEFAULT_API_BASE_URL,
  QueryRequestError,
  queryHandbook,
} from "./query-client.js";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  console.error('Usage: npm run query -- "How is detention billed?"');
  process.exitCode = 1;
} else {
  try {
    const response = await queryHandbook(
      question,
      process.env.QUERY_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    );
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    if (error instanceof QueryRequestError) {
      console.error(JSON.stringify(error.responseBody, null, 2));
    } else {
      console.error(
        JSON.stringify(
          { error: "QUERY_REQUEST_FAILED", message: "Could not reach the query endpoint" },
          null,
          2,
        ),
      );
    }
    process.exitCode = 1;
  }
}
