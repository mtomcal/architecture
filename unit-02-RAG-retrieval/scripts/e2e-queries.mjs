const apiBaseUrl = process.env.QUERY_API_BASE_URL ?? "http://127.0.0.1:3000";
const endpoint = new URL("/query", apiBaseUrl).toString();

const testCases = [
  { number: 1, question: "What does it cost when a delivery is late?", runs: 1 },
  { number: 2, question: "What is this week's fuel surcharge percentage?", runs: 3 },
  { number: 3, question: "What is Kestrel's policy on team drivers?", runs: 3 },
  {
    number: 4,
    question:
      "A refrigerated load is waiting at the receiver. How much free time is there, and what's the detention rate?",
    runs: 1,
  },
  {
    number: 5,
    question: "The driver checked in 45 minutes after the appointment. When does free time start?",
    runs: 1,
  },
  { number: 6, question: "What number do I call to file a cargo claim?", runs: 1 },
  { number: 7, question: "How long do I have to report concealed damage?", runs: 1 },
  { number: 8, question: "What is ACC-LA and what does it cost?", runs: 1 },
  {
    number: 9,
    question: "Can I ship a class 3 flammable liquid on Kestrel Priority?",
    runs: 1,
  },
  { number: 10, question: "How much free time does a Dedicated customer get?", runs: 1 },
  {
    number: 11,
    question:
      "Dry van, driver on time, left 3.5 hours after the appointment. What's the detention charge?",
    runs: 1,
  },
];

function formatCitations(citations) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return ["Citations: none"];
  }

  return [
    "Citations:",
    ...citations.map(
      (citation) =>
        `- ${citation.documentId} | ${citation.title} | revision ${citation.revision} | ${citation.sourceFile}`,
    ),
  ];
}

for (const testCase of testCases) {
  for (let run = 1; run <= testCase.runs; run += 1) {
    const label = testCase.runs > 1
      ? `Test ${testCase.number} (run ${run} of ${testCase.runs})`
      : `Test ${testCase.number}`;

    const lines = [label, `Question: ${testCase.question}`];

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: testCase.question }),
      });
      const body = await response.json();
      lines.push(`HTTP status: ${response.status}`);

      if (typeof body.answer === "string") {
        lines.push(`Result: ${body.answer}`);
      } else {
        const error = [body.error, body.message].filter(Boolean).join(" — ");
        lines.push(`Result: ERROR${error ? ` — ${error}` : ""}`);
      }

      lines.push(...formatCitations(body.citations));
    } catch (error) {
      lines.push("HTTP status: unavailable");
      lines.push(
        `Result: ERROR — ${error instanceof Error ? error.message : "Unknown request failure"}`,
      );
      lines.push("Citations: none");
    }

    process.stdout.write(`${lines.join("\n")}\n\n`);
  }
}
