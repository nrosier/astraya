# Astraya export schema reference

Issue #561. The source of truth is `src/domain/full-export.ts`'s own `FullExport`/`ExportedPerson`/`ExportedChart`
TypeScript interfaces; this is the readable copy, paired with a hand-authored JSON Schema at
`docs/schema/astraya-export.schema.json` for external tooling that isn't TypeScript.

## What this covers, and what it doesn't

This is the **documented, versioned Astraya JSON schema** half of #561's two acceptance paths — not AAF/A93
compatibility. AAF (Astrological Automated Format) and A93 are referenced in `docs/audit/ASTROLOGY_REVIEW.md` as a
gap, but this project has no verified knowledge of either wire format's actual field-level specification or
licensing terms, and researching those external specs was out of scope for this pass. Rather than guess at a
compatibility claim this project cannot back up, this document commits only to Astraya's own schema being stable,
versioned, and backward-compatibility-tracked — exactly what the issue's acceptance criterion asks for even when an
external format adapter can't ship ("the documented Astraya schema satisfies the issue even if an external format
cannot be implemented safely," per `docs/audit/IMPLEMENTATION_PLAN.md`'s own framing of this task).

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
  timeAccuracy: 'recorded' | 'estimated' | 'unknown'; // Person['timeAccuracy']
  notes: string;
  birth?: BirthMomentInput; // absent if the birth record is incomplete
  missing: string[]; // required fields the stored record lacks
  natalChart?: ExportedChart; // absent if birth is incomplete, or chartError explains a failure
  harmonicCharts?: ExportedHarmonicChart[]; // named Varga charts, absent without usable houses
  chartError?: string;
}

interface ExportedHarmonicChart {
  key: string; // Varga preset key, currently D1/D9/D10
  label: string;
  harmonic: number;
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
  positions: PositionRow[]; // chart-tables.ts's own row shapes — see that module for each row's fields
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
- There is currently no reader/importer for `FullExport` (`buildFullExport` is write-only) — so there is no
  automated backward-compatibility _test_ against an old version's output yet. A future importer, if built, should
  strictly validate the schema version and reject unsupported versions with a clear error. Note: `parseCalculationSnapshot`
  currently uses best-effort defaulting for missing fields rather than strict validation (see #583); a future importer
  should instead fail closed and name what's unsupported, never guess or silently default.

## Version history

- **v1** (initial, #541-era): `format`, `version`, `exportedAt`, `app`, `preferences`, `note`, `people[]`, with
  each `ExportedChart` carrying `sect`/`positions`/`houses`/`aspects`/`dignities`/`dispositors`.
- **v2** (#561, this document): adds `antiscia`/`declinations`/`midpointTree`/`allMidpoints` to `ExportedChart`.
  These fields were actually added across two earlier changes in the same work session (#556, then #555) _without_
  a version bump — a lapse against the policy this document itself states. This bump corrects that retroactively
  (the shape a v1-labelled file could have had was already stale by the time this document was written) and is the
  first version bump made under the policy above, going forward. #557 later added optional `harmonicCharts` with
  radix-to-result position provenance for the named Varga presets; it is additive, so the version remains v2.

## How this is kept true

- `test/domain-full-export.test.ts` asserts `FullExport.version` matches `FULL_EXPORT_VERSION` and exercises every
  `ExportedChart` field's presence/absence rules (houses undefined, antiscia/declinations always present, midpoint
  fields gated on their settings).
- `docs/schema/astraya-export.schema.json` is the external-tooling-facing structural counterpart; keep both in
  step with `src/domain/full-export.ts`/`src/domain/chart-tables.ts` when either changes.
