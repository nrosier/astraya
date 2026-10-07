# src/time/ — Map

Birth-moment resolution: turning a stated civil date/time + place into an exact
instant on the timeline, with historical timezone/DST/calendar handling, plus the
URL encoding used for shareable chart links. The highest-leverage correctness area
in Astraya — a one-hour error moves the Ascendant by about 15 degrees.

### `types.ts`
Domain Purpose: defines the shared vocabulary for birth-moment resolution. Responsibility: declares `CivilDateTime`, `Coordinates`, `Calendar`, `BirthMomentInput`, `ResolvedMoment` (with provenance, alternative offsets, warnings, and a tzdb fingerprint), and the `TimeWarning`/`TimeWarningCode` union. Key Dependencies: no imports; consumed by every other file in this directory and by `src/domain/`/`src/ui/` wherever a birth moment is passed around.

### `zones.ts`
Domain Purpose: supplies the pure timezone/Local Mean Time primitives that make offset resolution historically accurate rather than naively using today's tzdb rules. Responsibility: coordinate-to-IANA-zone lookup, fixed-offset (open-water) detection, LMT offset calculation, DST ambiguity/gap candidate enumeration, nearby-zone-boundary disagreement detection, and a tzdb version fingerprint. Key Dependencies: `tz-lookup` (typed via `src/types/tz-lookup.d.ts`), `luxon`'s `IANAZone`; used by `resolve.ts`.

### `resolve.ts`
Domain Purpose: the central birth-moment resolver — turns a stated civil time into a UTC offset with full provenance, surfacing ambiguity to the user instead of silently picking one answer. Responsibility: applies manual overrides first, then LMT/tzdb logic from `zones.ts`, generating `TimeWarning`s for DST overlaps/gaps, zone boundaries, and Julian-calendar dates; also resolves the Gregorian reform date. Key Dependencies: imports from `zones.ts` and `types.ts`; used by anything turning a `BirthMomentInput` into a `ResolvedMoment` before Julian-day conversion.

### `julian.ts`
Domain Purpose: bridges a resolved birth moment to the Swiss Ephemeris's actual time input, Julian day (UT). Responsibility: converts via `swe_utc_to_jd` for Gregorian dates from 1972 onward (leap-second aware), or via `swe_julday` plus elapsed day fraction for earlier/Julian-calendar dates; also converts a computed Julian day back to civil fields for display. Key Dependencies: `luxon` (`DateTime`, `FixedOffsetZone`), `EphemerisProvider`/`JulianDayUT` from `src/ephemeris/types.js`, `ResolvedMoment`/`CivilDateTime` from `types.ts`.

### `encode.ts`
Domain Purpose: makes a birth moment shareable and human-debuggable via a URL. Responsibility: encodes/decodes a `BirthMomentInput` to/from legible `URLSearchParams` (`?d=...&t=...&la=...&lo=...`), validates decoded fields, and derives a stable `momentKey` string safe for React dependency arrays. Key Dependencies: `BirthMomentInput`/`Calendar` from `types.ts`; used wherever chart links are built or parsed (`src/ui/`).
