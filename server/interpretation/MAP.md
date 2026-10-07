# server/interpretation/ — file map

Supporting modules for Tier 2 (AI-customized interpretation, ADR 0003): the LLM client,
cost/usage tracking, saved-result storage, and description sanitization. The route itself
lives one level up, at `server/interpretation-routes.ts`.

### `description.ts`
Domain Purpose: keeps the short, reader-history-facing label the model writes for a Tier 2 result (#423) from becoming an unchecked surface for prompt-injection-style content. Responsibility: sanitizes/validates the model's raw `description` output — length, word count, forbidden markup/link characters, and the same guardrail check an allowed custom instruction must pass — failing closed to `null` on anything that doesn't pass. Key Dependencies: `../../src/interpretation/prompt-guardrail.ts`; consumed by `../interpretation-routes.ts`.

### `llm-client.ts`
Domain Purpose: the one place in the running server that actually calls a third-party LLM (Gemini) for Tier 2 generation and custom-prompt verification. Responsibility: loads `ASTRAYA_INTERPRETATION_*` config, makes the structured-output generation call and the plain-text verification call (with retry on transient errors), and estimates per-call cost in cents. Key Dependencies: none beyond the global `fetch`; consumed by `../interpretation-routes.ts`; its runtime-only nature is enforced by `test/no-runtime-llm-access.test.ts` (never importable from `src/`).

### `results.ts`
Domain Purpose: lets a reader reopen a past Tier 2 generation later without regenerating (and re-spending quota) (#392). Responsibility: encrypts and stores a generation's sections/description/basis, and decrypts them back for listing (metadata only) or detail retrieval, using the same at-rest key and scheme as the sync relay. Key Dependencies: `../db.ts`, `../ops/crypto.ts` (`encryptPayload`/`decryptPayload`), `../../src/interpretation/result-basis.ts`, `./llm-client.ts`'s `Tier2Section` type; consumed by `../interpretation-routes.ts`.

### `usage.ts`
Domain Purpose: the real spend-tracking data behind Tier 2's two daily dollar caps (per-user and total), not just a request-count rate limit. Responsibility: records each successful model call's token/cost usage, and reads back per-user/total cost over a rolling window, plus an admin-facing all-time-per-user summary. Key Dependencies: `../db.ts`; consumed by `../interpretation-routes.ts` (cap checks, admin usage route).
