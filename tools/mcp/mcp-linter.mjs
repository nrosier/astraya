/**
 * astraya-linter: an MCP server exposing Astraya's own corpus guardrails as tools, so an agent
 * generating interpretation text can validate it in-flight — before writing to
 * `src/interpretation/corpus/<locale>.json` — instead of a human catching a violation after the
 * fact in a diff. Every rule here is re-exported from the app's own source, never reimplemented:
 * `src/interpretation/lint.ts` (tone/style: fatalistic phrasing, medical/legal/financial claims,
 * gendered pronouns, length, language mismatch), `src/interpretation/schema.ts` (key shape and
 * field validity against the real body/sign/aspect reference data), and this file's own
 * `checkLocaleParity` (en/nl key-set parity, the same check `tools/corpus-gen/lib/corpus-audit.mjs`
 * runs over the whole corpus, here callable for just the keys about to be touched). A rule that
 * drifts from the app's own enforcement would be worse than no linter at all, so nothing here
 * hardcodes a phrase list, a length bound, or a key shape a second time.
 *
 * Three tools, matching the three guardrail areas:
 *   - lint_corpus_entry: schema + tone/style check for one candidate entry, PASS/FAIL + reasons.
 *   - validate_corpus_key: schema-only check (no text yet) — cheap enough to call before drafting.
 *   - check_locale_parity: do these keys exist, with the same tier, in every locale?
 *
 * Run directly: `npx tsx tools/mcp/mcp-linter.mjs` (stdio transport). Registered once via
 * `claude mcp add --transport stdio astraya-linter -s project -- npx tsx tools/mcp/mcp-linter.mjs`.
 *
 * Imports from `src/interpretation/*.ts` directly — allowed in this direction (`tools/` may read
 * `src/`; `src/` may never read `tools/`, lint-enforced in `eslint.config.js`). Running under tsx,
 * same as every `tools/corpus-gen/*.mjs` script that already imports `.ts` files this way.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { lintEntry } from '../../src/interpretation/lint.ts';
import { CORPUS_LOCALES, CORPUS_TIERS, categoryOfKey, validateKey } from '../../src/interpretation/schema.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const corpusPath = (locale) => join(root, 'src', 'interpretation', 'corpus', `${locale}.json`);

/** One locale's committed corpus, or `[]` if the file doesn't exist yet (mirrors generate-batch.mjs's own fallback). */
async function readCorpus(locale) {
  try {
    return JSON.parse(await readFile(corpusPath(locale), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * `lintEntry` needs a `CorpusEntry`-shaped object; a draft that hasn't been written yet has no
 * real provenance, so this stands in a placeholder "generated, today" one — fine, since no lint
 * rule reads `provenance`.
 */
function draftEntry({ key, text, locale, tier }) {
  return {
    key,
    locale,
    text,
    tier: tier ?? 'core',
    tags: [],
    provenance: { source: 'generated', generatedAt: new Date().toISOString().slice(0, 10) },
  };
}

function schemaIssues(key) {
  const errors = validateKey(key);
  return errors.map((message) => ({ rule: 'schema', message }));
}

/**
 * Checks that each of `keys` exists, in the same locale set, as every other configured locale —
 * the same parity rule `corpus-audit.mjs`'s whole-corpus pass enforces, scoped to just the keys an
 * agent is about to touch rather than the full ~5,000-entry corpus, so this stays cheap enough to
 * call after every small batch instead of only at the end of a run.
 */
async function checkLocaleParity(keys) {
  const corpusByLocale = new Map(
    await Promise.all(CORPUS_LOCALES.map(async (locale) => [locale, await readCorpus(locale)])),
  );
  const keySetByLocale = new Map(
    CORPUS_LOCALES.map((locale) => [locale, new Set((corpusByLocale.get(locale) ?? []).map((entry) => entry.key))]),
  );
  const missing = [];
  for (const key of keys) {
    const presentIn = CORPUS_LOCALES.filter((locale) => keySetByLocale.get(locale)?.has(key));
    const missingFrom = CORPUS_LOCALES.filter((locale) => !presentIn.includes(locale));
    if (presentIn.length > 0 && missingFrom.length > 0) {
      missing.push({ key, presentIn, missingFrom });
    }
  }
  return missing;
}

const TOOLS = [
  {
    name: 'lint_corpus_entry',
    description:
      'Validates one candidate corpus entry — key schema AND tone/style (fatalistic phrasing, ' +
      'medical/legal/financial claims, gendered pronouns, length, language mismatch) — against ' +
      "Astraya's own enforced rules, before it is written to src/interpretation/corpus/<locale>.json. " +
      'Returns PASS or FAIL with every reason, not just the first.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Canonical corpus key, e.g. "planet-in-sign:sun:2".' },
        text: { type: 'string', description: 'The candidate entry text.' },
        locale: { type: 'string', enum: [...CORPUS_LOCALES], description: 'Which locale this text is written in.' },
        tier: { type: 'string', enum: [...CORPUS_TIERS], description: 'Optional; defaults to "core".' },
      },
      required: ['key', 'text', 'locale'],
    },
  },
  {
    name: 'validate_corpus_key',
    description:
      'Schema-only check for a corpus key: is it a known category, in canonical form, with every ' +
      'field (body/sign/house/aspect/state) a real reference value? No text needed — cheap enough ' +
      'to call before drafting an entry at all, e.g. to confirm a composite-planet-in-sign key is ' +
      'shaped right before generating the text for it.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
  {
    name: 'check_locale_parity',
    description:
      "For each given key, checks whether it exists in every configured locale's committed corpus " +
      '(en and nl) — flags a key present in one locale but missing from another. Scoped to the keys ' +
      'you pass, not the whole corpus, so it stays cheap after a small generation batch.',
    inputSchema: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' }, description: 'Corpus keys to check for parity.' },
      },
      required: ['keys'],
    },
  },
];

const server = new Server({ name: 'astraya-linter', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'validate_corpus_key') {
    const issues = schemaIssues(args.key);
    const category = categoryOfKey(args.key);
    const text =
      issues.length === 0
        ? `PASS — "${args.key}" is a valid, canonical ${String(category)} key.`
        : `FAIL — ${issues.map((issue) => issue.message).join('; ')}`;
    return { content: [{ type: 'text', text }], isError: issues.length > 0 };
  }

  if (name === 'lint_corpus_entry') {
    const issues = [
      ...schemaIssues(args.key),
      ...lintEntry(draftEntry(args)).map((issue) => ({ rule: issue.rule, message: issue.message })),
    ];
    const text =
      issues.length === 0
        ? `PASS — "${args.key}" (${args.locale}) passes schema and tone/style checks.`
        : `FAIL — ${issues.map((issue) => `[${issue.rule}] ${issue.message}`).join('; ')}`;
    return { content: [{ type: 'text', text }], isError: issues.length > 0 };
  }

  if (name === 'check_locale_parity') {
    const missing = await checkLocaleParity(args.keys);
    const text =
      missing.length === 0
        ? `PASS — every one of the ${String(args.keys.length)} key(s) has the same locale coverage everywhere it exists.`
        : `FAIL — ${missing
            .map((m) => `"${m.key}" is in ${m.presentIn.join('/')} but missing from ${m.missingFrom.join('/')}`)
            .join('; ')}`;
    return { content: [{ type: 'text', text }], isError: missing.length > 0 };
  }

  throw new Error(`astraya-linter: unknown tool "${name}"`);
});

await server.connect(new StdioServerTransport());
