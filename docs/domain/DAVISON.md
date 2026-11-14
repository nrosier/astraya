# Davison relationship chart

Architect note for #1406. It sets out the Davison method, its inputs, and where it differs from Astraya's midpoint composite, with the source each step rests on. The code is `src/domain/davison.ts`; the tests are `test/domain-davison.test.ts`.

## Source

Ronald C. Davison, _Synastry: Understanding Human Relations Through Astrology_, Aurora Press, 1983, pp. 244-248. Record `davison-synastry-1983` in `docs/references/sources.json`. The book is copyrighted, so its text is kept local. The passages below are summarised from the extract recorded on #1406 (2026-11-09), not copied.

The great-circle place midpoint is standard spherical geometry. The owner's direction (#1406, 2026-11-09) names Ed Williams, _Aviation Formulary_, for the formula. That text is not in the reference library and has not been checked. This is a bibliographic gap, not a correctness risk: `test/domain-davison.test.ts` proves the midpoint's spherical properties from first principles (see Verification).

## What the method is

A Davison chart is one real chart, cast for a real moment and a real place: the midpoint in time and the midpoint in space of two births. The ephemeris is asked for its positions and houses, as for any natal chart.

## Inputs

- Two birth moments, each with civil date and time, coordinates and time zone (`BirthMomentInput`).
- The person's calculation options (`ChartCalculationOptions`: house system, zodiac, orbs and so on), applied to the cast chart.
- `placeMethod`: `'great-circle'` (default) or `'arithmetic'` (the book's method).
- `adjustMidheaven`: `false` by default; true applies the p. 247 Midheaven adjustment.

## Steps

1. **Time midpoint (p. 244; worked example pp. 246-247).** The book defines the midpoint in time as the point where the elder's progressed date meets the younger's converse date, which is the exact midpoint of the two birth instants. The book works in Local Mean Time: it takes the mean of the two births' LMTs and reads it as the LMT of the mean longitude λ̄. Since LMT = UT + λ/15°, that is exactly the midpoint of the two UT instants:

   (LMT₁ + LMT₂)/2 − λ̄/15° = (UT₁ + UT₂)/2.

   The code takes that UT midpoint directly, for both place methods (owner decision, #1406, 2026-11-14). The time therefore does not depend on where the chart is cast. Reading the LMT mean at the great-circle longitude λgc instead would move the time by (λ̄ − λgc)/15°, which can be several minutes, or more, for wide pairs at high latitude. Tests: "meets halfway in Local Mean Time (the book gives 1h 43 1/2m a.m. LMT, 22 June 1895)" (arithmetic method), and "is the exact UT midpoint whichever place method is used…".

2. **Place midpoint.**
   - Default, great circle (owner decision, 2026-11-09, "Great-circle default, book toggle"): both places become unit vectors, which are added and normalised, and the sum is converted back to latitude and longitude. Antipodal places have no unique midpoint and are refused.
   - Option, the book's arithmetic mean (p. 245, pp. 247-248): the mean of the two latitudes and the mean of the two longitudes. For opposite hemispheres the half difference is subtracted from the larger value. The book presents this as valid in its own right, not as an approximation.
   - The two methods differ for distant birthplaces. They agree for two places on the same meridian (test).
3. **Houses.** Cusps are cast for the latitude of the cast place. That is the mean latitude under the book's method (p. 245) and the midpoint's own latitude under the great-circle default (owner decision, 2026-11-11).
4. **Midheaven adjustment (p. 247, opt-in).** The time midpoint does not quite give the mid-point of the two natal Midheavens. The book uses the time to choose which of the two opposite mid-points applies, then shifts the time by the small amount that produces it.
   - The target is the near-arc mid-point of the two natal Midheavens, or the opposite point when the unadjusted Midheaven is nearer to that (`midheavenTarget`).
   - The Midheaven depends only on the local sidereal time (RAMC) and the obliquity, not on geographic latitude. RAMC advances steadily, about 15.04° per hour, so the Midheaven rises monotonically with time and the target is reached at one nearby moment. The problem is well-posed.
   - The code moves the cast time by the remaining gap divided by the sidereal rate (360.985647° a day), then repeats. Because the obliquity makes the Midheaven advance unevenly in longitude, it takes a few steps; it stops below 10⁻⁹°. A closed-form inverse (RAMC from the target Midheaven and the obliquity) would give the same moment.

## How it differs from the midpoint composite

|                           | Midpoint composite (`composite.ts`)                                                                                                       | Davison (`davison.ts`)                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| What it is                | A synthetic chart with no moment or place of its own                                                                                      | A real chart for one moment and one place                            |
| Positions                 | The near-arc midpoint of each body's two natal longitudes (Ebertin's convention)                                                          | Read from the ephemeris at the cast moment                           |
| Houses                    | The near-arc midpoint of each pair of natal cusps, anchored when cusps are nearly opposite (#1402, Solar Fire Deluxe v6, pp. 255-256)     | Cast by the house system at the cast place and moment                |
| Ephemeris call            | None for positions or houses                                                                                                              | One natal-chart computation                                          |
| Progressions and transits | Progressed or transited through its midpoint positions (for example the midpoints of the progressed charts), not from a moment of its own | Cast directly against its own moment and place, like any natal chart |

On the composite screen, Midpoint (near-arc) is the default method and Davison (relationship chart) is the alternative (#1406 D2, PR #1480).

## Verification

- `greatCircleMidpoint`:
  - the midpoint is equidistant from both places;
  - it lies on their great circle;
  - the order of the two places does not matter;
  - it crosses 180° the short way;
  - antipodes are refused.
- `arithmeticMidpoint` reproduces the book's worked latitude and longitude arithmetic, including the opposite-hemisphere case.
- The time midpoint is the book's worked LMT under the arithmetic method, and the exact UT midpoint under both methods. It is unchanged when the two people are swapped.
- The cast chart matches the JPL Horizons J2000 fixture when the cast moment is J2000.
- Midheaven adjustment:
  - it is off by default;
  - the adjusted chart's Midheaven equals the chosen target to within 0.01″;
  - the worked example gives 26 Capricorn 19.6, against the book's 26 Capricorn 27, about 7.4 arcminutes apart. The test tolerance is 0.15°.
  - Latitude does not explain the gap: the Midheaven does not depend on latitude, so the Duchess's printed 39 N 1 (the code uses 39 N 18) moves her Ascendant and cusps, not her Midheaven. The target depends only on the two natal Midheavens, that is on the birth times and longitudes. The likely causes are the rounded birth times and longitudes in the worked example, and the book's sidereal-time tables. The book does not print the natal Midheavens, so the gap cannot be traced further.

## Status

Domain-complete in `src/domain/davison.ts`, each with tests:

- both place methods (`placeMethod`: great circle and the book's arithmetic mean);
- the UT time midpoint;
- the Midheaven adjustment (`adjustMidheaven`). The p. 247 sentence does not say how the shift is computed; the reading in step 4 is the coder's. It ships opt-in and off by default (owner decision, 2026-11-11).

UI and export follow-ups, not yet built:

- The composite screen casts Davison with the defaults only (great circle, no Midheaven adjustment). It does not yet offer the approved Book / Great-circle place-method choice or the adjustment.
- D3: the Davison option in the PDF export.

Reference cleanup:

- The _Aviation Formulary_ citation is unverified (see Source). It is bibliographic only.
- The local file path recorded for `davison-synastry-1983` does not exist on the Mac checkout (#1445 comment, 2026-11-14). That needs the owner's correction.
