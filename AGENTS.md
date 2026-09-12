# Architecture Practicum Repository

This repository is an interview-preparation portfolio, not a product. It contains a series of small, self-contained systems built to demonstrate architectural judgment under time constraints.

## Unit Structure

- Build each unit on its own branch named `unit-<number>-<slug>`.
- Timebox each unit to 90 minutes.
- Use TypeScript on Node.js by default.
- Use the same HTTP framework and test runner across all units. Do not replace them in later units without explicit approval.
- Treat later units as assembly and extension of established patterns, not opportunities for rewrites.

Every unit branch must contain these artifacts in addition to its code:

- `SCOPE.md`, committed before any implementation. It must state the unit's scope, assumptions, non-goals, and risks.
- `README.md`, covering the architecture, tradeoffs, failure modes, measured numbers, and what a production implementation would require.
- A narration transcript recorded during the build.

## Agent Behavior

- Optimize for judgment and scope control, not output volume.
- Do not exceed the stated scope.
- Do not add unrequested features, abstractions, or dependencies.
- When a decision has a material tradeoff, explain it and ask before choosing.
- Prefer the smallest correct implementation over a more complete implementation.
- If work should be cut to meet the timebox, identify the cut explicitly instead of rushing it into the unit.
- Put only measured numbers in the README. Never claim latency, throughput, hit rate, or other performance results that were not actually observed.
- Describe out-of-scope production hardening in the README rather than implementing it unless it is explicitly required.
