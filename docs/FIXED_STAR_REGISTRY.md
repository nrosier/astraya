# #739: Fixed-star registry spec (Yemen baseline)

Written for: the engineer who builds the registry, and the astrologer agent who reviews it.

## Decisions (from the issue, 2026-10-20)

1. **Star list:** one cited historical edition, the Yemen star table. Source: Kunitzsch and Langermann, "A Star Table from Medieval Yemen", the fixed-star table in al-Fārisī's _Zīj al-Muẓaffarī_, printed pp. 167–169 (PDF pp. 9–11). The reference PDF is local only and gitignored.
2. **Default orb:** 1.0°. This is an Astraya convention, labelled as such, and a visible setting. It has no historical citation.
3. **Positions:** precession only. No proper motion.

## Authority line (required on every entry)

The table is the fixed-star table in al-Fārisī's _Zīj al-Muẓaffarī_ (Yemen, ca. 1270), published by Kunitzsch and Langermann, "A Star Table from Medieval Yemen", pp. 167–169. Van Dalen (_Islamic Astronomical Tables_) describes the _Muẓaffarī_ as "a reworking of the Alā'ī Zīj with adjustments for the author's geographical location and time", so the table descends from al-Fahhād's zīj, not from an independent observation. Its longitudes are Ptolemy's, precessed by 17;11 (Kunitzsch and Langermann; van Dalen does not confirm this figure). The caption fixes the epoch as "the beginning of the year 631 Yazdijird, which is the 16th day of Ṣafar of the year 660 A.H." The article converts that date to 10 January 1262 CE.

Every entry's authority string must carry all of these facts: the author and zīj, the lineage from al-Fahhād's Alā'ī Zīj, the precession of 17;11, and the epoch. The registry is therefore a 13th-century Yemeni reworking, not Ptolemy's catalogue directly.

## Which printed rows become entries

- **Included:** every printed row with a full longitude (sign, degree and minute). That is 68 candidate rows, before the exclusions below.
- **Excluded:**
  - Row 28a: it repeats row 28's longitude exactly (Lib 0;41), and the print says "same as no. 28".
  - Row 64: it has no longitude at all.
- **Kept as its own entry, despite the print:** row 33c. It is printed "same as no. 33", but its longitude (Vir 17;1) differs from row 33's (Vir 16;15). Keep it with its printed position. Flag the mismatch for the astrologer review.
- **Net:** 67 entries.

## Fields per entry

`id` (the printed row number, as text, so "33a" and "33c" stay distinct), `arabicName` (as printed, with diacritics), `transliteration`, `sign`, `degree`, `minute`, `latitude` (value and hemisphere, or empty), `magnitude` (integer or empty), `temperaments` (an array; each printed pair kept as one entry, e.g. `["Mars", "Mercury"]`), `peters_knobel`, `modernId` (e.g. "α Aur"), `authority`, `confidence`.

## Values kept as printed, never corrected

- Bracketed values: row 6 (latitude hemisphere), row 8 (latitude hemisphere), row 59 (sign "[Sgr]", magnitude 3 in print). Store the bracket state in a `printedAs` field, or mark the value as uncertain.
- Row 32: the sign "(Gem)" is printed in brackets, with the degree and minute on a second line. Store as printed; do not treat the bracketed sign as a plain sign.
- Rows 57 and 63: no latitude hemisphere printed. Store the latitude value with an empty hemisphere, and do not infer one.
- Row 56: the name is printed with a "?" inside it. Store as printed.
- Multi-pair temperaments (18 rows): store every pair, in printed order.

## Verification

- Every entry's longitude must match the transcription in `/tmp/yemen-verify/transcription.csv`, which is local and not in the repo. Keep a copy of the CSV's values in the test fixture, so the test does not depend on `/tmp`.
- Pages 167, 168 and 169 were checked by eye against the page images. Any value changed later needs a fresh check of its page.
- No position has been checked against a second catalogue. The registry's tests can check internal consistency (count, duplicates, sign ranges, degree and minute ranges), not agreement with another source.

## Out of scope for the first build

- Positions in the chart and report. Chart display is a separate decision (see #748 for the analogous lots question).
- Any motion, proper motion or epoch conversion to other dates.
- Star-to-planet conjunction scoring beyond the existing `fixed-stars.ts` 1.0° check, which uses the default orb.
- Medieval or Ptolemaic alternative lists.

## Open questions for the astrologer review

1. Row 33c's printed position differs from row 33, though the print calls it a duplicate. Confirm it is a separate star before the registry treats it as one.
2. Whether a 13th-century Yemeni precession (17;11) should be used as the epoch for charts that are otherwise computed for other dates. This is a doctrine question, not a calculation one, and needs an explicit decision.
3. The orb default of 1.0°: whether to keep it as the single default or to offer the historical variants (magnitude-based, or 1°–2° visual limits) as settings.
