# AAF birth-record interchange

Issue #591. Astraya reads and writes birth records in AAF (Astrological Automated Format), the exchange format for
astrological data supported by several European astrology programs. Code: `src/domain/aaf.ts` (the format) and
`src/domain/aaf-people.ts` (people). Use it from Preferences → Data: **Export people (AAF)**, and **Restore from
file…** with an `.aaf` file.

## Source

The AAF'97 format specification, dated 3 February 1997, by Martin Garms and Tobias Ferber:
<http://www.astrowissen.de/aaf/eng/lib/aafspecs.htm>. The field grammar is transcribed, with section numbers, in
`docs/references/topics/aaf-chunks.json`.

The specification pages state no licence. The separate AAF library is commercial and copyrighted (1994–97). Astraya
implements the format from the specification's field descriptions and its own sample records only; nothing is
copied from the library or its sample programs.

## What is exchanged

Birth records only, the narrow path the issue asks for. The specification itself advises against storing computed
charts ("computing the chart data takes only very few CPU time"), so a chart is always recalculated from the record.

| AAF chunk and field            | Astraya              | Notes                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#A93` 0 name, 1 first name    | display name         | Export writes the whole display name as field 0 and leaves field 1 empty, so no name is split by guesswork. Import joins first and last name as "First Last".                                                                                                                                                 |
| `#A93` 2 sex/type              | —                    | Not stored by Astraya. Written as `*` (unknown); `m f w e l o` are accepted on import.                                                                                                                                                                                                                        |
| `#A93` 3 date                  | civil date, calendar | `day.month.year`; `g`/`j` written when the calendar is set. With no suffix, the reform date decides, as in Astraya.                                                                                                                                                                                           |
| `#A93` 4 civil time            | civil time           | `hh:mm` or `hh:mm:ss`; `h` as the separator is accepted on import.                                                                                                                                                                                                                                            |
| `#A93` 5 place                 | place label          |                                                                                                                                                                                                                                                                                                               |
| `#A93` 6 country               | —                    | Not stored. Written as `*`, ignored on import.                                                                                                                                                                                                                                                                |
| `#B93` 0 Julian day            | —                    | Written as `*`, which the specification recommends. Not read: Astraya computes it.                                                                                                                                                                                                                            |
| `#B93` 1 latitude, 2 longitude | coordinates          | `dd`n/s`mm`[`:ss`], `ddd`e/w`mm`[`:ss`].                                                                                                                                                                                                                                                                      |
| `#B93` 3 Greenwich offset      | stated UTC offset    | Standard time, without daylight saving, as the specification defines it; `he`/`hw` with optional minutes. `*` when no offset is stated, which makes Astraya look the zone up.                                                                                                                                 |
| `#B93` 4 time type             | added to the offset  | On import `0` and `m` add nothing, `1` and `w` add 60 minutes, `2` adds 120, `h` adds 30, and `L` (local mean time) states no offset. Astraya writes the full offset with type `0`. Checked against the specification's own Niehenke record, whose Julian day confirms 1 hour plus 1 hour of daylight saving. |
| `#SRC`, `#VIA`, `#COM`         | — / — / notes        | `#COM` is read into notes on import.                                                                                                                                                                                                                                                                          |
| `#:`                           | extension            | See below.                                                                                                                                                                                                                                                                                                    |

### The Astraya extension

AAF has no field for some of what Astraya stores. These travel in one `#:astraya` chunk, which the specification
(section 2.5) says every AAF reader ignores: the person's id, time accuracy, notes, a time-zone override, an `auto`
calendar, saved relocation places, formula points, and the coordinates at full precision. A file written by Astraya
therefore re-imports unchanged; another program sees only the standard chunks.

The full-precision coordinates are used only when they agree with the `#B93` fields to within half an arc-second
(AAF's own rounding). If another program has edited the coordinates, they no longer agree, and the `#B93` values are
used.

## What is not claimed

- **Not imported:** `#SUB` sub-records (alternate data, returns), `#ZNAM`, and the computed chunks (`#LPOS`, `#BPOS`,
  `#ZPOS`, `#GVAL`, `#HPOS`, `#ASP`). A `#SUB` record is not treated as a new person.
- **Coordinates from another program** are only as precise as the file: whole arc-minutes or arc-seconds.
- **A person without a complete birth record** is not exported (AAF requires a date and coordinates); the export
  reports how many were left out.
- **Compatibility is claimed only for what the tests cover**: the specification's own sample records, read field by
  field (`test/domain-aaf.test.ts`), and the round trips in `test/domain-aaf-people.test.ts`. No other program's
  output has been tested.

## Not a JSON schema

The issue's background mentioned JSON payloads used by commercial APIs and the Astro-Databank XML export. Astraya's
own JSON export already has a published, versioned schema (`docs/domain/EXPORT_SCHEMA.md`); those other formats are not
implemented, because no verified specification for them is in hand.
