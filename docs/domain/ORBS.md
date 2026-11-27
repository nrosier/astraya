# Aspect orbs

How Astraya decides whether two points are in aspect, and where each orb value comes from. The code is `src/astrology/aspects.ts` and `src/astrology/orb-profiles.ts`.

## The default orbs are Astraya's convention

The default orbs have no published source. They are Astraya's own convention (owner decision on #1602, 2026-11-15):

| Tier                                                   | Orb   | With a luminary |
| ------------------------------------------------------ | ----- | --------------- |
| Major aspects (conjunction, opposition, trine, square) | 7°    | 10°             |
| Sextile                                                | 4°    | 5°30′           |
| Minor and higher-harmonic aspects (opt-in)             | 2°30′ | 2°30′           |

A global percentage scales every tier. The basis line on each chart page names the orb profile in use, for example "Standard orbs".

Two indexed sources give ranges of orbs, not these values:

- Avelar, _On the Heavenly Spheres_ (2010), p. 238.
- Marks, _The Art of Chart Interpretation_ (1986), p. 73.

None of the reference programs checked on 2026-11-15 (Kerykeion, Flatlib, PyAstra, Morinus, Astrolog) cites a source for its default orbs either.

## Cited alternatives

- **Lilly's moieties**: a cited orb preset, from Lilly, _Christian Astrology_ (1647). The values and their locators are in `docs/references/orb-conventions.references.json`.
- **Transit and solar-arc limits**: the transit orb limit and the 1° solar-arc limit in the transit and rectification tools are cited in their own modules (`src/astrology/rectification.ts`).
- **Declination contacts**: parallels and contraparallels use a 1° orb (`DEFAULT_DECLINATION_ORB` in `src/domain/chart-tables.ts`).
- **Fixed stars**: conjunctions to fixed stars use a 1.0° orb, kept as a convention (#739).
- **Midpoint tree**: 0°15′ on the 90° dial (`MIDPOINT_TREE_ORB_DEFAULT` in `src/chart/extended-settings.ts`), Solar Fire's initial 1°00′ on the 360° circle (Solar Fire Deluxe guide §17.3, printed p. 118; #2045).

## Other conventions

Values outside the aspect orbs that change results, with their source or their standing as Astraya's own choice (owner decisions on #2035, 2026-11-27).

- **Eclipse contacts**: a natal point is touched within 3° of the eclipse degree or its opposite (`DEFAULT_CONTACT_ORB_DEG` in `src/astrology/eclipses.ts`, #404). The 3° follows Tebbs, _The Complete Book of Chart Rectification_, PDF pp. 49 and 120, which gives solar eclipses a 3–5° orb and applies 3°. Using it for lunar eclipses too, and counting only conjunction and opposition (Tebbs also reads squares), are Astraya's own choices.
- **Antiscia**: the antiscion and contra-antiscion points follow Lilly, _Christian Astrology_ (1647), Book I, pp. 90 and 92. Counting conjunction only, within 1° (the `antisciaMaxOrb` default), is Astraya's own convention; Lilly also lets the antiscion act by any aspect.
- **Synastry ranking**: aspect weights are 1.0 (conjunction, square, opposition), 0.7 (trine, sextile) and 0.4 (minor aspects); body weights are 1.0 (Sun, Moon), 0.8 (Mercury, Venus, Mars), 0.6 (Jupiter, Saturn), 0.45 (Uranus, Neptune, Pluto) and 0.3 (other points). These are Astraya's own convention (#422) and only order the contacts, without adding or removing any (`src/astrology/synastry-importance.ts`).
- **Element and modality tallies**: each position counts once, and a tie goes to the earlier element (fire, earth, air, water) or modality (cardinal, fixed, mutable). Quadrants are bounded by the four angles. These are Astraya's own conventions (`src/astrology/emphasis.ts`, `src/domain/chart-overview.ts`).
- **Nakshatras**: 27 divisions of 13°20′, four padas of 3°20′ each, and the lords from Ketu to Mercury follow R. K. Das, _A New Method on Birth Time Rectification_ (2020), pp. 23, 24 and 70 (`src/astrology/nakshatras.ts`).
