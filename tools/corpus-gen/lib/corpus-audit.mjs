/**
 * The repeatable corpus audit (#427): everything that was checked by hand when the key scheme was
 * first questioned, as a function over the committed corpus, so the corpus loop and CI can run it
 * after every regeneration instead of someone repeating the work.
 *
 * Checks, in two tiers. **Failures** break the corpus: a key that does not validate or is not in
 * canonical form, a duplicate key, a locale field that disagrees with its file, English and Dutch
 * not holding the same keys, an entry outside the generator's scope, and a text whose theme drifts
 * from its key's own sign or house (a systematic shift would mean the zero-based sign and one-based
 * house indexing had slipped somewhere). **Notes** are information the reader may act on: placements
 * the generator expects that the corpus does not have yet.
 *
 * The theme check is deliberately a heuristic. An entry's text never names its sign or planet, so
 * names cannot be matched; instead each text is scored against theme words for every sign (or house)
 * and the best-scoring theme is compared with the key's own index. It cannot say a text is *right*,
 * only that the keys are not systematically shifted — the offset between the best theme and the
 * key must pile up at zero, not at one or eleven.
 */
import { buildPlacements } from './placements.mjs';
import { placementKey, validateKey, parsePlacementKey } from '../../../src/interpretation/schema.ts';

/** Theme words per sign, index 0 = Aries … 11 = Pisces. Matched as lowercase substrings of the text. */
export const SIGN_THEMES = [
  ['initiative', 'begin', 'bold', 'direct', 'impuls', 'courage', 'assertive', 'pioneer', 'competitive', 'spontaneous'],
  ['steady', 'stable', 'tangible', 'sensory', 'comfort', 'patient', 'material', 'persisten', 'pleasure', 'unhurried'],
  ['curious', 'perspectives', 'communicat', 'ideas', 'versatil', 'information', 'variety', 'conversation', 'questions'],
  ['nurtur', 'emotional', 'protect', 'home', 'family', 'caring', 'feelings', 'belonging', 'tender', 'mother'],
  ['spotlight', 'recognition', 'pride', 'warmth', 'generous', 'heart', 'confiden', 'creative expression', 'dramatic'],
  ['detail', 'refine', 'practical', 'analy', 'improve', 'service', 'routine', 'precise', 'useful', 'discern'],
  ['balance', 'harmony', 'fairness', 'partnership', 'diplomacy', 'cooperat', 'compromise', 'mutual', 'graceful'],
  ['intens', 'depth', 'transform', 'hidden', 'power', 'passion', 'secret', 'trust', 'probe', 'obsess'],
  ['meaning', 'explor', 'belief', 'broaden', 'adventur', 'freedom', 'philosoph', 'optimis', 'vision', 'truth'],
  ['structure', 'disciplin', 'responsib', 'achievement', 'ambition', 'long-term', 'authority', 'goals', 'mastery'],
  ['independen', 'unconvention', 'collective', 'innovat', 'detach', 'ideals', 'communit', 'original', 'humanitarian'],
  [
    'intuiti',
    'imagination',
    'dissolv',
    'compassion',
    'boundaries',
    'dream',
    'empath',
    'spiritual',
    'fluid',
    'sensitiv',
  ],
];

/** Theme words per house, index 0 = the 1st house … 11 = the 12th. */
export const HOUSE_THEMES = [
  ['identity', 'appearance', 'first impression', 'self-image', 'how you present', 'personal style', 'sense of self'],
  ['money', 'possessions', 'self-worth', 'income', 'resources', 'values', 'tangible', 'earn'],
  ['communicat', 'sibling', 'learning', 'neighbo', 'everyday exchanges', 'speak', 'short trips', 'local'],
  ['home', 'family', 'roots', 'foundation', 'private life', 'ancestr', 'domestic', 'belonging'],
  ['creativ', 'play', 'romance', 'children', 'pleasure', 'self-expression', 'hobbies', 'fun'],
  ['daily routine', 'health', 'work habits', 'service', 'habits', 'wellbeing', 'workplace', 'duties'],
  ['partnership', 'marriage', 'one-to-one', 'close relationship', 'other people', 'commitment', 'counterpart'],
  ['shared resources', 'intimacy', 'transform', 'merge', 'inherit', 'crisis', 'depth', 'vulnerab', 'trust'],
  ['belief', 'travel', 'higher learning', 'philosoph', 'meaning', 'foreign', 'worldview', 'wisdom', 'faith'],
  ['career', 'reputation', 'public', 'vocation', 'status', 'authority', 'ambition', 'achievement', 'legacy'],
  ['friend', 'group', 'communit', 'hopes', 'network', 'social circle', 'ideals', 'collective', 'aspirations'],
  ['solitude', 'hidden', 'unconscious', 'retreat', 'surrender', 'behind the scenes', 'subconscious', 'isolation'],
];

function scoreAgainst(text, themes) {
  const lower = text.toLowerCase();
  return themes.map((words) => words.reduce((total, word) => total + (lower.includes(word) ? 1 : 0), 0));
}

/**
 * How the best-matching theme of each *clear* text sits relative to its key's own index: a tally of
 * offsets 0..11 (`(best - own) mod 12`). A text is clear when its best theme scores at least two and
 * strictly beats every other. Systematic indexing slips show up as a pile at some other offset.
 */
export function themeOffsets(entries, category, themes) {
  const tally = new Array(12).fill(0);
  let clear = 0;
  for (const entry of entries) {
    const placement = parsePlacementKey(entry.key);
    if (placement === undefined || placement.category !== category) continue;
    const own = category === 'planet-in-sign' ? placement.sign : placement.house - 1;
    const scores = scoreAgainst(entry.text, themes);
    const top = Math.max(...scores);
    if (top < 2 || scores.filter((score) => score === top).length > 1) continue;
    clear += 1;
    tally[(((scores.indexOf(top) - own) % 12) + 12) % 12] += 1;
  }
  return { clear, tally };
}

const THEME_MIN_CLEAR = 60;
/** The offset-0 share must be at least this, and at least twice any other offset's. */
const THEME_MIN_SHARE = 0.4;

/** The audit. `corpus` maps a locale to its committed entries; the result lists failures and notes. */
export function auditCorpus(corpus) {
  const failures = [];
  const notes = [];
  const expected = new Set(buildPlacements().map(placementKey));
  const keysByLocale = new Map();

  for (const [locale, entries] of Object.entries(corpus)) {
    const seen = new Set();
    for (const entry of entries) {
      if (entry.locale !== locale) failures.push(`[${locale}] "${entry.key}" declares locale "${entry.locale}"`);
      for (const error of validateKey(entry.key)) failures.push(`[${locale}] ${error}`);
      if (seen.has(entry.key)) failures.push(`[${locale}] duplicate key "${entry.key}"`);
      seen.add(entry.key);
      if (!expected.has(entry.key)) failures.push(`[${locale}] "${entry.key}" is outside the generator's scope`);
    }
    keysByLocale.set(locale, seen);
    const missing = [...expected].filter((key) => !seen.has(key));
    if (missing.length > 0) {
      notes.push(
        `[${locale}] ${String(missing.length)} expected placement(s) not generated yet: ${missing.join(', ')}`,
      );
    }
  }

  const locales = [...keysByLocale.keys()];
  for (const locale of locales) {
    for (const other of locales) {
      if (other === locale) continue;
      for (const key of keysByLocale.get(locale) ?? []) {
        if (!(keysByLocale.get(other) ?? new Set()).has(key))
          failures.push(`"${key}" is in "${locale}" but not in "${other}"`);
      }
    }
  }

  const english = corpus.en;
  if (english !== undefined) {
    for (const [category, themes, label] of [
      ['planet-in-sign', SIGN_THEMES, 'sign'],
      ['planet-in-house', HOUSE_THEMES, 'house'],
    ]) {
      const { clear, tally } = themeOffsets(english, category, themes);
      if (clear < THEME_MIN_CLEAR) {
        notes.push(`[en] only ${String(clear)} clear ${label} texts: too few to judge a ${label} shift`);
        continue;
      }
      const share = (offset) => (tally[offset] ?? 0) / clear;
      const strongestOther = Math.max(...tally.slice(1).map((_, i) => share(i + 1)));
      notes.push(`[en] ${category}: ${String(tally[0])} of ${String(clear)} clear texts match their own ${label}`);
      if (share(0) < THEME_MIN_SHARE || share(0) < 2 * strongestOther) {
        failures.push(
          `[en] ${category}: the best-matching ${label} theme is not the key's own for most texts (offset tally ${tally.join(',')}), which looks like a shifted index`,
        );
      }
    }
  }

  return { failures, notes };
}
