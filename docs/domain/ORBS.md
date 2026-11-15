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
