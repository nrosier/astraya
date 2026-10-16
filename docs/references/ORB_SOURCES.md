# Orb conventions: what has been checked (#590)

Status of every orb value Astraya uses, after a search for citable sources. A value is **cited** only when a
primary or published source has been read and quoted. Anything else is an **Astraya default**: our own choice,
not a citation. Nothing here changes a number; this records what the numbers can and cannot claim.

| Value                                                             | Where                                                      | Status          | Notes                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Majors 7° / 10° with a luminary; sextile 4° / 5°30'; minors 2°30' | `DEFAULT_ORB_CONFIG`, Standard profile                     | Astraya default | Astro-Seek was the stated basis; its published defaults could not be read (HTTP 403), so the attribution has been removed.                                                                                                                      |
| Tight (scale −50%), Wide (scale +40%)                             | `ORB_PROFILES`                                             | Astraya default | Scale multipliers of the default above.                                                                                                                                                                                                         |
| Synastry scale −30%                                               | `SYNASTRY_SCALE_OFFSET`                                    | Astraya default | No published synastry orb table was found.                                                                                                                                                                                                      |
| Transit orbs and the three minor aspects                          | `TRANSIT_ORB_CONFIG`, transit filter caps (1.5°, 3.5°, 5°) | Astraya default | Choices made for #416. No source found.                                                                                                                                                                                                         |
| Per-body half-orbs (moieties)                                     | none shipped                                               | Not shipped     | William Lilly, _Christian Astrology_ (1647), Book I, "Of Aspects", gives moiety prose (Sun 15° and Moon 12° as totals in his examples). The per-planet table is unreadable in the available scan, so no preset is built from it. Public domain. |
| Modern opposition/square 5–10°, sextile 4–5°                      | Second-hand only                                           | Not verified    | Reported by Wikipedia, citing Liz Greene via Astrodienst. The Astrodienst page could not be read.                                                                                                                                               |

Searched and not found: a Hellenistic or other tradition with no-orb (sign-based) aspects that is citable; a
published source for synastry or outer-planet transit orb reduction.

To cite a moiety preset: read the full Lilly table from a clean scan (or a second edition), add the passage to a
file here with its locator, and mark the numbers as verbatim.
