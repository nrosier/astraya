# #739: Fixed-star registry spec (Yemen baseline)

Written for: the engineer who builds the registry, and the astrologer agent who reviews it.

## Decisions (from the issue, 2026-10-20)

1. **Star list:** the Yemen star table, one cited edition. Source: Kunitzsch and Langermann, "A Star Table from Medieval Yemen", the fixed-star table in al-Fārisī's _Zīj al-Muẓaffarī_, printed pp. 167–169 (PDF pp. 9–11). The reference PDF is local only and gitignored.
2. **Default orb:** 1.0°. This is the sole default. It is an Astraya convention, labelled as such, and configurable. No magnitude-based or 1°–2° variant is offered.
3. **Positions:** each longitude is advanced from the 1262 epoch to the chart's date by general precession in longitude (see Precession below). No stellar proper motion is applied.

## Authority line (required on every entry)

The table is the fixed-star table in al-Fārisī's _Zīj al-Muẓaffarī_ (Yemen, c. 1270), as published by Kunitzsch and Langermann, "A Star Table from Medieval Yemen", pp. 167–169. It belongs to al-Fārisī's work on the _ʿAlāʾī Zīj_. Van Dalen (_Islamic Astronomical Tables_) describes the _Muẓaffarī_ as a reworking of the ʿAlāʾī Zīj with adjustments for the author's geographical location and time. Whether al-Fahhād himself observed or compiled these stellar positions is unverified in the critical literature: Kunitzsch and Langermann (p. 162) leave open whether he made new observations of the fixed stars. The longitudes are Ptolemy's, precessed by 17;11 (Kunitzsch and Langermann, p. 162; van Dalen does not confirm this figure). The caption fixes the epoch as "the beginning of the year 631 Yazdijird, which is the 16th day of Ṣafar of the year 660 A.H.", which the editors convert to 10 January 1262 CE in the Julian calendar.

Every entry's authority string must carry these facts: the author and zīj, the ʿAlāʾī Zīj link, the 17;11 precession, and the 1262 Julian epoch.

## Precession

Each longitude is taken as printed for the 1262 epoch and advanced to the chart's date by general precession in longitude: 5029.0966 arcseconds per Julian century (IAU 1976 value, Lieske et al. 1977, _Astronomy and Astrophysics_ 58). The epoch is 10 January 1262 in the Julian calendar, Julian Day Number 2182013 at midday, which is Julian Day 2182012.5 at 0h. The offset is linear in days from that epoch, divided by 36525 days per Julian century.

This rate is the project's decision, not a historical value. Al-Fārisī's own rate (1° per 66 years) is not used, and no stellar proper motion is applied.

Citation status: the IAU 1976 value is recorded from the published constant and has not yet been checked against a source in docs/references/. Check it before the registry is merged, and say here whether it was checked.

## Which printed rows become entries

- **Included:** every printed row with a full longitude (sign, degree and minute). There are 68 such rows.
- **Excluded:**
  - Row 28a: it repeats row 28's longitude exactly (Lib 0;41), and the print says "same as no. 28".
  - Row 64: it has no longitude at all.
- **Folded, not a separate entry:** row 33c. The print says "same as no. 33", and it has the same name as row 33 (sābiʿ banāt naʿsh / al-qāʾid). Its printed longitude (Vir 17;1) differs from row 33's (Vir 16;15). Record it as a variant longitude of row 33 (see the fields). A separate entry would count η UMa twice, 46′ apart.
- **Net:** 66 entries.

## Fields per entry

`id`, `arabicName`, `signIndex`, `signPrinted`, `degree`, `minute`, `latitudeText`, `latitudeHemisphere`, `magnitudeText`, `temperaments`, `peters_knobel`, `modernId`, `notes`, `variantLongitudes`. Authority is one constant (`YEMEN_STAR_AUTHORITY`) shared by every entry, not a per-entry field. Transliteration is not stored separately; `arabicName` is kept as printed. `variantLongitudes` holds any folded variant longitudes (row 33 only, from row 33c) and is empty otherwise. Variants are never used for conjunctions.

## Values kept as printed, never corrected

- Bracketed values: row 6 (latitude hemisphere), row 8 (latitude hemisphere), row 59 (sign "[Sgr]", magnitude 3 in print). Store the bracket state in a `printedAs` field, or mark the value as uncertain.
- Row 32: the sign "(Gem)" is printed in brackets, with the degree and minute on a second line. Store as printed; do not treat the bracketed sign as a plain sign.
- Rows 57 and 63: no latitude hemisphere printed. Store the latitude value with an empty hemisphere, and do not infer one.
- Row 56: the name is printed with a "?" inside it. Store as printed.
- Multi-pair temperaments (18 rows): store every pair, in printed order.
- Editors' flagged values, recorded in `confidence` and not corrected: rows 23, 27, 32 and 49 differ from the Almagest values the editors give (23 should be 1;21; 27, 19;21; 32, Gem 14;31; 49, 13;31). Row 63's latitude is flagged (19 for 59).
- Rows 22 (19;42) and 62 (12;17) break the otherwise regular ;1 pattern of minutes. Record them as printed.

## Verification

- Every entry's longitude must match the transcription in `/tmp/yemen-verify/transcription.csv`, which is local and not in the repo. Keep a copy of the CSV's values in the test fixture, so the test does not depend on `/tmp`.
- Pages 167, 168 and 169 were checked by eye against the page images. Any value changed later needs a fresh check of its page.
- No position has been checked against a second catalogue. The registry's tests can check internal consistency (count, duplicates, sign ranges, degree and minute ranges), not agreement with another source.

## Out of scope for the first build

- Positions in the chart and report. Chart display is a separate decision (see #748 for the analogous lots question).
- Stellar proper motion, and any precession model other than the one in the Precession section.
- Star-to-planet conjunction scoring beyond the existing `fixed-stars.ts` 1.0° check, which uses the default orb.
- Medieval or Ptolemaic alternative lists.

## Open questions for the astrologer review

1. Confirm the precession citation (see the Precession section) against its source, and record the result there.
2. Confirm the Bonatti fixed-star orb reference (Treatise 8, Part 1, ch. 108) against a page image before any reference to it is written into the spec or the code. Until then, 1.0° is an Astraya convention with no cited source.
