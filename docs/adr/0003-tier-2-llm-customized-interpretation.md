# 3. Tier-2 LLM-customized interpretation

- **Status:** accepted
- **Date:** 2026-09-28

## Context

The interpretation shown on the "Standard" tab (`ReportView.tsx`) is Tier 1:
committed, reviewed, locale-complete corpus text, assembled entirely
client-side with no network call and no account — the same offline-first
posture as the rest of the app (ADR 0002). Users asked for a version of that
text restyled to their own tone (warmer, blunter, more concise, focused on a
particular theme) without hand-editing it themselves.

That restyling step is the one place in Astraya's whole runtime where an LLM
call is unavoidable: it is a request-time transformation of user-chosen
style against already-correct facts, not a build-time batch job like
`tools/corpus-gen` (which produces the committed Tier-1 corpus offline, with
no per-user variation and no live request path). Introducing it raises three
questions ADR 0002 didn't have to answer: what data reaches a third party,
where the credential lives, and what bounds the cost of a feature whose
unit cost is no longer zero.

## Decision

**Tier 2 is opt-in, authenticated, and per-request-consented.** It lives in
its own "AI-Customized" sub-tab alongside "Standard", gated by
`requireUser` — any signed-in user, not admin-only — and by a plain,
never-persisted consent checkbox: consent authorizes one specific request,
not a standing preference.

**Tier 2 has three modes — `'grounded'` (the default), `'freeform'` and
`'focus'` (#424) — and only `'grounded'` carries the guarantee below in
full.** (A further mode, `'synthesis'` (#377), was folded into `'freeform'` by
#425; see below.)

**In grounded mode, the client never sends birth data, chart data, or
interpretation prose.** It sends `placementKeys` (`report.ts`'s
`reportPlacementKeys` — e.g. `planet-in-sign:sun:4`) and `locale`. A
placement key is structurally incapable of carrying a name, a date, or
coordinates: it is built by `placementKey()` from a closed set of
category/body/sign/house/aspect tokens (`schema.ts`), not from anything a
user typed. The server (`server/interpretation-routes.ts`) re-resolves
each key's grounded Tier-1 text against its own copy of the corpus
(`resolvePlacementText`) — the facts a model sees are always ones this app
already reviewed and shipped, and the model's only job is to restyle that
given text, never originate new claims.

**In freeform mode, the client sends `chartData` — the reader's exact
computed positions, houses, and aspects — and the model originates its own
interpretation from them, rather than restyling reviewed text.** This is a
deliberate, explicit departure from the guarantee above, offered as an
opt-in second mode for readers who want more than a restyled version of
the reviewed corpus. `chartData` still never carries a name, birth date, or
location — it is `ChartData`'s computed output (`chart-compute.ts`), not
its input — but it is far more granular than a placement key (exact
degrees, not a bucketed sign/house category), and the model is free to say
things about the chart the corpus never wrote. Every numeric id and key in
`chartData` is still closed-set-revalidated server-side before it reaches
the prompt (`validateChartData`: `bodyById`, `aspectByKey`, and bounds
checks on every longitude/separation/orb) — the same anti-injection
discipline `validateKey` applies to grounded mode's placement keys, just
applied to a richer payload. Freeform mode does not get grounded mode's
"never originates content" guarantee; it is not offered as if it did.

**Freeform reasons across the whole chart, and its instruction is optional
(#425).** The model is told to reason across the placements together — where
they reinforce each other, where they create tension, what unified pattern
emerges — rather than describe each one in its own section, and to follow
the reader's form/style/tone/focus instruction when there is one. #377 had
added a separate `'synthesis'` mode for the first half (the same `chartData`,
a fixed task, no instruction); with freeform now doing that too, a reader who
wants both an integrated reading _and_ a say in its form needs only one mode,
and the one-click whole-chart reading is freeform with an empty instruction.
`'synthesis'` is still accepted on the wire as an older client's spelling of
`'freeform'` with no instruction, and is stored as `'freeform'`; saved
entries from before the change keep their `'synthesis'` mode and are shown
as AI-based like the rest. An empty or whitespace-only instruction means none:
there is nothing to check or verify, so no verification call is made.

**Focus mode (#424) explains the tensions of one selected placement.** From the
selection card on a wheel (a planet, natal or transiting), the client sends
`focusContext`: that placement's sign, house, dispositor, the houses it rules, and
each aspect it makes with the other planet's sign, house and rulerships
(`focus-context.ts`). Only that planet's data is sent, never the whole chart, and
nothing identifying: no name, date, time or place. Like `chartData`, it is not a
placement key, so focus mode shares freeform's departure from the "no chart data
crosses the wire" guarantee, and the consent text says what is sent. The task is
fixed and carries no reader-written text, so there is **no instruction and
nothing for the verifier (#411) to judge**: a `customPrompt` in this mode is
refused with 400 rather than ignored or passed on unchecked. The payload is
rebuilt from closed sets before it reaches the prompt (`validateFocusContext`,
in `focus-context-schema.ts`, which the server imports without the
chart-calculation modules), the same anti-injection discipline as `validateKey`
and `validateChartData`. The prompts are the specification's, with two restated
rules (stay within the data; no medical, legal or financial advice) and the
reply shape, so they do not contradict the other modes. Conventions, stated in
the module and in the payload (`rulership`): modern rulers, a planet rules a
house when it rules the sign on that house's cusp, the chart ruler is the ruler
of the Ascendant's sign, and "on an angle" means within 5° of the Ascendant,
Midheaven, Descendant or Imum Coeli. It goes through the same route, consent,
rate limit, cost caps, fail-closed handling and saved history as the other modes.

**`customPrompt` is the one field that structural guarantee doesn't cover.**
Free-form style/tone/focus instructions can't be made structurally incapable
of carrying a birth date, a request for medical/legal/financial advice, or
an attempt to redirect the model rather than describe a style. This gets a
second, best-effort line of defense instead: `prompt-guardrail.ts`, a pure,
deterministic module (no model call, importable by both the client for an
inline UX nicety and the server as the authoritative check) that rejects a
prompt containing prompt-injection phrasing, fatalistic phrasing,
medical/legal/financial claim language, a date/coordinate-shaped substring,
an off-topic request (files, systems, or access unrelated to the
interpretation itself), or a request to fabricate or ignore the reader's
actual chart facts (#394). The server runs this check regardless of what
the client already filtered — a bypassed or absent client check is not a
security gap, since the client's pass was never the boundary.

**The credential and the model call live only in
`server/interpretation/llm-client.ts`**, never in `src/`.
`test/no-runtime-llm-access.test.ts` enforces that boundary the same way it
already does for `tools/corpus-gen`'s provider keys. The key, model, and
base URL are `.env.local`-only server environment variables
(`ASTRAYA_INTERPRETATION_API_KEY` etc.) and are never sent to the browser.
Left unset, the server still starts and Tier 1 is unaffected — only
`POST /api/interpretation/generate` is disabled, returning 503.

**Real dollar caps bound spend, on top of a per-user rate limit.** A
request-count limit alone doesn't bound spend, since one call's cost varies
with prompt/output length — so every call's actual token usage is recorded
(`interpretation_usage`, migration 8) and two caps, in cents, are checked
before every model call: `ASTRAYA_INTERPRETATION_USER_DAILY_CENTS` (default 50) and `ASTRAYA_INTERPRETATION_TOTAL_DAILY_CENTS` (default 500). Either cap
hit returns 503, the same "feature temporarily unavailable" signal as "not
configured" — a cost cap is an operational limit, not a client error, so it
gets the status code that means "try again later" rather than one that
implies the request itself was wrong. The per-user-per-hour request limit
(20/hour, keyed by user id) sits below both caps as an anti-abuse floor,
stopping a single account from burning through a lot of small, cheap calls
before either cap has accumulated enough usage to trip.

### Two-phase check of `customPrompt` (#411)

The phrase-list guardrail is a cheap pre-filter, but any fixed list is defeated by rewording
("tell them they'll definitely get the job" matches nothing). A prompt that passes it is therefore
verified by a separate model call before anything is generated:

1. **Verify.** `verifyCustomPrompt` (`llm-client.ts`) sends the instruction, enclosed as untrusted
   data between `<reader_instruction>` tags, to the model with a policy-checker system prompt. The
   model must answer exactly `pass` or `fail: <reason>`. Only tone, style, and focus are allowed;
   instructions to lie, invent facts, promise outcomes, give medical/legal/financial advice, or
   redirect the model are not.
2. **Generate.** Runs only on `pass`.

Any output that is neither form is treated as `fail`, and a failed verification call returns 502 —
the check fails closed, never skipped. A rejection is a 422 with `code: 'customization-rejected'`
and the model's `reason` (written in the request's locale), which the UI shows alongside a fixed
"violates the allowed customization rules" message. The verification call is billed through
`interpretation_usage` whatever its verdict, so it counts toward both daily caps. Freeform
mode with no instruction has nothing to verify and skips this phase.

**Each interpretation gets a short description (#423).** The model is asked, in
the same call, for a label of a few words naming what was asked ("Short and
warm, focus on family"), which labels the entry in the reader's history next
to its local time and its kind (local-interpretation based or AI based). It is
model output built partly from the reader's own text, so it is untrusted: it is
shown as plain text, held to the rules an allowed instruction is
(`checkCustomPrompt`), kept to a few words on one line, and **fails closed** —
a label that does not pass is dropped and the history shows just the kind. It
summarises the reader's instruction, so it is stored **encrypted** like the
prose (`description_json`/`description_iv`, the same key), never in plaintext;
without the key, or with a rotated one, it reads as no label and the entry
still lists and opens.

## Consequences

Good:

- Nothing about Tier 1 changes: no account, no network call, works fully
  offline, exactly as before. Tier 2 is additive, matching ADR 0002's own
  "sign-in and sync are additive" precedent.
- The structural PII-minimization (placement keys) doesn't depend on anyone
  remembering to scrub anything at request time — a key that never held a
  name can't leak one.
- The credential boundary is enforced by a test, not just a convention.

Costs, stated plainly:

- Freeform mode sends real chart data (exact degrees, all bodies, all
  aspects, both angles) to a third party, and lets the model originate
  content rather than restyle reviewed text. This is a real reduction in
  the privacy and fact-grounding guarantees grounded mode provides,
  accepted knowingly as the cost of the mode's own reason to exist — not
  something the UI or this document should understate.
- `customPrompt`'s guardrail is best-effort, not structural — it can't
  detect a birth date typed as a fragment ("the fourth of July") or a
  disguised injection attempt. The model verification phase (#411) catches
  reworded violations the phrase lists miss, but it is itself a model
  judgment, so it is documented as a stronger filter rather than oversold as
  equivalent to the placement-key guarantee. It also adds one extra model call
  of latency and cost to every grounded/freeform request.
- The two cost caps are process-local counters over `interpretation_usage`,
  read fresh on every request — correct for Astraya's single-process
  deployment, but would need a shared store (not sqlite `:memory:`-per-
  process) if this server were ever run as more than one instance.
- Pricing constants in `llm-client.ts` (`estimateCostCents`) are documented
  as approximate; they bound spend to the right order of magnitude, not to
  the cent, and should be re-verified against the provider's published
  pricing periodically.
