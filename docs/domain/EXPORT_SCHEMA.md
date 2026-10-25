# Astraya export schema reference

Issue #561. The source of truth is `src/domain/full-export.ts`'s own `FullExport`/`ExportedPerson`/`ExportedChart`
TypeScript interfaces; this is the readable copy, paired with a hand-authored JSON Schema at
`docs/schema/astraya-export.schema.json` for external tooling that isn't TypeScript.

## What this covers, and what it doesn't

This is the **documented, versioned Astraya JSON schema** half of #561's two acceptance paths. Birth records can
also be exchanged with other astrology programs as **AAF** (whose records begin with an `#A93` chunk), from the
AAF'97 specification; that is a separate format with its own mapping and limits, documented in
`docs/domain/AAF_INTERCHANGE.md` (#591). This document commits only to Astraya's own JSON schema being stable, versioned,
and backward-compatibility-tracked.

## Top-level shape

```ts
interface FullExport {
  format: 'astraya-export'; // FULL_EXPORT_FORMAT — identifies this as an Astraya export, never changes
  version: number; // FULL_EXPORT_VERSION — see "Compatibility policy" below
  exportedAt: string; // ISO 8601 instant
  app: { version: string }; // the Astraya release that produced this file
  preferences: {
    settings: ExtendedSettings; // chart/extended-settings.ts — every calculation setting in force
    rulership: 'modern' | 'traditional' | 'both';
    symbolClass: string;
  };
  note: string; // human-readable summary of which settings were in force
  people: ExportedPerson[];
}

interface ExportedPerson {
  id: string;
  displayName: string;
  placeLabel: string;
  timeAccuracy: 'recorded' | 'remembered' | 'approximate' | 'unknown'; // Person['timeAccuracy']
  notes: string;
  birth?: BirthMomentInput; // absent if the birth record is incomplete
  missing: string[]; // required fields the stored record lacks
  relocationPlaces?: RelocationPlace[]; // #587 — named alternate places (#559), absent if none are saved
  customPoints?: CustomPointDefinition[]; // #587 — custom formula points (#566), absent if none are saved
  natalChart?: ExportedChart; // absent if birth is incomplete, or chartError explains a failure
  harmonicCharts?: ExportedHarmonicChart[]; // named Varga charts, absent without usable houses
  chartError?: string;
  calculation?: CalculationArtifact; // #582 — natal inputs, provenance and SHA-256 fingerprints; see below
}

interface ExportedHarmonicChart {
  key: string; // Varga preset key, currently D1/D9/D10
  label: string;
  harmonic: number;
  convention: string; // #725 — the preset's convention note, English; D10 says the classical odd/even sign restart is not applied
  source: {
    kind: 'radix';
    transform: 'longitude-times-n-mod-360';
    houses: 'whole-sign-from-harmonic-ascendant';
  };
  radixPositions: HarmonicPositionProvenanceRow[]; // each body’s radix and transformed longitudes
  chart: ExportedChart;
}

interface ExportedChart {
  sect: 'day' | 'night';
  positions: PositionRow[]; // chart-tables.ts's own row shapes — see that module for each row's fields; #724 adds optional `stationary`/`stationType`, present only with the station window on
  houses?: {
    cusps: HouseCuspRow[];
    angles: AngleRow[];
    derivedPoints: DerivedPointRow[];
  }; // absent if the birth time is unknown or the house system has no solution at this latitude
  aspects: AspectRow[];
  dignities: DignityRow[];
  dispositors: DispositorRow[];
  antiscia: AntisciaRow[]; // #556 — always computed, independent of any setting
  declinations: DeclinationContactRow[]; // #556 — always computed, independent of any setting
  midpointTree: MidpointTreeRow[]; // #556 — empty unless `dial90Visible` is set
  allMidpoints: AllMidpointsRow[]; // #555 — empty unless `midpointsVisible` is set
}
```

Every row type (`PositionRow`, `HouseCuspRow`, `AngleRow`, `DerivedPointRow`, `AspectRow`, `DignityRow`,
`DispositorRow`, `AntisciaRow`, `DeclinationContactRow`, `MidpointTreeRow`, `AllMidpointsRow`) is a flat object of
plain strings/numbers/booleans, defined and exported from `src/domain/chart-tables.ts`. This document does not
restate every field of every row type — that would duplicate (and risk drifting from) the TypeScript source; the
JSON Schema file does enumerate them structurally.

## Compatibility policy

`FULL_EXPORT_VERSION` is a plain integer, exported from `src/domain/full-export.ts`.

- **Additive, non-breaking change — no version bump required:** adding a new optional field to any existing
  interface, or a new row type gated behind its own setting (so an old reader simply doesn't recognise the key and
  ignores it). Most of this schema's growth so far has been this kind (e.g. #556/#555's `antiscia`/`declinations`/
  `midpointTree`/`allMidpoints` fields).
- **Breaking change — version bump required, and must be noted in this document's own changelog below:** removing
  a field, renaming a field, changing a field's type or required-ness, or changing the meaning of an existing value
  without changing its shape (e.g. a sign-index convention changing from 0-based to 1-based).
- **Restore** (#587). `src/domain/full-export-importer.ts` validates and stages a restore:
  `validateFullExport` strictly checks `format` and `version` against `FULL_EXPORT_VERSION` — rejecting both
  older and newer files by name, never guessing — and the per-field shape of each `ExportedPerson`'s birth
  record, named places and custom points, reusing the same field readers `src/domain/person.ts` already applies
  to the op-log itself (not a second, looser validator), and rejects two people sharing one id or a person id
  that is itself a reserved register name (`__proto__`/`constructor`/`prototype`), rather than letting either
  reach `store.mutate` and fail in a way the preview never explained. It deliberately never validates or restores
  `natalChart`/`harmonicCharts`/`chartError`/`calculation`: the birth record is this file's own stated source of
  truth, and a chart is always recomputable, so restoring a stale computed chart from a file would be restoring
  exactly what this project refuses to treat as truth. A calculation snapshot arriving from outside the
  device (a share link) goes through `decodeCalculationSnapshot` (#717), which refuses an unsupported future
  version or an unregistered/out-of-range calculation field with a typed `SnapshotDecodeError`, and migrates
  v1/v2/unversioned payloads deterministically; `parseCalculationSnapshot`'s best-effort, field-by-field repair is
  kept only for a device's own saved default. The importer likewise fails closed and names what's unsupported.
  `stageFullExportRestore` then classifies each person new/updated/unchanged against this device's current
  people and builds the exact field-level mutations a restore would write, touching only fields that actually
  differ. A person already soft-deleted on this device (`store.state.deleted.people`) is classified
  `deletedLocally` instead of `new`: `deleted` is its own last-write-wins register (`fold.ts`), untouched by a
  restore, so writing every other field would not make them reappear — the preview says so rather than
  claiming a "new" person who, after confirming, stays invisible. The UI (`PreferencesView.tsx`, Data &
  privacy) previews this before writing anything, and applies it as one `store.mutate` call so the whole
  restore commits atomically (one IndexedDB transaction) or not at all.
- **Check** (#582 follow-up). `verifyCalculationArtifact` (`src/domain/calculation-artifact.ts`) existed and
  was tested in isolation but had no caller anywhere in the app — #582's own stated goal, verifying an old
  result after an ephemeris/timezone/policy upgrade, had no UI. `src/domain/full-export-check.ts`'s
  `checkExportedCalculations` is the one place that reads a `calculation` field at all, deliberately apart from
  restore: checking whether an old chart still reproduces is a different question from deciding whether to
  restore people from the same file, and restore's own validator never trusts that field for what it writes.
  It reads `calculation` straight off the file's raw, unvalidated `people` array (matched by index against
  `validateFullExport`'s trusted `id`/`displayName`), and relies on `verifyCalculationArtifact`'s own SHA-256
  integrity check — rather than a second parallel shape validator — to turn a malformed artifact into an
  `'inconsistent'` verdict or a caught, per-person `'error'`, never a crash. The UI (`PreferencesView.tsx`,
  Data & privacy, "Check a calculation file…") only ever reads a file and shows verified/changed/inconsistent/
  no-artifact/error per person — it writes nothing, so unlike Restore it has no confirm step.

## Version history

- **v1** (initial, #541-era): `format`, `version`, `exportedAt`, `app`, `preferences`, `note`, `people[]`, with
  each `ExportedChart` carrying `sect`/`positions`/`houses`/`aspects`/`dignities`/`dispositors`.
- **v2** (#561, this document): adds `antiscia`/`declinations`/`midpointTree`/`allMidpoints` to `ExportedChart`.
  These fields were actually added across two earlier changes in the same work session (#556, then #555) _without_
  a version bump — a lapse against the policy this document itself states. This bump corrects that retroactively
  (the shape a v1-labelled file could have had was already stale by the time this document was written) and is the
  first version bump made under the policy above, going forward. #557 later added optional `harmonicCharts` with
  radix-to-result position provenance for the named Varga presets; it is additive, so the version remains v2.
  #725 added `ExportedHarmonicChart.convention`, the preset's convention note (D10: no odd/even sign restart); additive, still v2.
  #582 added optional `ExportedPerson.calculation`, the natal chart's `CalculationArtifact`; also additive, still v2.
  #587 added optional `ExportedPerson.relocationPlaces`/`customPoints` — both read internally for chart
  computation since #559/#566 but never carried back out, so a restore built on an export missing them would
  have been lossy; also additive, still v2.
  #724 added the optional station-window and motion-score settings (`preferences.settings.stationWindow`/`motionScore`), the
  optional positions `stationary`/`stationType` fields, and a `note` disclosure, all present only while on; additive, still v2.

## Calculation artifact

`ExportedPerson.calculation` (#582) records what produced `natalChart`, defined in `src/domain/calculation-artifact.ts`:

- `moment` and `snapshot` — the complete inputs: the birth record, and the settings, rulers and custom points.
- `provenance` — the app and Swiss Ephemeris versions, the pinned SHA-256 of every ephemeris data file, the requested
  and effective house system (they differ when the engine falls back, e.g. Placidus inside a polar circle) with the
  engine's warning, and how the birth time became an instant: offset, its source (`manual`, `tzdb`, `lmt`), zone,
  calendar, DST alternatives, time warnings and the runtime's tzdb fingerprint.
- `fingerprint` — lower-case hex SHA-256 of a canonical JSON text (object keys sorted, `Map`s as key-sorted entry
  lists, `NaN`/`Infinity` as strings, `undefined` fields omitted): `snapshotHash` over the snapshot, `inputHash` over
  `{ moment, snapshot }`, and `resultHash` over the full computed `ChartData`, not over the exported rows.

The same inputs on the same engine, data files and tzdb give the same `resultHash`. It is absent when the exporting
browser had no Web Crypto (a non-secure context).

## Station window and motion score

Two optional settings (#724) are both **off by default**, and an absent field is the off state, so an export made with
both off is byte for byte what it was before they existed. Neither changes the Almuten or any other score.

- **`preferences.settings.stationWindow`** — `{ k }`, present only when the window is on. **This is an Astraya
  convention, not a cited rule.** Avelar & Ribeiro (2010) give the mean speeds (pp. 59–60) and define a station (p. 61)
  but give no speed threshold, so `k` (default 0.05) is chosen here, not taken from the source. A planet is stationary
  when `|longitudeSpeed| ≤ k × meanDailySpeed`, inclusive at the boundary. Mercury through Pluto qualify; the Sun, the
  Moon, nodes, Lilith, Chiron and asteroids never do.
- **`preferences.settings.motionScore`** — `true` only when on. Display-only: it adds scoring to the condition table and
  changes no calculated value.
- **Positions rows** — with the window on, a planet inside it has `stationary: true`, and `stationType: 'first' | 'second'`
  when the type can be told. A stationary planet whose type cannot be told has `stationary` alone. Rows are unchanged with
  the window off.
- **The note** — `note` gains a sentence naming the convention, its `k`, and the citations (mean speeds: A&R 2010, pp. 59–60;
  a station: p. 61; the motion score: p. 197) only while either setting is on.

**Method and citations, for a reader of the file:**

- Mean daily speeds (degrees per day): Saturn 0°02'01", Jupiter 0°04'59", Mars 0°31'27", Sun, Venus and Mercury each 0°59'08",
  Moon 13°10'36" — Avelar & Ribeiro (2010), pp. 59–60. Uranus, Neptune and Pluto have no figure in that book: their
  station detection uses 360 divided by the orbital period from the NASA Planetary Fact Sheet (30589, 59800 and 90560 days), a modern figure, not from
  Avelar & Ribeiro, and they never get a motion score.
- First and second stations: the first is the station a planet makes in direct motion, before its retrograde phase, and
  the second the one made in retrograde motion, before its direct phase (A&R 2010, p. 61). The type comes from the sign of
  the longitude acceleration at that moment.
- Motion score (A&R 2010, p. 197): direct +4, retrograde −5; a first station scores as retrograde, a second as direct;
  fast (faster than mean speed) +2, slow −2. The Sun and Moon get the speed points only, as decided for this app.
- The window threshold itself is uncited: it is an Astraya convention.

## How this is kept true

- `test/domain-full-export.test.ts` asserts `FullExport.version` matches `FULL_EXPORT_VERSION` and exercises every
  `ExportedChart` field's presence/absence rules (houses undefined, antiscia/declinations always present, midpoint
  fields gated on their settings).
- `docs/schema/astraya-export.schema.json` is the external-tooling-facing structural counterpart; keep both in
  step with `src/domain/full-export.ts`/`src/domain/chart-tables.ts` when either changes.
- `test/domain-full-export-importer.test.ts` exercises the restore side: `validateFullExport` against a real
  archive and against versions both older and newer than `FULL_EXPORT_VERSION`, malformed-field and
  duplicate/reserved-id rejection, `stageFullExportRestore`'s new/updated/unchanged/deletedLocally
  classification (including that a soft-deleted person's fields update without un-deleting them), and —
  against a real store — that a restore batch containing one malformed mutation commits none of it. A separate
  `describe` block in the same file asserts, structurally, that the version check imports `FULL_EXPORT_VERSION`
  and never references `calculation-snapshot.ts` — a numeric-mismatch test alone can't tell "the right
  constant" from "a wrong one that currently happens to share its value," which is exactly how #605 slipped
  through once already. `test/ui-PreferencesView.messages.test.ts` checks the restore strings' actual wording
  (pluralization, per-locale status words) in both `en` and `nl`, which key-parity and compile-time checks
  don't catch.
