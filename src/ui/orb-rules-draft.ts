/**
 * @module ui/orb-rules-draft
 * @purpose Typed-string drafts of per-aspect and per-body orb rules (#590), and the checked conversion back to rules, shared by the person's orb-profile editor and the natal Extended settings card.
 * @conventions Pure. A blank base or blank body field means "no rule" (the built-in tier applies), never zero; a blank luminary bonus beside a base means 0. Conversion goes through `validateOrbRules`, so anything it refuses (a non-number, an orb outside 0°–30°) yields `undefined` rather than a partial rule set.
 * @exports OrbRulesDraft, OrbRules, withOrbRules, emptyOrbRulesDraft, orbRulesDraftFrom, orbRulesFromDraft
 */
import type { OrbRule } from '../astrology/aspects.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import { validateOrbRules } from '../astrology/orb-profiles.js';

export interface OrbRulesDraft {
  readonly aspects: Readonly<Record<string, { readonly base: string; readonly bonus: string }>>;
  readonly bodies: Readonly<Record<string, string>>;
}

export interface OrbRules {
  readonly aspectOrbs: Readonly<Record<string, OrbRule>>;
  readonly bodyOrbs: Readonly<Record<string, number>>;
}

/**
 * `settings` with its orb rules replaced by `rules`: absent when there are none, and with an empty half
 * left out, so it has exactly the shape `parseCalculationSnapshot` gives a stored bag (a never-customized
 * chart stays byte-identical to one written before rules existed).
 */
export function withOrbRules(settings: ExtendedSettings, rules: OrbRules | undefined): ExtendedSettings {
  const copy = { ...settings };
  delete copy.orbRules;
  if (rules === undefined) return copy;
  const hasAspects = Object.keys(rules.aspectOrbs).length > 0;
  const hasBodies = Object.keys(rules.bodyOrbs).length > 0;
  if (!hasAspects && !hasBodies) return copy;
  return {
    ...copy,
    orbRules: {
      ...(hasAspects ? { aspectOrbs: rules.aspectOrbs } : {}),
      ...(hasBodies ? { bodyOrbs: rules.bodyOrbs } : {}),
    },
  };
}

export const emptyOrbRulesDraft: OrbRulesDraft = { aspects: {}, bodies: {} };

export function orbRulesDraftFrom(
  rules:
    | { readonly aspectOrbs?: Readonly<Record<string, OrbRule>>; readonly bodyOrbs?: Readonly<Record<string, number>> }
    | undefined,
): OrbRulesDraft {
  return {
    aspects: Object.fromEntries(
      Object.entries(rules?.aspectOrbs ?? {}).map(([key, rule]) => [
        key,
        { base: String(rule.base), bonus: String(rule.luminaryBonus) },
      ]),
    ),
    bodies: Object.fromEntries(Object.entries(rules?.bodyOrbs ?? {}).map(([key, degrees]) => [key, String(degrees)])),
  };
}

/** The rules a draft stands for, or `undefined` when any typed value is not a number or is out of range. */
export function orbRulesFromDraft(draft: OrbRulesDraft): OrbRules | undefined {
  const aspectOrbs: Record<string, { base: number; luminaryBonus: number }> = {};
  for (const [key, row] of Object.entries(draft.aspects)) {
    if (row.base.trim() === '') continue;
    aspectOrbs[key] = { base: Number(row.base), luminaryBonus: row.bonus.trim() === '' ? 0 : Number(row.bonus) };
  }
  const bodyOrbs: Record<string, number> = {};
  for (const [key, text] of Object.entries(draft.bodies)) {
    if (text.trim() !== '') bodyOrbs[key] = Number(text);
  }
  return validateOrbRules({ aspectOrbs, bodyOrbs });
}
