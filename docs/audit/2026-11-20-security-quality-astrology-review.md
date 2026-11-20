# Security, quality and astrology review (2026-11-20)

**Scope:** the whole repository at `origin/main` `f54a8e38`, in three parts:

- **security and privacy:** server routes, auth, sessions, CSRF, CSP and headers, crypto, the LLM route, XSS sinks, CI and Docker supply chain, secrets;
- **code quality:** gates, bundle, warnings, documentation drift, technical debt;
- **astrology:** the golden gate, the source registry, citation status, and doctrine spot checks against the held texts.

The review itself was read-only. New findings were filed as issues #1806 to #1810. The only file change besides this report is a one-line Markdown fix in `docs/MAP.md`.

**Method:**

- Locally (Windows host): `tsc -b`, `oxlint --type-aware .`, `npm run build`, `scripts/check-bundle-size.mjs` and `npm audit`.
- **Vitest isn't run locally:** on this host it prints no React stderr and has known path failures. Test totals and warnings come from the CI `check` job log of the last green main run (`96584d40`, run 44640723353).
- Routes were enumerated from source and mapped to their guards. SQL was grepped for string-built statements. Every `innerHTML` sink was traced to its markup builder.
- Doctrine was compared with the local copies of Lilly, Bonatti, Avelar and the other texts in `docs/references/sources.json`. Their contents stay local.

## Verdict

Nothing is rated CRITICAL or HIGH among the new findings. There are two MEDIUM findings (a hayz doctrine choice and the bundle budget) and three LOW. Open HIGH items that were already tracked are listed under "Already tracked".

## Domain scores

| Domain                 | Score | Why not 100%                                                                                                                                                                                                                                               |
| ---------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security and privacy   | 88%   | Auth and data scoping are sound (below). Open: rotation and reset CLI follow-ups (#1792, #1801, #1782), reversible overlay digests (#1808), escaping left to callers (#1809), ciphertext not bound to its row (no AAD).                                    |
| Architecture           | 94%   | `sweph-wasm`, `tools/` and Tier 2 LLM boundaries are lint- and test-enforced; every API route registers a guard.                                                                                                                                           |
| Code quality and types | 85%   | Strict TS clean; 44 type escapes, all documented. The eager bundle is at 99.9% of its budget (#1807). Four views ignore `compareType` behind stale TODOs (#1810).                                                                                          |
| Tests and QA           | 80%   | 562 files and 6,831 tests pass, and the golden gate passes. But the CI log has **687** React `act(...)` warning lines and 5 `<div>`-in-`<p>` warnings that the zero-warning guard doesn't catch (#1802).                                                   |
| Documentation          | 90%   | Every `.ts`/`.tsx`/`.mjs` file in `src/`, `server/` and `tools/` is in its `MAP.md`. One malformed line in `docs/MAP.md` was fixed with this report.                                                                                                       |
| Astrology correctness  | 84%   | The JPL 0.2″ gate passes, and every source record's `used_by` path exists. The hayz rule cites no page, and held authorities disagree with it (#1806). The citation tracker #869 has 9 open items. Firdaria is still cited to a secondary summary (#1796). |

## New findings

- **#1806 (medium, astrology):** `isInHayz` (`src/astrology/planetary-condition.ts`) follows Lilly but cites only "modern restatements".
  - The code requires a nocturnal planet to be **under** the earth by night, and the planet to be of the chart's sect. This matches Lilly, _Christian Astrology_ 1647 (Houlding transcription, PDF page 72).
  - Alchabitius via Bonatti, Tr. 3, ch. 7 (p. 70) puts a nocturnal planet **above** the earth by night, and also defines hayz for planets contrary to the chart's sect. So does Avelar, _On the Heavenly Spheres_ (p. 161).
  - The result changes for the Moon, Venus and Mars in every night chart. The owner needs to choose an authority.
- **#1807 (medium, performance):** the eager JS graph is 664,821 bytes against the 665,600-byte budget, so 99.9% used (92% on 2026-11-08). The next eager addition fails the gate.
- **#1808 (low, privacy):** `GET /api/profile-overlay` is unauthenticated and returns unsalted SHA-256 digests of a date and one name token. Both are recoverable offline in seconds, revealing the configured person's birth date and first name.
- **#1809 (low, hardening):** `text()` in `src/chart/svg-primitives.ts` doesn't escape its content. Its output reaches 13 `innerHTML` sinks.
  - Every current caller that passes user text escapes it: the multi-wheel legend, the aspect matrix and the map labels. So nothing is exploitable today.
  - But safety depends on each future caller remembering to escape.
- **#1810 (low, UI):** `DraconicView`, `HarmonicView`, `RelocatedChartView` and `ReturnView` silently ignore `compareType`, with TODOs pointing at the closed #439. A user in comparison mode who switches to one of these types loses the comparison with no message.
- **Info, not filed:** AES-256-GCM in `server/ops/crypto.ts` uses no additional authenticated data. Someone with write access to the database could swap ciphertext between users' rows undetected. That attacker already holds the data, and the #1680 security review recorded this as pre-existing design.
- **Correction, posted on #1062:** the 2026-11-19 priority list said no Jyotish primary source is held. Two provisional records exist (`jataka-tatva-undated`, `birth-time-rectification-undated`), with unconfirmed authorship.

## What was checked and holds

- **Routes:** 37 HTTP routes (35 under `/api`, plus `/` and `/healthz`).
  - Every `/api/admin/*` route has `requireAdmin` or `requireSuperAdmin`.
  - User data routes (`/api/ops`, `/api/interpretation/*`, `/api/corpus-submissions`) have `requireUser`.
  - The public routes are login, setup, set-password, OIDC config and callback, logout, `/api/auth/me`, `/healthz` and `/api/profile-overlay` (#1808).
- **Data scoping:** every `ops` and `interpretation_results` query filters on `user_id`, including fetch and delete by id. No SQL statement interpolates request data: the template literals insert only column-list constants.
- **Auth:**
  - Argon2id passwords, with a dummy-hash verify for unknown users;
  - session ids and set-password tokens stored hashed;
  - cookies `httpOnly`, `SameSite=Lax`, `Secure` behind TLS;
  - `trustProxy` off by default;
  - per-IP rate limits (20/min on auth routes) and a per-username login throttle.
- **CSRF:** an origin check on unsafe methods, as a second defence behind `Lax`.
- **CSP and headers:**
  - `script-src 'self' 'wasm-unsafe-eval'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`;
  - `connect-src` limited to `'self'` and the geocoder;
  - `nosniff`, `no-referrer`, HSTS behind TLS and a Permissions-Policy.
  - `style-src` keeps `'unsafe-inline'` (known and documented).
- **The LLM route:** signed-in users only, a per-user rate limit, two cost caps with per-call reservations, a cap on the placement-key list, an `AbortSignal` timeout, and a single LLM client (boundary tested).
- **Supply chain:**
  - `npm audit`: 0 vulnerabilities;
  - every GitHub Action pinned to a full commit SHA;
  - Docker base images digest-pinned, and the runtime runs as UID 1000 with a healthcheck.
- **Secrets:** a pattern scan of tracked files (AWS, OpenAI-style, Google, GitHub and Slack tokens, private keys) found nothing.
- **Gates:** `tsc -b` exit 0, lint exit 0 (CI: "Found 0 warnings and 0 errors"), build exit 0. CI `check` on `96584d40`: 562 test files, 6,831 passed, 2 skipped, 1 todo.
- **The golden gate:** `test/golden-chart.test.ts` (94 tests against JPL Horizons, 0.2″) passes in CI.
- **The source registry:** 78 records (75 extracted, 2 unheld references, 1 needing OCR). Every `used_by` path exists, and every source id cited in code is a registry record.
- **Sect:** `sectOf` decides by the Sun's longitude relative to the Ascendant. That is exact for the Sun, whose ecliptic latitude is negligible.

## Already tracked (not re-filed)

- **#1802:** React stderr warnings in the CI test run. 687 `act(...)` lines, 5 `<div>`-in-`<p>` and 1 `createRoot`; the key warnings are fixed (#1803). Brief posted.
- **#1792 (high):** `reset-totp` reports success on a wrong database path. The entry-point check fails for paths with spaces, and on Windows.
- **#1801:** rotation residue-clearing follow-ups, blocked by #1792. **#1782:** TOTP rotation-review follow-ups. **#1500:** TOTP is in progress, and no TOTP routes are exposed yet.
- **#990 and #1324:** image CVEs waiting on Harbor and an upstream glibc fix. **#1371:** the screen-reader check.
- **#869:** 9 open citation items, among them the fixed-star 1° orb, the minor-aspect orbs (#1184), the modern points (#560) and the Paulus lots against the primary edition (#748).
- **#1796:** firdaria still cites a secondary summary.
- **#1794-#1799:** new doctrine features, all briefed.

## Not verified

- **Runtime behaviour:**
  - no running server, deployed container or `docker:smoke` run;
  - response headers were read from source, not observed;
  - contrast, keyboard and screen-reader behaviour were not tested in a browser.
- **Code paths:**
  - `tools/corpus-gen` was not reviewed;
  - the OIDC callback and the corpus import validation were read only for their guards, not traced in full;
  - `server/interpretation-routes.ts` (829 lines) was sampled at the generate route.
- **Doctrine:** checked by spot checks only:
  - sect and hayz were checked against the texts;
  - house systems, bounds tables, profections and zodiacal releasing were not re-verified against their sources in this pass;
  - their existing tests and citations were taken as they are.
- **Tests:** coverage was not measured. On this Windows host Vitest prints no React stderr, so all warning counts come from the Linux CI log.
