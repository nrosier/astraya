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

Citation status: verified on 2026-10-20 against the published IAU 1976 value (Lieske et al. 1977, _Astronomy and Astrophysics_ 58), as confirmed by the project owner. No copy of the paper is in docs/references/, so this is not a check against a file in the repo.

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

- Every entry's longitude must match `test/fixtures/yemen-star-longitudes.json`, an independent transcription of column V from the page images (#1602). `test/astrology-fixed-star-registry.test.ts` checks every entry and row 33's variant against it.
- Pages 167, 168 and 169 were checked by eye against the page images. Any value changed later needs a fresh check of its page.
- No position has been checked against a second catalogue. The registry's tests can check internal consistency (count, duplicates, sign ranges, degree and minute ranges), not agreement with another source.

## Peters 1915 check (#1603)

Each registry entry carries a Peters–Knobel number (`peters_knobel`), the star's number in Peters and Knobel, _Ptolemy's Catalogue of Stars: A Revision of the Almagest_ (1915; `peters-ptolemys-catalogue-of-stars-1915`, held). On 2026-11-24 each number was looked up in the held scanned text (owner decision on #1603: verify, do not add stars):

- **Catalogue I:** the Latin catalogue, with descriptions.
- **Catalogue III:** positions, magnitudes and modern names (Bayer letter or Flamsteed number).

An entry is **verified** when Peters places the number in the expected constellation, and the printed description, Bayer letter or Flamsteed number matches the registry's modern identification. Pages are the printed pages from the scanned text's page map (`.pages.tsv`).

Some printed constellation headings are lost in the scan (Leo's stars sit under the CANCER heading, for example), so the evidence below names the constellation the entry belongs to.

Where the scan garbles a catalogue number ("no" for 110, "III" for 111, "42s" for 425), the row was read from its constellation position and printed description. The magnitude table (pp. 150-155) gives Flamsteed and Bayer names for rows whose Catalogue I and III entries show only the bare number. **Every entry is verified.** The astrologer review of PR #1957 located the rows a first pass had marked not legible.

No registry value was changed by this check.

| Registry id | Peters–Knobel | Modern id | Peters page (catalogue) | Result                                                                                                                  |
| ----------- | ------------- | --------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1           | 315           | α And     | p. 150 (magnitudes)     | Verified: Pegasus 1, "= 21 α And" (the star Pegasus and Andromeda share), in the magnitude table                        |
| 2           | 723           | τ Cet     | I p. 65, III p. 111     | Verified: Cetus 12, "Media de tribus quae sunt in corpore" (Catalogue I); 52 τ in Catalogue III                         |
| 3           | 805           | θ Eri     | I p. 67                 | Verified: Eridanus 34, "Ultima fluvii et est splendida"                                                                 |
| 4           | 346           | β And     | p. 151 (magnitudes)     | Verified: Andromeda, Flamsteed 43 (β), in the magnitude table                                                           |
| 5           | 189           | β Cas     | I p. 53, III p. 100     | Verified: Cassiopeia, β in Catalogue III                                                                                |
| 6           | 362           | γ Ari     | I p. 57, III p. 103     | Verified: Aries 1, "Praecedens duarum quae sunt in cornu"                                                               |
| 7           | 363           | β Ari     | I p. 57, III p. 103     | Verified: Aries 2, "Sequens ipsarum"                                                                                    |
| 8           | 375           | α Ari     | I p. 57, III p. 104     | Verified: Aries, "Quae supra caput est", α (13)                                                                         |
| 9           | 349           | γ And     | I p. 57, III p. 103     | Verified: Andromeda, "Quae supra pedem sinistrum"                                                                       |
| 10          | 713           | α Cet     | I p. 65, III p. 111     | Verified: Cetus 2, "in extrema maxilla"                                                                                 |
| 11          | 202           | β Per     | I p. 53, III p. 100     | Verified: Perseus 12, "Fulgens quae est in Gorgoneo", β (26)                                                            |
| 12          | 197           | α Per     | I p. 53, III p. 100     | Verified: Perseus 7, "Fulgens quae est in dextro latere", α (33)                                                        |
| 13          | 393           | α Tau     | I p. 58, III p. 104     | Verified: Taurus 14, "Fulgens de Hyades … oculo australi subrufa", α (87)                                               |
| 14          | 768           | β Ori     | I p. 66, III p. 112     | Verified: Orion 35, "extremitate pedis sinistri", β (19)                                                                |
| 15          | 222           | α Aur     | III p. 100              | Verified: Auriga 3, α (13)                                                                                              |
| 16          | 735           | α Ori     | I p. 66, III p. 111     | Verified: Orion 2, "humero dextro et est subrufa"                                                                       |
| 17          | 818           | α CMa     | III p. 113              | Verified: Canis Major, α (9)                                                                                            |
| 18          | 892           | α Car     | I p. 69, III p. 115     | Verified: Argo 44, "α Argus Canopus"                                                                                    |
| 19          | 424           | α Gem     | I p. 58, III p. 105     | Verified: Gemini 1, "in capite praecedentis Geminorum", α (66)                                                          |
| 20          | 848           | α CMi     | I p. 68, III p. 114     | Verified: Canis Minor 2, "vocatur Procyon"                                                                              |
| 21          | 905           | α Hya     | I p. 70, III p. 115     | Verified: Hydra 12, α (30)                                                                                              |
| 22          | 469           | α Leo     | I p. 59, III p. 106     | Verified: Leo 8, "in corde et vocatur Regulus"                                                                          |
| 23          | 481           | δ Leo     | I p. 60, III p. 106     | Verified: Leo 20, Flamsteed 68 (δ)                                                                                      |
| 24          | 488           | β Leo     | I p. 60, III p. 106     | Verified: Leo 27, Flamsteed 94 (β)                                                                                      |
| 25          | 449           | M 44      | I p. 59, III p. 105     | Verified: Cancer, "Media nubiformis convolutionis"                                                                      |
| 26          | 464           | μ Leo     | I p. 59, III p. 106     | Verified: Leo 3, Flamsteed 24 (μ)                                                                                       |
| 27          | 467           | γ Leo     | I p. 59, III p. 106     | Verified: Leo 6, Flamsteed 41 (γ)                                                                                       |
| 28          | 931           | γ Crv     | I p. 70, III p. 115     | Verified: Corvus 1, "in antecedente dextraque ala", Flamsteed 4 (γ)                                                     |
| 29          | 736           | γ Ori     | I p. 66                 | Verified: Orion 3, "Quae in humero sinistro", 24 γ (Catalogue I)                                                        |
| 30          | 230           | β Tau     | III p. 101              | Verified: Auriga, "= 112 β Tauri"                                                                                       |
| 31          | 223           | β Aur     | III p. 100              | Verified: Auriga 4, Flamsteed 34 (β)                                                                                    |
| 32          | 760           | ε Ori     | I p. 66, III p. 112     | Verified: Orion 27, "Media ipsarum" (the belt), Flamsteed 46 (ε)                                                        |
| 33          | 35            | η UMa     | I p. 49, III p. 96      | Verified: Ursa Major 27, "in ipsa extremitate caudae", Flamsteed 85 (η)                                                 |
| 33a         | 33            | ε UMa     | I p. 49, III p. 96      | Verified: Ursa Major 25, "prima post caudae", Flamsteed 77 (ε)                                                          |
| 33b         | 34            | ζ UMa     | I p. 49, III p. 96      | Verified: Ursa Major 26, Flamsteed 79 (ζ)                                                                               |
| 34          | 928           | α Crv     | I p. 70, III p. 115     | Verified: Corvus, "in rostro communis cum Hydro"                                                                        |
| 35          | 110           | α Boo     | I p. 51                 | Verified: Boötes 1, "vocatur Arcturus subrufa" (the number prints as "no")                                              |
| 36          | 510           | α Vir     | p. 154 (magnitudes)     | Verified: Virgo, Flamsteed 67 (α), in the magnitude table                                                               |
| 37          | 111           | α CrB     | I p. 51, III p. 98      | Verified: Corona Borealis 1, "Fulgens earum quae sunt in corona", Flamsteed 5 (α) (the number prints as "III")          |
| 38          | 969           | α Cen     | III p. 116              | Verified: Centaurus 35, "α Centauri"                                                                                    |
| 39          | 553           | α Sco     | notes p. 126            | Verified: Note 553: "This star, α Scorpii"                                                                              |
| 40          | 271           | α Ser     | I p. 55, III p. 101     | Verified: Serpens 9, α (24)                                                                                             |
| 41          | 119           | α Her     | I p. 51, III p. 98      | Verified: Hercules 1, α (64)                                                                                            |
| 42          | 234           | α Oph     | III p. 101              | Verified: Ophiuchus 1, α (55)                                                                                           |
| 43          | 592           | β Sgr     | I p. 62, III p. 108     | Verified: Sagittarius 23; Peters gives the pair β¹ and β² (Bode XIX 54, XIX 62), recorded in the registry as β          |
| 44          | 593           | α Sgr     | I p. 62, III p. 108     | Verified: Sagittarius 24, "Quae in genu ejusdem pedis", α                                                               |
| 45          | 149           | α Lyr     | I p. 52, III p. 99      | Verified: Lyra 3 (α)                                                                                                    |
| 46          | 288           | α Aql     | p. 150 (magnitudes)     | Verified: Aquila, Flamsteed 53 (α), in the magnitude table (printed "S3"; the weakest reading here)                     |
| 47          | 159           | β Cyg     | III p. 99               | Verified: Cygnus 1, Flamsteed 6 (β)                                                                                     |
| 48          | 301           | ε Del     | p. 150 (magnitudes)     | Verified: Delphinus 1, Flamsteed 2 (ε), in the magnitude table (the Catalogue I and III rows show only the bare number) |
| 49          | 624           | δ Cap     | I p. 63, III p. 109     | Verified: Capricornus 24, Flamsteed 49 (δ)                                                                              |
| 50          | 331           | ε Peg     | III p. 103              | Verified: Pegasus 17, Flamsteed 8 (ε)                                                                                   |
| 51          | 670           | α PsA     | I p. 64                 | Verified: Aquarius 42, "in ore Piscis Austrini"                                                                         |
| 52          | 163           | α Cyg     | III p. 99               | Verified: Cygnus 5, α (50)                                                                                              |
| 53          | 317           | β Peg     | p. 150 (magnitudes)     | Verified: Pegasus, Flamsteed 53 (β), in the magnitude table                                                             |
| 54          | 732           | ι Cet     | I p. 66, III p. 111     | Verified: Cetus 21, "in extremis caudae"                                                                                |
| 55          | 316           | γ Peg     | p. 150 (magnitudes)     | Verified: Pegasus, Flamsteed 88 (γ), in the magnitude table                                                             |
| 56          | 574           | μ Sgr     | I p. 62                 | Verified: Sagittarius 5, "Borealior ipsarum et in extremitate arcus"                                                    |
| 57          | 566           | υ Sco     | I p. 62, III p. 108     | Verified: Scorpius 21, "Praecedens ipsarum", Flamsteed 34 (υ)                                                           |
| 58          | 565           | λ Sco     | III p. 108              | Verified: Scorpius 20, Flamsteed 35 (λ)                                                                                 |
| 59          | 567           | M 7       | I p. 62, III p. 108     | Verified: Scorpius, "Quae aculeum sequitur et est nebulosa"                                                             |
| 60          | 577           | ν1,2 Sgr  | I p. 62, III p. 108     | Verified: Sagittarius 8, "in oculo est nebulosa et bina"                                                                |
| 61          | 175           | ω1,2 Cyg  | I p. 53, III p. 99      | Verified: Cygnus 17, "Quae in genu dextro nubi similis", Flamsteed 46 (ω) (the number prints as "17s")                  |
| 62          | 759           | δ Ori     | I p. 66, III p. 112     | Verified: Orion 26, "Antecedens de tribus quae sunt in cingulo", Flamsteed 34 (δ)                                       |
| 63          | 844           | β Col     | I p. 68, III p. 114     | Verified: Canis Major, unformed stars, "β Columbae"                                                                     |
| 65          | 425           | β Gem     | I p. 58                 | Verified: Gemini 2, "Quae est in capite sequentis Geminorum, subrufa", β (the number prints as "42s")                   |

## Map lines (#2018)

Status: owner-accepted derivation (#2012 dialogue answer, "Accept a stated derivation"; recorded on #2018). No held source states the geometry of a fixed-star line on a map, so this is a stated Astraya convention, not a cited rule. The derivation uses only the horizon relation already in `armcAtAngle` (src/astrology/fixed-stars.ts).

With α, δ the star's equatorial right ascension and declination, ARMC0 the ARMC at longitude 0, and φ, λ latitude and geographic longitude (east positive):

- MC: λ = norm180(α − ARMC0), at every latitude.
- IC: λ = norm180(α + 180° − ARMC0), at every latitude.
- AC: λ = norm180(α − H0(φ) − ARMC0). DC: λ = norm180(α + H0(φ) − ARMC0).
- H0(φ) = arccos(−tan φ · tan δ), on [0°, 180°]. AC and DC exist only where |φ| ≤ 90° − |δ|. Beyond that, a circumpolar star (same-sign φ and δ) has neither DC nor AC. A star that never rises (opposite-sign) has neither AC nor DC, since it cannot set either.
- Epoch: apparent right ascension and declination of date, on the true equator, as the engine returns for the chart moment (not J2000 or catalogue coordinates).
- Refraction: the lines are geometric (altitude 0, no refraction). They mark geometric rising and setting, not the moment the star becomes visible.

The implementation is `fixedStarLines` in src/astrology/astrocartography.ts. It returns an array of kind-tagged lines, one per drawn line: `FixedStarMeridianLine` (`kind` MC or IC, `longitude`) and `FixedStarHorizonLine` (`kind` AC or DC, `segments`), each with the star's `star` name. AC or DC is omitted when the star has no segments. These lines are not yet part of `AcgLine`; the star set is chosen by the map task. Sampling follows `horizonLine`: 1° latitude steps, |φ| ≤ 85°. Both values are defaults (`latitudeStepDeg`, `maxAbsLatitude` in `AcgSamplingOptions`); callers may override them. Tests in test/astrology-fixed-star-lines.test.ts check each line against `engine.azimuthAltitude`. Related: #2012 (polar MC convention), #2018 (this section).

## Out of scope for the first build

- Positions in the chart and report. Chart display is a separate decision (see #748 for the analogous lots question).
- Stellar proper motion, and any precession model other than the one in the Precession section.
- Star-to-planet conjunction scoring beyond the existing `fixed-stars.ts` 1.0° check, which uses the default orb.
- Medieval or Ptolemaic alternative lists.

## Open questions for the astrologer review

1. Resolved 2026-10-20: see the citation status in the Precession section.
2. Resolved 2026-10-20: 1.0° is accepted as an Astraya convention, labelled as such, with no cited source. The Bonatti ch. 108 reference is not relied on for it.
