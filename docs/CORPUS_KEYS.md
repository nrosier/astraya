# Corpus key reference

Issue #427. The source of truth is the header of `src/interpretation/schema.ts`; this is the readable copy
(a fuller HTML version sits beside it: `docs/CORPUS_KEYS.html`).

## What a key is

Every corpus entry has a **key**, derived from the placement by `placementKey` and never typed by hand. The first
segment is the category. There is one entry per key and language.

Numbers are plain integers and easy to confuse: a **sign** is **zero-based** (0 = Aries … 11 = Pisces); a **house** is
**one-based** (1–12). So `planet-in-sign:sun:2` is the Sun in **Gemini**, and `planet-in-house:sun:2` is the Sun in the
**2nd house**. Bodies are `BodyDefinition.key`s (`sun`, `meanNode`…); aspects are `ASPECTS` keys (`square`…).
The admin screens show what an entry means in words, with the key as small secondary text (`labelForKey`, #428).

## Every category

| Category          | Shape                                          | Example                            | Reads as                             | Order of two bodies                                                   |
| ----------------- | ---------------------------------------------- | ---------------------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `planet-in-sign`  | `planet-in-sign:<body>:<sign>`                 | `planet-in-sign:sun:2`             | Sun in Gemini                        | —                                                                     |
| `planet-in-house` | `planet-in-house:<body>:<house>`               | `planet-in-house:sun:3`            | Sun in the 3rd house                 | —                                                                     |
| `sign-on-cusp`    | `sign-on-cusp:<sign>:<house>`                  | `sign-on-cusp:2:3`                 | Gemini on the cusp of the 3rd house  | sign first, then house                                                |
| `aspect-pair`     | `aspect-pair:<aspect>:<a>:<b>`                 | `aspect-pair:square:mars:saturn`   | Mars square Saturn                   | alphabetical, one entry per pair                                      |
| `transit-aspect`  | `transit-aspect:<aspect>:<transiting>:<natal>` | `transit-aspect:trine:mars:sun`    | Transiting Mars trine natal Sun      | by role, not alphabetical                                             |
| `synastry-aspect` | `synastry-aspect:<aspect>:<a>:<b>`             | `synastry-aspect:square:mars:moon` | Your Mars square their Moon          | alphabetical, one entry per pair; written from the first body’s owner |
| `dignity-state`   | `dignity-state:<body>:<state>`                 | `dignity-state:sun:ruler`          | Sun in its own sign (ruler)          | —                                                                     |
| `nakshatra`       | `nakshatra:<body>:<index>`                     | `nakshatra:moon:3`                 | _reserved: no entries_               | —                                                                     |
| `pattern`         | `pattern:<kebab-case-name>`                    | `pattern:bucket`                   | _reserved: no entries_               | —                                                                     |
| `profected-house` | `profected-house:<house>`                      | `profected-house:7`                | The 7th house as the profected house | —                                                                     |
| `astro-line`      | `astro-line:<body>:<angle>`                    | `astro-line:venus:MC`              | Venus on the Midheaven line          | —                                                                     |

## Ordering

- `aspect-pair` and `synastry-aspect` are stored **once per pair, alphabetically**; a key in the other order is refused.
- A `synastry-aspect` text is written from the **first body's owner** ("your Mars … their Moon" for `…:mars:moon`); a screen with
  the pair the other way round looks up the same entry and says whose side it speaks from (`src/ui/synastry-text.ts`, #422).
- `transit-aspect` is ordered by **role** (transiting, then natal).
- `sign-on-cusp` puts the sign first; `planet-in-house` puts the body first.

## Angle vocabulary

| Where                                              | Spelling                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Corpus `astro-line` keys                           | `AC` `DC` `MC` `IC` (kept: renaming would change every override and batch) |
| Point keys (AI payload `FocusAngle`, chart tables) | `asc` `dsc` `mc` `ic`                                                      |
| Screens                                            | names from `astro-names` (Ascendant, Midheaven…)                           |

`ACG_ANGLE_POINT_KEYS` in `schema.ts` is the one mapping between the first two.

## Reserved categories

`nakshatra` and `pattern` are accepted but unused: no entry, screen or generator. `profected-house` (Profections screen) and
`astro-line` (Astrocartography screen) are used.

## How this is kept true

- `test/interpretation-key-reference.test.ts` holds one example, shape and ordering rule per category and fails if one changes.
- `npm run corpus:audit` checks the committed corpus: valid canonical keys, no duplicates, English/Dutch parity, nothing outside
  the generator's scope, what the generator expects but the corpus lacks, and a theme check that catches a shifted sign or
  house index. The same audit runs in `test/tools-corpus-audit.test.ts`; run it after every regeneration.
