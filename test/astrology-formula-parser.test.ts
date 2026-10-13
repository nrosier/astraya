/**
 * Unit tests for the formula parser/evaluator (#566) — pure, no engine needed.
 *
 * Includes adversarial cases (malformed, injection-shaped, deeply nested input) proving this is
 * a real parser and not an `eval` in disguise: it must reject code-shaped input outright, not
 * silently execute it.
 */
import { describe, expect, it } from 'vitest';
import { evaluateFormula, FormulaError, parseFormula } from '../src/astrology/formula-parser.js';

const resolver = (values: Record<string, number>) => (name: string) => values[name.toLowerCase()];

describe('evaluateFormula (#566)', () => {
  it('evaluates a simple identifier sum', () => {
    expect(evaluateFormula('sun + moon', resolver({ sun: 10, moon: 20 }))).toBeCloseTo(30, 9);
  });

  it('evaluates the Lot-of-Fortune day-formula shape (ascendant + moon - sun)', () => {
    expect(evaluateFormula('ascendant + moon - sun', resolver({ ascendant: 100, moon: 50, sun: 20 }))).toBeCloseTo(
      130,
      9,
    );
  });

  it('resolves identifiers case-insensitively', () => {
    expect(evaluateFormula('Sun + MOON', resolver({ sun: 10, moon: 20 }))).toBeCloseTo(30, 9);
  });

  it('wraps the result into [0, 360)', () => {
    expect(evaluateFormula('sun + moon', resolver({ sun: 350, moon: 30 }))).toBeCloseTo(20, 9);
    expect(evaluateFormula('sun - moon', resolver({ sun: 10, moon: 30 }))).toBeCloseTo(340, 9);
  });

  it('honours parentheses and unary minus', () => {
    expect(evaluateFormula('-(sun - moon)', resolver({ sun: 10, moon: 30 }))).toBeCloseTo(20, 9);
  });

  it('accepts a numeric literal offset', () => {
    expect(evaluateFormula('sun + 90', resolver({ sun: 10 }))).toBeCloseTo(100, 9);
  });

  it('accepts the lot-formula display text’s own minus-sign glyph (U+2212)', () => {
    expect(evaluateFormula('ascendant + moon − sun', resolver({ ascendant: 100, moon: 50, sun: 20 }))).toBeCloseTo(
      130,
      9,
    );
  });

  it('throws for an unresolved identifier', () => {
    expect(() => evaluateFormula('mars + sun', resolver({ sun: 10 }))).toThrow(FormulaError);
  });

  it('throws for an empty formula', () => {
    expect(() => evaluateFormula('', resolver({}))).toThrow(FormulaError);
  });
});

describe('parseFormula adversarial input (#566)', () => {
  it('rejects an unmatched parenthesis', () => {
    expect(() => parseFormula('(sun + moon')).toThrow(FormulaError);
    expect(() => parseFormula('sun + moon)')).toThrow(FormulaError);
  });

  it('rejects a dangling operator', () => {
    expect(() => parseFormula('sun +')).toThrow(FormulaError);
    // No unary plus in this grammar (only unary minus) — a leading '+' has no left operand yet.
    expect(() => parseFormula('+ sun')).toThrow(FormulaError);
  });

  it('rejects stray trailing input after a complete expression', () => {
    expect(() => parseFormula('sun moon')).toThrow(FormulaError);
  });

  it('rejects characters outside the grammar (injection-shaped input)', () => {
    for (const attempt of [
      'sun; alert(1)',
      'sun * moon',
      'sun / moon',
      '`sun`',
      'sun`+moon`',
      'process.exit()',
      'require("fs")',
      'sun + {}',
      'sun[0]',
      'sun.moon',
      'sun = moon',
    ]) {
      expect(() => parseFormula(attempt), attempt).toThrow(FormulaError);
    }
  });

  it('a syntactically valid but unresolvable name like "__proto__" is just an ordinary unknown identifier, not a prototype-pollution path', () => {
    // Parses fine as a single identifier (the grammar has no opinion on names) — safety comes
    // from the resolver never doing a bare object-property lookup; evaluateFormula correctly
    // reports it as unresolved, same as any other name the resolver doesn't recognise.
    expect(parseFormula('__proto__')).toEqual({ kind: 'identifier', name: '__proto__' });
    expect(() => evaluateFormula('__proto__', resolver({}))).toThrow(FormulaError);
  });

  it('rejects an absurdly long formula', () => {
    const long = `sun ${'+ moon '.repeat(200)}`;
    expect(() => parseFormula(long)).toThrow(FormulaError);
  });

  it('rejects pathologically deep nesting rather than overflowing the call stack', () => {
    const depth = 200;
    const deeplyNested = `${'('.repeat(depth)}sun${')'.repeat(depth)}`;
    expect(() => parseFormula(deeplyNested)).toThrow(FormulaError);
  });

  it('never calls Function/eval — the AST is plain data, not generated code', () => {
    const node = parseFormula('sun + moon - mars');
    expect(node).toEqual({
      kind: 'subtract',
      left: { kind: 'add', left: { kind: 'identifier', name: 'sun' }, right: { kind: 'identifier', name: 'moon' } },
      right: { kind: 'identifier', name: 'mars' },
    });
  });
});
