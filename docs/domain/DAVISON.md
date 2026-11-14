# Davison relationship chart

Architect note for #1406. It sets out the Davison method, its inputs, and where it differs from Astraya's midpoint composite, with the source each step rests on. The code is `src/domain/davison.ts`; the tests are `test/domain-davison.test.ts`.

## Source

Ronald C. Davison, _Synastry: Understanding Human Relations Through Astrology_, Aurora Press, 1983, pp. 244-248. Record `davison-synastry-1983` in `docs/references/sources.json`. The book is copyrighted, so its text is kept local. The passages below are summarised from the extract recorded on #1406 (2026-11-09), not copied.

The great-circle place midpoint is standard spherical geometry. The owner's direction (#1406, 2026-11-09) names Ed Williams, _Aviation Formulary_, for the formula. That text is not in the reference library and has not been checked, so it is an unverified reference. The tests check the formula from first principles instead.

## What the method is

A Davison chart is one real chart, cast for a real moment and a real place: the midpoint in time and the midpoint in space of two births. The ephemeris is asked for its positions and houses, as for any natal chart.

## Inputs

- Two birth moments, each with civil date and time, coordinates and time zone (`BirthMomentInput`).
- The person's calculation options (`ChartCalculationOptions`: house system, zodiac, orbs and so on), applied to the cast chart.
- `placeMethod`: `'great-circle'` (default) or `'arithmetic'` (the book's method).
- `adjustMidheaven`: `false` by default; true applies the p. 247 Midheaven adjustment.

## Steps

1. **Time midpoint (p. 244; worked example pp. 246-247).** The book defines the midpoint in time as the point where the elder's progressed date meets the younger's converse date, which is the exact midpoint of the two birth instants. Each birth time is first expressed in Local Mean Time. The mean of the two LMT instants is read as the LMT of the cast place's own meridian, then converted to UT at the cast longitude for the engine. Test: "meets halfway in Local Mean Time (the book gives 1h 43 1/2m a.m. LMT, 22 June 1895)".
2. **Place midpoint.**
   - Default, great circle (owner decision, 2026-11-09, "Great-circle default, book toggle"): both places become unit vectors, which are added and normalised, and the sum is converted back to latitude and longitude. Antipodal places have no unique midpoint and are refused.
   - Option, the book's arithmetic mean (p. 245, pp. 247-248): the mean of the two latitudes and the mean of the two longitudes. For opposite hemispheres the half difference is subtracted from the larger value. The book presents this as valid in its own right, not as an approximation.
   - The two methods differ for distant birthplaces. They agree for two places on the same meridian (test).
3. **Houses.** Cusps are cast for the latitude of the cast place. That is the mean latitude under the book's method (p. 245) and the midpoint's own latitude under the great-circle default (owner decision, 2026-11-11).
4. **Midheaven adjustment (p. 247, opt-in).** The time midpoint does not quite give the mid-point of the two natal Midheavens. The book uses the time to choose which of the two opposite mid-points applies, then shifts the LMT by the small amount that produces it. The code moves the cast time until the ephemeris Midheaven at the cast place equals that target.

## How it differs from the midpoint composite

|                                | Midpoint composite (`composite.ts`)                                                                                                   | Davison (`davison.ts`)                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| What it is                     | A synthetic chart with no moment or place of its own                                                                                  | A real chart for one moment and one place             |
| Positions                      | The near-arc midpoint of each body's two natal longitudes (Ebertin's convention)                                                      | Read from the ephemeris at the cast moment            |
| Houses                         | The near-arc midpoint of each pair of natal cusps, anchored when cusps are nearly opposite (#1402, Solar Fire Deluxe v6, pp. 255-256) | Cast by the house system at the cast place and moment |
| Ephemeris call                 | None for positions or houses                                                                                                          | One natal-chart computation                           |
| Can be progressed or transited | Not as a real moment                                                                                                                  | Yes, like any natal chart                             |

On the composite screen, Midpoint (near-arc) is the default method and Davison (relationship chart) is the alternative (#1406 D2, PR #1480).

## Verification

- `greatCircleMidpoint`:
  - the midpoint is equidistant from both places;
  - it lies on their great circle;
  - the order of the two places does not matter;
  - it crosses 180° the short way;
  - antipodes are refused.
- `arithmeticMidpoint` reproduces the book's worked latitude and longitude arithmetic, including the opposite-hemisphere case.
- The time midpoint is the book's worked LMT. It is unchanged when the two people are swapped.
- The cast chart matches the JPL Horizons J2000 fixture when the cast moment is J2000.
- Midheaven adjustment:
  - it is off by default;
  - the worked example gives 26 Capricorn 19.6, against the book's 26 Capricorn 27, about 7.4 arcminutes apart. The test tolerance is 0.15°.
  - The likely cause is the Duchess's printed latitude (39 N 1, where the code uses 39 N 18). The book also does not print the natal Midheavens.

## Open points

- The p. 247 sentence does not say how the adjustment is computed. The iterative reading above is the coder's interpretation, and the owner has not confirmed it. It ships opt-in and off by default (owner decision, 2026-11-11), and is not exposed in the UI.
- The composite screen casts Davison with the defaults only (great circle, no Midheaven adjustment). The approved "book toggle" for the arithmetic place method is in the domain but not yet on the screen.
- D3, the Davison option in the PDF export, is not built.
- The _Aviation Formulary_ reference for the great-circle formula is unverified (see Source).
- The local file path recorded for `davison-synastry-1983` does not exist on the Mac checkout (#1445 comment, 2026-11-14). That needs the owner's correction.
