# Astraya Calculation Integrity

Use while writing or changing code under `src/ephemeris/`, `src/astrology/`, or anything that reads a `cusps`/body-position array — not at review time (that's the `astrologer` agent). Guards the sweph-wasm import boundary, the house-array indexing landmine, and the golden-chart gate, so a mistake is caught before a PR exists rather than after.

## The one import boundary that must never move

Per `docs/adr/0001-swiss-ephemeris-as-the-engine.md` and `eslint.config.js`'s `no-restricted-imports`: `sweph-wasm` is importable **only** inside `src/ephemeris/`. Everywhere else goes through `EphemerisProvider` (`src/ephemeris/types.ts`). Before adding any new import of `sweph-wasm`, or re-exporting something that transitively drags it in:

- Check the file path first — if it's not under `src/ephemeris/`, don't import it; find or add the method on `EphemerisProvider` instead.
- `npm run check`'s lint pass enforces this (ESLint error, not a style nit), but don't rely on catching it after the fact — writing the import at all means redoing the change through the provider.

## The `cusps[0]` landmine

The bundled `sweph-wasm` `.d.ts` claims `cusps[0]` is the first house. **It is wrong** — verified empirically against a live instance: the array has 13 entries, index 0 is unused, `cusps[1]` is the Ascendant, `cusps[10]` is the MC. Any new code that:

- indexes a cusps array by `house - 1` into what looks like a 0-based array, or
- assumes every house system has 12 cusps (`cuspCount: 12`) for a fixed-size array or a `house % 12` — Gauquelin sectors (`'G'`) have `cuspCount: 36`

is reintroducing exactly the bug ADR 0001 exists to warn against. Index by house number directly into the 1-based array, and read `cuspCount` from `houseSystemByCode(...)` rather than hardcoding 12.

## Before you believe a number: run the gate, don't hand-verify it

`test/golden-chart.test.ts` (#8) compares real Swiss Ephemeris output against NASA/JPL Horizons fixtures — never written by hand, fetched via `scripts/fetch-horizons-fixture.mjs`. Tolerances are two-tier (≈0.05″ baseline, wider only for predicted delta-T on fast-moving bodies in future dates) and are measured, not aspirational — don't widen a tolerance to make a change pass; that hides a real regression.

- A change anywhere near `src/ephemeris/` must leave `npm run test` green on this suite before you consider the change plausible, not just before you commit.
- Never hand-check a position number by comparing it to a different tool's output in the diff/PR description — if the gate didn't run, the number isn't verified, no matter how plausible it looks (a chart has no obviously-broken state; it just quietly describes the wrong person).
- `swe_set_sid_mode`/`swe_set_topo` are global mutable state on the WASM instance, not per-call arguments — a new call path that doesn't go through the single serialized request queue in `src/ephemeris/engine.ts`'s worker can race another request's sidereal mode or topocentric setting.

## Reproducible snapshots

If you're adding a new reference fixture or regenerating one, it must come from `scripts/fetch-horizons-fixture.mjs` against the live Horizons service, committed under `test/fixtures/` — never typed in by hand, even "to match what the engine currently returns," since that would make the gate certify whatever the engine happens to do rather than what it should do.

## Cross-reference, don't duplicate

For whether a new technique's *convention* is cited correctly (which tradition, which named school when sources disagree), whether an orb/dignity table matches what `src/astrology/*.ts`'s own doc comments say, or interpretation-corpus content correctness — that's the `astrologer` agent's job at review time, not this skill's. This skill is scoped to the ephemeris boundary and the numeric gate; use the agent for astrological-convention correctness.
