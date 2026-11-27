# Differences from Solar Fire

Where Astraya can print a different result from Solar Fire for the same chart, and why. Use it when comparing printouts.

The source for Solar Fire is the Solar Fire Deluxe User Guide held as `esoteric-solar-fire-deluxe-user-guide-undated` in `docs/references/sources.json`. Locators give the guide's section and the line in its extracted text. The extraction drops some degree signs (for example "78°32′" comes out as "7832’"), so check a figure with a degree sign against the PDF page. No calculation has been run against Solar Fire output: this compares the documented methods.

Each section ends with its status: a choice Astraya keeps, or a change that is planned.

## Midpoint tree and dial orb

- **Astraya:** 0°15′ by default (#2045), measured on the dial scale, that is, in zodiac longitude folded onto the 90° dial (`dialSeparation` in `src/astrology/midpoints.ts`). The setting is "Midpoint tree orb", in steps of 0°15′. It was 1° before #2045.
- **Solar Fire:** initially 1°00′, "measured in terms of a 360 degree circle, regardless of the modulus of the dial, so a 1 degree orb corresponds to 1/4 degree on the dial scale of a 90 degree dial, and to 1/8 degree on the dial scale of a 45 degree dial" (§17.3, text line 3940; printed p. 118, PDF page 121 of `SolarFireDeluxe_v6.pdf`).
- **Effect:** the defaults now match: Astraya's 0°15′ on the dial is Solar Fire's 1°00′ on the circle. The numbers read differently because the two programs state the orb on different scales; to set Solar Fire's orb of x degrees, set Astraya's to x / 4.
- **Status:** matched (#2045). Saved settings from before #2045 that still held the old 1° default read as 0°15′; any other saved value, and every snapshot (share links, calculation artifacts), keeps its stored orb (owner decision on #2045).

## Applying and separating to the angles

- **Astraya:** an aspect from a planet to a chart angle is applying or separating with the angle moving at its diurnal rate. This follows the Astro-Seek reference sheet (#413; `src/domain/chart-compute.ts`).
- **Solar Fire:** holds the chart angles stationary, so an aspect to an angle can read applying in one program and separating in the other. This is recorded in `src/domain/chart-compute.ts`; the held guide does not state it, so it has not been re-checked.
- **Status:** Astraya keeps its rule.

## Progressed Midheaven

- **Astraya:** all five of Solar Fire's methods: Naibod in longitude (the default), true solar arc in longitude, Naibod in right ascension, true solar arc in right ascension (#2039), and quotidian. The other angles follow from the progressed Midheaven (`src/astrology/progressions.ts`).
- **Solar Fire:** the same five: true solar arc in longitude ("possible the most commonly used method today"), true solar arc in right ascension, Naibod in longitude, Naibod in right ascension, and mean quotidian (§30.3.2.1, text lines 8551-8575). The held guide does not state which method is selected initially.
- **Effect:** the methods match; only the initial choice may differ. Choose the same method in both programs before comparing the angles.
- **Status:** Astraya keeps Naibod in longitude as its default.

## Primary-direction keys

- **Astraya:** Naibod (the default, 360 / 365.2422 degrees of right ascension a year), Ptolemy (1° a year), Natal Solar Rate (#2040), and True Solar Arc in right ascension (#1795).
- **Solar Fire:** Ptolemy, Naibod (59′08″ a year), and Natal Solar Rate, the natal Sun's rate of motion in right ascension for each year of life (§30.3.2.3, text lines 8604-8615).
- **Effect:** Solar Fire's three keys are all available. Natal Solar Rate times every arc at the Sun's speed in right ascension on the birth day, read from the ephemeris; True Solar Arc follows the progressed Sun day by day, so the two give different dates.
- **Status:** True Solar Arc is Astraya's own addition and stays.

## Tertiary and minor progressions

- **Astraya:** tertiary is one day for each mean tropical lunar month, and minor is one such month for each year, with the month at 27.32158648 days (`src/astrology/minor-progressions.ts`).
- **Solar Fire:** offers "Mean tertiary - a day for a mean lunar month", "True tertiary - a day for each true lunar month" and "Minor - a mean lunar month for a year" (§12.4, text lines 2616-2618), with the mean rates built on 27.32158648 days (§30.3.2.2, text lines 8586-8588).
- **Difference:** Astraya matches the mean tertiary and the minor rate. **It does not offer the true tertiary**, which uses the actual lunar months. Before #2032, Astraya used the 29.530588-day synodic month, so tertiary and minor charts saved or printed from an earlier version differ.
- **Status:** Astraya keeps the mean rates only.

## Profections

- **Astraya:** Hellenistic annual and monthly profection of the Ascendant: one sign for each completed year, keeping the Ascendant's degree within the sign, and twelfths of a year for the months (`src/astrology/profections.ts`, citing Brennan).
- **Solar Fire:** "Profections (Annual)" is a direction that "directs the chart by 30 degrees per year" (§12.4, text line 2629, and text line 6113), a direction arc applied to the chart.
- **Effect:** the two answer different questions. Astraya moves the Ascendant in whole-sign steps and names the lord of the year; it does not direct the other points.
- **Status:** Astraya keeps its technique.

## Lunar phase return

- **Astraya:** the phase angle is the Moon's longitude minus the Sun's. The list starts at the most recent return before the search date (`src/domain/lunar-phase-return.ts`, #1407).
- **Solar Fire:** a return is a chart in which the phase angle between the Sun and the Moon returns to its natal value, "starting one lunar month prior to the search date" (§12.10, text lines 3056-3058). The guide does not define the phase angle further.
- **Effect:** both lists begin with a return from about the month before the search date; where the two programs define the phase angle differently, the times differ.
- **Status:** Astraya keeps its reading.

## Harmonic age and arc transform

Astraya follows the guide's rules here. Two details that the guide leaves open are Astraya's own, and they can move results.

- **Solar Fire:** Harmonic Age multiplies each longitude by the exact age in decimal years (zero at birth), Harmonic Age+1 by that age plus one, and Arc Transform by a harmonic worked out from the separation of a chosen pair, which brings the pair into exact conjunction (§12.6, text lines 2848-2857). It gives no year length and no formula for the Arc Transform harmonic.
- **Astraya:** age is in tropical years of 365.2422 days, and the Arc Transform harmonic is 360 divided by the difference of the two longitudes, each taken from 0° to 360° (`src/domain/harmonic.ts`; owner decisions on #1407).
- **Status:** Astraya keeps these choices.
