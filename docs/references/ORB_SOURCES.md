# Orb conventions: what has been checked (#590)

Status of every orb value Astraya uses. A value is **cited** only when a primary source has been read from
a page image and transcribed in `orb-conventions.references.json`. Anything else is an **Astraya default**:
our own choice, not a citation.

| Value                                                                                                           | Where                                                    | Status              | Source                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Per-planet orbs, first column (Saturn 10°, Jupiter 12°, Mars 7°30′, Sun 17°, Venus 8°, Mercury 7°, Moon 12°30′) | `CITED_ORB_PRESETS['lilly-1647-first-v1']`, as half-orbs | **Cited**           | Lilly, _Christian Astrology_ (1647), Book I, p. 107                                                     |
| Per-planet orbs, second column (9, 9, 7, 15, 7, 7, 12)                                                          | `CITED_ORB_PRESETS['lilly-1647-second-v1']`              | **Cited**           | same page, second column                                                                                |
| Moiety is half the orb, pairs sum                                                                               | `orbFor`, `bodyOrbs`                                     | **Cited**           | Lilly p. 107 (Venus/Saturn example) and p. 110 (Sun/Moon 13°30′)                                        |
| Cazimi within 17′                                                                                               | `sect.ts`                                                | **Cited**           | Lilly Book I, p. 113 (Book II p. 300 says 16′)                                                          |
| Combust within 8°30′, same sign only                                                                            | `sect.ts`                                                | **Cited**           | Lilly Book I, p. 113                                                                                    |
| Under the beams within 17°                                                                                      | `sect.ts`                                                | **Cited**           | Lilly Book I, p. 113 (Book II p. 300 gives 12°, not followed)                                           |
| Ascendant too early below 3°, too late above 27°                                                                | `horary.ts`                                              | **Cited**           | Lilly Book I, p. 122 (0–2 and 27–29 degrees ascending)                                                  |
| Dignity weights 5/4/3/2/1                                                                                       | `almuten.ts`                                             | **Cited** (weights) | Lilly Book I, p. 115                                                                                    |
| Majors 7°/10°, sextile 4°/5°30′, minors 2°30′                                                                   | `DEFAULT_ORB_CONFIG`, Standard                           | Astraya default     | Astro-Seek was the stated basis; its pages could not be read (HTTP 403), so the attribution was removed |
| Tight (−50%), Wide (+40%)                                                                                       | `ORB_PROFILES`                                           | Astraya default     | scale multipliers of the above                                                                          |
| Synastry scale −30%                                                                                             | `SYNASTRY_SCALE_OFFSET`                                  | Astraya default     | no published synastry orb table found                                                                   |
| Transit orbs and filter caps (1.5°, 3.5°, 5°)                                                                   | `TRANSIT_ORB_CONFIG`, `transit-importance.ts`            | Astraya default     | choices made for #416                                                                                   |

## Notes

- Lilly's presets carry no orb for Uranus, Neptune or Pluto, which he did not know. A pair that includes one
  of them uses the aspect's own tier.
- Lilly gives two columns and says he uses either, so both are offered rather than one chosen.
- The scan read is the Wellcome Library copy of the 1647 first edition (archive.org `b30338724`). Its OCR is
  unreliable; the figures here were read from the page images.
- Not used: Deborah Houlding's retyped edition (© 1999) and the "mithras93" web transcription of Book II. They
  helped locate passages; nothing is copied from them. The Book II aphorism (12°, 16′) is recorded as read from
  that transcription and not yet compared with the 1647 scan.

## Still open

The Moon's softer void-of-course rule in Taurus, Cancer,
Sagittarius and Pisces (p. 122) is not modelled.
