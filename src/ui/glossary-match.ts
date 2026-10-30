/**
 * Finds glossary terms in a run of plain prose (#902): the pure half of `GlossaryText`.
 */
/**
 * @module glossary-match
 * @purpose Splits one paragraph of text into plain and glossary-term segments, per locale, preferring the longest phrase, matching whole words only and marking each term at most once.
 * @conventions Pure and DOM-free. Match strings are each term's display name plus its per-locale `matches` aliases, compared case-insensitively. Word edges are Unicode-aware (letters and digits of any script, so Dutch and accented words are not cut), never a bare `\b`. One compiled pattern per locale is built once and reused.
 * @exports splitGlossaryText, GlossarySegment
 */
import type { Locale } from '../interpretation/schema.js';
import { astroGlossaryMessages, type GlossaryTermId } from './astro-glossary.messages.js';

/** A stretch of the paragraph: plain text, or the wording of a glossary term as the author wrote it. */
export type GlossarySegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'term'; readonly text: string; readonly id: GlossaryTermId };

interface Matcher {
  readonly pattern: RegExp;
  readonly idByPhrase: ReadonlyMap<string, GlossaryTermId>;
}

interface PhraseSource {
  readonly name: string;
  readonly matches?: readonly string[];
}

const matchers = new Map<Locale, Matcher>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function matcherFor(locale: Locale): Matcher {
  const cached = matchers.get(locale);
  if (cached !== undefined) return cached;
  const idByPhrase = new Map<string, GlossaryTermId>();
  const catalogue: Readonly<Record<string, PhraseSource>> = astroGlossaryMessages[locale];
  for (const [id, entry] of Object.entries(catalogue)) {
    for (const phrase of [entry.name, ...(entry.matches ?? [])]) {
      const key = phrase.toLowerCase();
      // The first term to claim a phrase keeps it; the catalogue test forbids one alias under two ids.
      if (!idByPhrase.has(key)) idByPhrase.set(key, id as GlossaryTermId);
    }
  }
  // Longest first, so "Chart ruler" is taken whole before any shorter phrase could claim part of it.
  const alternatives = [...idByPhrase.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const built: Matcher = { pattern, idByPhrase };
  matchers.set(locale, built);
  return built;
}

/** Splits `text` into segments; each term id is marked only at its first occurrence in this text. */
export function splitGlossaryText(text: string, locale: Locale): readonly GlossarySegment[] {
  const { pattern, idByPhrase } = matcherFor(locale);
  const segments: GlossarySegment[] = [];
  const marked = new Set<GlossaryTermId>();
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const id = idByPhrase.get(match[0].toLowerCase());
    if (id === undefined || marked.has(id)) continue;
    marked.add(id);
    if (match.index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.index) });
    segments.push({ kind: 'term', text: match[0], id });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}
