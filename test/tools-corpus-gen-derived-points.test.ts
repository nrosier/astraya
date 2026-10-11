/**
 * The corpus tooling for the derived-point categories (#517): the Parts of Fortune and Spirit by sign and by
 * house. No source describes either point in a sign or house, so the generator COMPOSES entries from the sourced
 * rules in `tools/corpus-gen/classical-texts/derived-point.rules.json`. These tests keep that honest and offline:
 * every rule cites a passage that exists, the fact bundle the generator and the judge both see is complete and
 * consistent, the prompts and the judge note carry the guardrails, the category is opt-in for generation, and
 * the audit treats it as in-scope. Nothing here calls a paid API.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIGNS } from '../src/astrology/signs.js';
import { DERIVED_POINTS } from '../src/astrology/derived-points.js';
import { validateKey, placementKey, type CorpusPlacement } from '../src/interpretation/schema.js';
// prettier-ignore
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { buildPlacements as buildPlacementsUntyped, derivedPointFacts as derivedPointFactsUntyped, derivedPointRules as derivedPointRulesUntyped, factsDescription as factsDescriptionUntyped, placementDescription as placementDescriptionUntyped } from '../tools/corpus-gen/lib/placements.mjs';
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import * as promptUntyped from '../tools/corpus-gen/lib/prompt.mjs';
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { buildEvaluationPrompt as buildEvaluationPromptUntyped } from '../tools/corpus-gen/lib/corpus-evaluation.mjs';
// @ts-expect-error -- plain .mjs, no type declarations; cast to known shapes below.
import { auditCorpus as auditCorpusUntyped } from '../tools/corpus-gen/lib/corpus-audit.mjs';

const buildPlacements = buildPlacementsUntyped as () => readonly CorpusPlacement[];
const derivedPointFacts = derivedPointFactsUntyped as (placement: CorpusPlacement) => readonly string[];
const derivedPointRules = derivedPointRulesUntyped as () => Rules;
const factsDescription = factsDescriptionUntyped as (placement: CorpusPlacement) => string;
const placementDescription = placementDescriptionUntyped as (placement: CorpusPlacement) => string;
const prompt = promptUntyped as {
  buildDerivedPointSystemInstruction: (options: { locale: string; forceLanguageDirective: boolean }) => string;
  buildDerivedPointUserContent: (options: { placementDescription: string }) => string;
  DERIVED_POINT_VOICE: Record<string, string>;
  DERIVED_POINT_MIN_WORDS: number;
};
const buildEvaluationPrompt = buildEvaluationPromptUntyped as (options: {
  factsDescription: string;
  entryText: string;
}) => { systemInstruction: string; userContent: string };
const auditCorpus = auditCorpusUntyped as (
  corpus: Record<string, readonly { key: string; locale: string; text: string }[]>,
) => {
  failures: string[];
  notes: string[];
};

interface Rules {
  readonly points: Record<string, { name: string; nature: string; sources: string[] }>;
  readonly ruler_means: Record<string, { fortune: string; sources: string[] }>;
  readonly house_classes: Record<string, { houses: number[]; strength: string; sources: string[] }>;
}

const root = resolve(import.meta.dirname, '..');
const references = JSON.parse(
  readFileSync(resolve(root, 'docs/references/derived-points.references.json'), 'utf8'),
) as {
  passages: { id: string }[];
};
const derived = buildPlacements().filter(
  (placement) => placement.category === 'derived-point-in-sign' || placement.category === 'derived-point-in-house',
);

describe('the derived-point placement scope (#517)', () => {
  it('is 2 points x (12 signs + 12 houses) = 48, with valid canonical keys', () => {
    expect(derived).toHaveLength(48);
    for (const placement of derived) expect(validateKey(placementKey(placement)), placementKey(placement)).toEqual([]);
    for (const point of DERIVED_POINTS) {
      expect(
        derived.filter((p) => p.category === 'derived-point-in-sign' && 'point' in p && p.point === point.key),
      ).toHaveLength(12);
      expect(
        derived.filter((p) => p.category === 'derived-point-in-house' && 'point' in p && p.point === point.key),
      ).toHaveLength(12);
    }
  });
});

/** The data entries of a rules object, without its `$comment` annotation. */
const entries = <T>(object: Record<string, T>): T[] =>
  Object.entries(object)
    .filter(([key]) => !key.startsWith('$'))
    .map(([, value]) => value);

describe('derived-point.rules.json (#517)', () => {
  const rules = derivedPointRules();

  it('cites only passages that exist in the reference file', () => {
    const ids = new Set(references.passages.map((passage) => passage.id));
    const cited = [
      ...entries(rules.points).flatMap((point) => point.sources),
      ...entries(rules.ruler_means).flatMap((ruler) => ruler.sources),
      ...entries(rules.house_classes).flatMap((houseClass) => houseClass.sources),
    ];
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) expect(ids.has(id), id).toBe(true);
  });

  it('describes exactly the closed point list, each with a nature and at least one source', () => {
    expect(Object.keys(rules.points).sort()).toEqual(DERIVED_POINTS.map((point) => point.key).sort());
    for (const point of entries(rules.points)) {
      expect(point.nature.length).toBeGreaterThan(20);
      expect(point.sources.length).toBeGreaterThan(0);
    }
  });

  it('puts every house in exactly one of angular, succedent and cadent', () => {
    const all = entries(rules.house_classes).flatMap((houseClass) => houseClass.houses);
    expect([...all].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rules.house_classes.angular?.houses).toEqual([1, 4, 7, 10]);
  });

  it('has a ruler reading for all seven classical planets', () => {
    expect(
      Object.keys(rules.ruler_means)
        .filter((key) => !key.startsWith('$'))
        .sort(),
    ).toEqual(['jupiter', 'mars', 'mercury', 'moon', 'saturn', 'sun', 'venus']);
  });
});

describe('the composed-from facts (#517)', () => {
  it('exist for every one of the 48 placements, mention the point is not a planet, and never mention the formula', () => {
    for (const placement of derived) {
      const facts = derivedPointFacts(placement).join('\n');
      expect(facts, placementKey(placement)).toMatch(/not a planet or a body/);
      expect(facts, placementKey(placement)).not.toMatch(/\b(night|day birth|Ascendant|formula)\b/i);
    }
  });

  it('reads a sign through its classical ruler: Fortune in Taurus names Venus and its sourced means', () => {
    const facts = derivedPointFacts({
      category: 'derived-point-in-sign',
      point: 'part-of-fortune',
      sign: 1,
    }).join('\n');
    expect(facts).toContain('Taurus');
    expect(facts).toContain('element earth, modality fixed');
    expect(facts).toContain('classical ruler is Venus');
    expect(facts).toContain('friends, gifts and women');
  });

  it('flags the Part of Spirit by sign as synthesis, since no source reads it through a ruler', () => {
    const facts = derivedPointFacts({
      category: 'derived-point-in-sign',
      point: 'part-of-spirit',
      sign: 4,
    }).join('\n');
    expect(facts).toContain('classical ruler is the Sun');
    expect(facts).toContain('synthesis');
  });

  it("uses the classical rulers throughout: Aquarius is Saturn's, Scorpio Mars's, Pisces Jupiter's", () => {
    const rulerOf = (sign: number): string => {
      const facts = derivedPointFacts({
        category: 'derived-point-in-sign',
        point: 'part-of-fortune',
        sign,
      }).join('\n');
      return /classical ruler is (the )?(\w+)/.exec(facts)?.[2] ?? '';
    };
    expect(SIGNS[10]?.name).toBe('Aquarius');
    expect(rulerOf(10)).toBe('Saturn');
    expect(rulerOf(7)).toBe('Mars');
    expect(rulerOf(11)).toBe('Jupiter');
  });

  it("gives a house its topic and strength class, and flags Spirit's class as an analogy", () => {
    const fortune = derivedPointFacts({
      category: 'derived-point-in-house',
      point: 'part-of-fortune',
      house: 2,
    }).join('\n');
    expect(fortune).toContain('house of resources');
    expect(fortune).toContain('succedent');
    expect(fortune).not.toContain('analogy');
    const spirit = derivedPointFacts({
      category: 'derived-point-in-house',
      point: 'part-of-spirit',
      house: 10,
    }).join('\n');
    expect(spirit).toContain('vocation');
    expect(spirit).toContain('angular');
    expect(spirit).toContain('by analogy');
  });

  it('is the same bundle for the generator and the judge, so they cannot disagree about what may be claimed', () => {
    for (const placement of derived) {
      for (const line of derivedPointFacts(placement)) {
        expect(placementDescription(placement), placementKey(placement)).toContain(line);
        expect(factsDescription(placement), placementKey(placement)).toContain(line);
      }
    }
    const sample = derived[0] as CorpusPlacement;
    expect(placementDescription(sample)).toContain('FACTS TO USE');
    expect(factsDescription(sample)).toContain('and no others');
  });
});

describe('the derived-point prompts and judge (#517)', () => {
  it('compose from supplied facts and forbid events, timing, other planets and the formula, in either language', () => {
    for (const locale of ['en', 'nl']) {
      const system = prompt.buildDerivedPointSystemInstruction({ locale, forceLanguageDirective: false });
      expect(system).toContain('FACTS TO USE');
      expect(system).toContain('HARD CONSTRAINTS');
      expect(system).toMatch(/35 words/);
      expect(system).not.toContain('50 to 80 words');
    }
    const en = prompt.buildDerivedPointSystemInstruction({ locale: 'en', forceLanguageDirective: false });
    expect(en).toMatch(/no specific events, ages, timing/);
    expect(en).toMatch(/Do not mention day or night births/);
  });

  it('keeps the point names in English in Dutch, since no vetted Dutch term exists (#158)', () => {
    expect(prompt.DERIVED_POINT_VOICE.nl).toContain('Part of Fortune');
    expect(prompt.DERIVED_POINT_VOICE.nl).toContain('Part of Spirit');
    expect(prompt.DERIVED_POINT_VOICE.nl).not.toMatch(/Fortuinpunt|Geestpunt|Gelukspunt/);
  });

  it('puts the facts bundle in the user content', () => {
    const description = placementDescription(derived[0] as CorpusPlacement);
    expect(prompt.buildDerivedPointUserContent({ placementDescription: description })).toContain(description);
  });

  it('tells the judge to flag claims beyond the facts but not generality', () => {
    const sample = derived[0] as CorpusPlacement;
    const { systemInstruction, userContent } = buildEvaluationPrompt({
      factsDescription: factsDescription(sample),
      entryText: 'x',
    });
    expect(systemInstruction).toContain('derived point');
    expect(systemInstruction).toContain('must not be flagged as generic');
    expect(systemInstruction).toContain('goes beyond those facts');
    expect(userContent).toContain('and no others');
  });
});

describe('generation is opt-in, and the audit knows the category (#517)', () => {
  const generator = resolve(root, 'tools/corpus-gen/generate-batch.mjs');
  const dryRun = (...flags: string[]): string =>
    execFileSync('npx', ['tsx', generator, '--locale=en', '--dry-run', ...flags], { cwd: root, encoding: 'utf8' });

  it('leaves the derived points out of a plain run and says how to include them', () => {
    const output = dryRun();
    expect(output).toContain('--include-derived-points');
    expect(output).not.toContain('derived-point-in-sign:');
  });

  it('lists them, and sends nothing, when asked', () => {
    const output = dryRun('--include-derived-points', '--limit=2');
    expect(output).toContain('DRY RUN');
    expect(output).toContain('derived-point-in-sign: 2');
    expect(output).toContain('FACTS TO USE');
    expect(output).not.toContain('are not included');
  });

  it('treats a derived-point entry as in scope and lists the rest as expected-but-missing, not foreign', () => {
    const entry = {
      key: 'derived-point-in-sign:part-of-fortune:1',
      locale: 'en',
      text: 'x'.repeat(60),
    };
    const result = auditCorpus({ en: [entry], nl: [{ ...entry, locale: 'nl' }] });
    expect(result.failures.filter((failure) => failure.includes('derived-point'))).toEqual([]);
    expect(result.notes.join('\n')).toContain('derived-point-in-house:part-of-spirit:12');
  });
});
