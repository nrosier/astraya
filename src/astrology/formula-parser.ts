/**
 * A restricted arithmetic-expression parser/evaluator for user-defined points (#566): the
 * computational core a "Sun + Moon - Ascendant"-style custom formula needs, matching the
 * day/night Lot-of-Fortune pattern (`arabic-parts.ts`'s own formulas are exactly this shape,
 * shown there only as display text — never parsed) but now actually evaluable from a string a
 * user typed.
 *
 * Hand-rolled recursive-descent, by design: no `eval`, no `new Function`, no code execution of
 * any kind. The grammar is deliberately small — addition, subtraction, unary minus, decimal
 * number literals, parenthesised grouping, and bare identifiers (resolved by the caller, this
 * module never looks inside a `ChartData` itself) — matching the arithmetic every lot formula in
 * this codebase already uses (`base ± a ∓ b`), not a general-purpose calculator. No
 * multiplication/division/exponentiation: nothing in this app's existing dignity/lot vocabulary
 * needs them, and adding them would invite "invented" formulas with no cited basis, the same
 * concern this project's own domain-integrity rule raises for numbers generally.
 *
 * A nesting-depth limit (`MAX_DEPTH`) and length limit (`MAX_EXPRESSION_LENGTH`) guard against a
 * pathological input (`(((((...)))))`) blowing the call stack or looping — this parser only ever
 * runs against locally-typed input, not untrusted network input, but a safe parser should not
 * assume that forever.
 */
/**
 * @module astrology/formula-parser
 * @purpose Parses and evaluates a restricted arithmetic expression (+, -, parentheses, decimal literals, named identifiers) over a caller-supplied identifier resolver — the engine behind user-defined points.
 * @conventions Hand-rolled recursive-descent tokenizer + parser + evaluator; no eval/Function/code-generation of any kind; grammar is addition/subtraction/unary-minus/parentheses/identifiers only, matching this codebase's own lot-formula shape; depth and length limits guard against pathological input.
 * @exports parseFormula, evaluateFormula, FormulaError, FormulaNode, IdentifierResolver
 */
import type { Degrees } from '../ephemeris/types.js';

export class FormulaError extends Error {}

const MAX_EXPRESSION_LENGTH = 500;
const MAX_DEPTH = 50;

type TokenKind = 'number' | 'identifier' | 'plus' | 'minus' | 'lparen' | 'rparen' | 'end';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
}

/** An identifier token may be a letter/underscore followed by letters/digits/underscores — a plain name, never a code-execution surface. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER_RE = /^\d+(\.\d+)?/;

function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let rest = source;
  while (rest.length > 0) {
    const char = rest[0];
    if (char === ' ' || char === '\t' || char === '\n') {
      rest = rest.slice(1);
      continue;
    }
    if (char === '+') {
      tokens.push({ kind: 'plus', value: '+' });
      rest = rest.slice(1);
      continue;
    }
    if (char === '-' || char === '−' /* U+2212 minus sign, used in this app's own lot-formula display text */) {
      tokens.push({ kind: 'minus', value: '-' });
      rest = rest.slice(1);
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen', value: '(' });
      rest = rest.slice(1);
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen', value: ')' });
      rest = rest.slice(1);
      continue;
    }
    const numberMatch = NUMBER_RE.exec(rest);
    if (numberMatch?.[0] !== undefined) {
      tokens.push({ kind: 'number', value: numberMatch[0] });
      rest = rest.slice(numberMatch[0].length);
      continue;
    }
    const identifierMatch = IDENTIFIER_RE.exec(rest);
    if (identifierMatch?.[0] !== undefined) {
      tokens.push({ kind: 'identifier', value: identifierMatch[0] });
      rest = rest.slice(identifierMatch[0].length);
      continue;
    }
    throw new FormulaError(`Unexpected character "${char}" in formula.`);
  }
  tokens.push({ kind: 'end', value: '' });
  return tokens;
}

export type FormulaNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'identifier'; readonly name: string }
  | { readonly kind: 'negate'; readonly operand: FormulaNode }
  | { readonly kind: 'add'; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'subtract'; readonly left: FormulaNode; readonly right: FormulaNode };

class Parser {
  private position = 0;
  private readonly tokens: readonly Token[];
  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    const token = this.tokens[this.position];
    if (token === undefined) throw new FormulaError('Unexpected end of formula.');
    return token;
  }

  /** Called once parsing is believed complete: anything left besides the sentinel `end` token is a stray suffix (e.g. a stray `)` or two expressions with no operator between them). */
  expectEnd(): void {
    if (this.peek().kind !== 'end') throw new FormulaError('Unexpected trailing input.');
  }

  private advance(): Token {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  /** Addition/subtraction, left-associative — the only binary operators this grammar has. */
  parseExpression(depth: number): FormulaNode {
    if (depth > MAX_DEPTH) throw new FormulaError('Formula is nested too deeply.');
    let node = this.parseUnary(depth);
    for (;;) {
      const token = this.peek();
      if (token.kind === 'plus') {
        this.advance();
        node = { kind: 'add', left: node, right: this.parseUnary(depth + 1) };
      } else if (token.kind === 'minus') {
        this.advance();
        node = { kind: 'subtract', left: node, right: this.parseUnary(depth + 1) };
      } else {
        return node;
      }
    }
  }

  private parseUnary(depth: number): FormulaNode {
    if (this.peek().kind === 'minus') {
      this.advance();
      return { kind: 'negate', operand: this.parseUnary(depth + 1) };
    }
    return this.parsePrimary(depth);
  }

  private parsePrimary(depth: number): FormulaNode {
    const token = this.advance();
    if (token.kind === 'number') return { kind: 'number', value: Number(token.value) };
    if (token.kind === 'identifier') return { kind: 'identifier', name: token.value };
    if (token.kind === 'lparen') {
      const inner = this.parseExpression(depth + 1);
      const closing = this.advance();
      if (closing.kind !== 'rparen') throw new FormulaError('Expected a closing parenthesis.');
      return inner;
    }
    throw new FormulaError(`Unexpected token "${token.value || 'end of formula'}".`);
  }
}

/** Parses a formula string into an AST. Throws `FormulaError` for anything the grammar doesn't accept. */
export function parseFormula(source: string): FormulaNode {
  if (source.length === 0) throw new FormulaError('Formula is empty.');
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaError(`Formula is too long (max ${String(MAX_EXPRESSION_LENGTH)} characters).`);
  }
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const node = parser.parseExpression(0);
  // parseExpression stops at the first token it doesn't recognise as part of an expression;
  // anything left over besides the sentinel `end` token means the formula has a stray suffix
  // (e.g. "Sun + Moon )", or "Sun Moon" with no operator between them), which must be reported
  // rather than silently ignored.
  parser.expectEnd();
  return node;
}

/** Resolves a bare identifier (a body key, or an angle name like `ascendant`) to its longitude, or `undefined` if unknown — the caller's own vocabulary, this module has no opinion on what names are valid. */
export type IdentifierResolver = (name: string) => Degrees | undefined;

function evaluateNode(node: FormulaNode, resolve: IdentifierResolver): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'identifier': {
      const value = resolve(node.name);
      if (value === undefined) throw new FormulaError(`Unknown point or body "${node.name}".`);
      return value;
    }
    case 'negate':
      return -evaluateNode(node.operand, resolve);
    case 'add':
      return evaluateNode(node.left, resolve) + evaluateNode(node.right, resolve);
    case 'subtract':
      return evaluateNode(node.left, resolve) - evaluateNode(node.right, resolve);
  }
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Parses and evaluates `source` against `resolve`, wrapping the result into [0, 360). Throws `FormulaError` on any parse or resolution failure. */
export function evaluateFormula(source: string, resolve: IdentifierResolver): Degrees {
  const node = parseFormula(source);
  const result = evaluateNode(node, resolve);
  if (!Number.isFinite(result)) throw new FormulaError('Formula did not evaluate to a finite number.');
  return norm360(result);
}
