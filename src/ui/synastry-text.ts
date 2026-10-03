/**
 * The interpretation text for one Synastry aspect (#422): the reviewed `synastry-aspect` corpus entry
 * when there is one, the mechanical sentence when there is not.
 *
 * The corpus stores each *pair* of bodies once, with the keys in alphabetical order, and writes the
 * text from the first body's owner ("Your immediate impulses [Mars] run into the other person's
 * emotional needs [Moon]"). A Synastry row is ordered by person instead — body A is this screen's
 * person, body B the partner — so a row whose bodies are the other way round finds the same entry,
 * and its "you" is then the *partner*. The result says which side the text speaks from, so the
 * screen can name that person instead of attributing a partner's Mars to the wrong chart.
 *
 * A body paired with itself (A's Venus with B's Venus) has no corpus entry, so it keeps the
 * mechanical sentence, which is symmetrical.
 */
import { composeFallbackText, findCorpusEntry } from '../interpretation/compose.js';
import type { CorpusEntry, CorpusPlacement, Locale, PersonaId } from '../interpretation/schema.js';

export interface SynastryRow {
  readonly aspectKey: string;
  readonly bodyAKey: string;
  readonly bodyBKey: string;
}

export interface SynastryText {
  readonly text: string;
  /** Whose side the text speaks from, when it is a corpus entry; `undefined` for the fallback sentence. */
  readonly speaksFrom: 'a' | 'b' | undefined;
}

function placement(row: SynastryRow, bodyA: string, bodyB: string): CorpusPlacement {
  return { category: 'synastry-aspect', aspect: row.aspectKey, bodyA, bodyB };
}

export function synastryText(
  row: SynastryRow,
  locale: Locale,
  corpus: readonly CorpusEntry[],
  persona?: PersonaId,
): SynastryText {
  // The corpus order is alphabetical by key; a row already in that order speaks from person A.
  const inCorpusOrder = row.bodyAKey <= row.bodyBKey;
  const canonical = inCorpusOrder
    ? placement(row, row.bodyAKey, row.bodyBKey)
    : placement(row, row.bodyBKey, row.bodyAKey);
  const entry = findCorpusEntry(canonical, locale, corpus, persona);
  if (entry !== undefined && row.bodyAKey !== row.bodyBKey) {
    return { text: entry.text, speaksFrom: inCorpusOrder ? 'a' : 'b' };
  }
  return { text: composeFallbackText(placement(row, row.bodyAKey, row.bodyBKey), locale), speaksFrom: undefined };
}
