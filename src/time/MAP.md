# src/time/ — Map

Birth-moment resolution: civil date/time + place → exact instant on timeline. Historical timezone/DST/calendar handling. One-hour error moves Ascendant ~15°.

- `types.ts` — Shared vocabulary: `CivilDateTime`, `Coordinates`, `Calendar`, `BirthMomentInput`, `ResolvedMoment` (provenance, alternatives, warnings, tzdb fingerprint), `TimeWarning`/`TimeWarningCode`. Deps: none.
- `zone-data.ts` — Loads the tz-lookup and luxon modules once with a dynamic import() at startup (`loadZoneData`), and hands them to the synchronous time functions. Deps: tz-lookup, luxon.
- `zones.ts` — Timezone/LMT primitives: coordinate→IANA lookup, fixed-offset detection, LMT calculation, DST ambiguity/gap candidates, zone-boundary disagreement, tzdb fingerprint. Deps: zone-data.
- `resolve.ts` — Birth-moment resolver: civil time → UTC offset with provenance. Manual overrides, LMT/tzdb logic, `TimeWarning`s for DST overlaps/gaps/boundaries, Gregorian reform. Deps: zones, types.
- `julian.ts` — Resolved moment → Julian day (UT). `swe_utc_to_jd` for Gregorian ≥1972 (leap-second aware), `swe_julday` for earlier/Julian-calendar. Gregorian→civil conversion. Deps: zone-data, ephemeris/types, types.
- `encode.ts` — Shareable, debuggable URL encoding: `BirthMomentInput` ↔ `URLSearchParams` (`?d=...&t=...&la=...&lo=...`). Stable `momentKey`. Deps: types.
