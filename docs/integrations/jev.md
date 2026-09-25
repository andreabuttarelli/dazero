# Jev (TypeSafe AI)

Official npm package `@typesafe-ai/sdk` (v0.6.0). Maintainers: alliesafe@typesafe.ai,
diogo149@typesafe.ai.

- Endpoint: `POST https://api.typesafe.ai/v1/systemone`
- Auth: header `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`
- Request body: `{ state: string|object|array, model: "jev-latest", questions: { [key]: Question } }`
- Question types:
  - `noul` (boolean/yes-no): `{ type: "noul", instructions: string, criteria?: {...} }` →
    `{ type: "noul", noul: number 0-1 }`
  - `choice`: `{ type: "choice", instructions: string, criteria: { [optionKey]: null|string } }` →
    `{ type: "choice", choice: string, probabilities: {...}, confidence: number }`
  - `score`: `{ type: "score", instructions: string, criteria: string[] (2-10 ordered levels) }` →
    `{ type: "score", score: number, legend: {...}, probabilities: {...}, confidence: number }`
- Response envelope: `{ model: string, answers: { [key]: Answer }, usage: { input_tokens: number, output_tokens: number } }`
- HTTP errors: 401 missing/invalid key, 422 validation failed, 429 rate limit exceeded, 529
  temporarily overloaded
- Pricing: input $0.042/million tokens, output free. No published rate-limit numbers beyond 429.
- Requires Node 20+, reads `TYPESAFE_API_KEY` env var.

Official JS SDK usage:

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { document: "..." },
  questions: { category: choice("What is this ticket about?", { billing: null, technical: null, other: null }) },
});
console.log(response.answers.category.choice);
```

Sources: https://docs.typesafe.ai/, https://docs.typesafe.ai/api.md,
https://docs.typesafe.ai/sdk/javascript.md, https://www.npmjs.com/package/@typesafe-ai/sdk
