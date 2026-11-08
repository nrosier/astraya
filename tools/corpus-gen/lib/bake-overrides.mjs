/**
 * @module bake-overrides
 * @purpose Plans and applies the export of approved server-side corpus overrides into the committed en/nl corpus files (#1338 D3), through `writeCorpus`.
 * @conventions Pure planning (`planBake`) is separate from writing (`applyBake`). Overrides are processed sorted by locale then key, so the same input always gives the same output. Only `key`, `locale`, `text`, `tier`, `tags` and `reviewedAt` are read from an override: `reviewedBy` and any other field, a username included, are never copied into the corpus. A baked entry keeps the committed entry's own fields and gets `provenance: { source: "hand-written", reviewedAt }`. An override whose key is absent from the committed corpus is an orphan: reported, never written. An override whose text equals the committed text is reported for pruning, never written. Writing replaces entries in place through `writeCorpus`, so neighbours keep their exact bytes. Nothing here runs by itself; `bake-overrides.mjs` is the human-run CLI.
 * @exports LOCALES, planBake, applyBake, renderDiff.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeCorpus } from './write-corpus.mjs';

export const LOCALES = ['en', 'nl'];

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param {Record<string, readonly object[]>} corpusByLocale committed entries per locale
 * @param {readonly object[]} overrides the database export (entries with key, locale, text, tier, tags, provenance)
 * @returns {{updates: object[], identical: object[], orphans: object[], invalid: object[]}}
 */
export function planBake(corpusByLocale, overrides) {
  const updates = [];
  const identical = [];
  const orphans = [];
  const invalid = [];
  const sorted = [...overrides].sort((a, b) => compare(a.locale, b.locale) || compare(a.key, b.key));
  for (const override of sorted) {
    if (
      typeof override.key !== 'string' ||
      typeof override.text !== 'string' ||
      !LOCALES.includes(override.locale) ||
      !Array.isArray(override.tags)
    ) {
      invalid.push({ key: String(override.key), locale: String(override.locale) });
      continue;
    }
    const corpus = corpusByLocale[override.locale] ?? [];
    const index = corpus.findIndex((entry) => entry.key === override.key);
    if (index === -1) {
      orphans.push({ key: override.key, locale: override.locale });
      continue;
    }
    const committed = corpus[index];
    if (committed.text === override.text) {
      identical.push({ key: override.key, locale: override.locale });
      continue;
    }
    const reviewedAt = override.provenance?.reviewedAt;
    const entry = {
      ...committed,
      text: override.text,
      tier: override.tier ?? committed.tier,
      tags: override.tags,
      provenance: { source: 'hand-written', ...(typeof reviewedAt === 'string' ? { reviewedAt } : {}) },
    };
    updates.push({ key: override.key, locale: override.locale, index, before: committed, entry });
  }
  return { updates, identical, orphans, invalid };
}

/** A plain, stable text diff of the planned changes (nothing is written by printing it). */
export function renderDiff(plan) {
  const lines = [];
  for (const update of plan.updates) {
    lines.push(`~ ${update.locale} ${update.key}`);
    lines.push(`- ${update.before.text}`);
    lines.push(`+ ${update.entry.text}`);
  }
  return lines.join('\n');
}

/**
 * Reads both committed corpus files from `corpusDir`, plans the bake and, only when `write` is true, writes the
 * changed locales back through `writeCorpus`. With `write` false nothing on disk is touched.
 */
export async function applyBake({ corpusDir, overrides, write }) {
  const corpusByLocale = {};
  for (const locale of LOCALES) {
    corpusByLocale[locale] = JSON.parse(await readFile(join(corpusDir, `${locale}.json`), 'utf8'));
  }
  const plan = planBake(corpusByLocale, overrides);
  if (write) {
    for (const locale of LOCALES) {
      const changes = plan.updates.filter((update) => update.locale === locale);
      if (changes.length === 0) continue;
      const next = [...corpusByLocale[locale]];
      for (const change of changes) next[change.index] = change.entry;
      await writeCorpus(join(corpusDir, `${locale}.json`), next);
    }
  }
  return plan;
}
