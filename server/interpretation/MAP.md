# server/interpretation/ — Map

Tier 2 (AI-customized interpretation, ADR 0003) support: LLM client, cost/usage tracking, result storage, description sanitization. Route lives at `server/interpretation-routes.ts`.

- `cost-reservation.ts` — Atomically reserve conservative worst-case cost before a chargeable Tier 2 call (#461), closing the daily-cap race between concurrent requests; expired leases are charged in full when pruned (#476). Deps: usage.
- `description.ts` — Sanitize model-written result label: length, word count, forbidden markup/links, guardrail check. Fails closed to `null`. Deps: src/interpretation/prompt-guardrail.
- `llm-client.ts` — Only runtime code calling third-party LLM (Gemini) for Tier 2. Loads config, structured-output generation + plain-text verification (retry on 5xx), per-call cost estimate. Deps: none; enforced non-importable from `src/` by `test/no-runtime-llm-access.test.ts`.
- `results.ts` — Reopen past Tier 2 generations (no regen/requote #392). Encrypt/store sections/description/basis, decrypt for listing (metadata) or detail. Uses sync-relay key. Deps: db, ops/crypto, src/interpretation/result-basis, llm-client.
- `usage.ts` — Spend tracking: token/cost per call, per-user/total cost rolling window, admin all-time-per-user summary (Tier 2's two daily dollar caps). Deps: db.
