#!/usr/bin/env node
/**
 * One-off drafting aid for #456's glossary groundwork: asks Gemini for a markdown-formatted
 * list of astrology terms and their definitions.
 *
 * This is NOT a build step and does not write to the shipped corpus, `src/`, or any app data —
 * its only job is to produce a quick first draft of candidate glossary content for a human to
 * review and turn into the real, centralized `astro-glossary.messages.ts` catalogue #456's
 * review recommended. Nothing it writes should be shipped verbatim.
 *
 *   node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=50
 *   node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=20 --output=draft.md
 *   node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=30 --locale=nl
 */
/**
 * @module generate-astrology-glossary
 * @purpose One-off drafting aid (#456): asks Gemini for a markdown bullet list of astrology terms and plain-language definitions, as a first draft for the app's glossary tooltip content.
 * @conventions CLI flag --count=<n> (required), --output=<path> (default: stdout), --locale=en|nl (default: en), --model=<name> (default: $GEMINI_MODEL). Plain node, no .ts imports, no shared tools/corpus-gen/lib dependency — a standalone one-off. Costs real API money per call.
 * @exports CLI entry point, no exports.
 */
import { writeFile } from 'node:fs/promises';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_MODEL = 'gemini-3.8-flash';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const LANGUAGE_NAME = { en: 'English', nl: 'Dutch' };

const rawArgs = process.argv.slice(2);

function flag(name, fallback) {
  const prefix = `--${name}=`;
  const found = rawArgs.find((arg) => arg.startsWith(prefix));
  return found === undefined ? fallback : found.slice(prefix.length);
}

function printHelp() {
  console.log(
    [
      'Usage: node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=<n> [options]',
      '',
      '   e.g.: node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=50',
      '         node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=20 --output=draft.md',
      '         node --env-file=.env.local tools/misc/generate-astrology-glossary.mjs --count=30 --locale=nl',
      '',
      'Asks Gemini for a markdown-formatted list of astrology terms and their definitions — a',
      "one-off drafting aid for #456's glossary tooltip content, not a build step. Prints to",
      'stdout unless --output is given. Never writes to src/ or any shipped app data; review and',
      'rewrite everything it produces before it becomes real glossary content.',
      '',
      'Options:',
      '  --count=<n>      How many terms to request. Required, must be a positive integer.',
      '  --output=<path>  Write the markdown to this file instead of stdout.',
      '  --locale=en|nl   Which language to write the terms/definitions in. Default: en.',
      '  --model=<name>   Which Gemini model to use. Default: $GEMINI_MODEL, else gemini-3.8-flash.',
      '',
      'Costs real API money per call. Requires GEMINI_API_KEY in the environment (.env.local).',
    ].join('\n'),
  );
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  printHelp();
  process.exit(0);
}

const count = Number(flag('count'));
if (!Number.isInteger(count) || count <= 0) {
  console.error('--count=<n> is required and must be a positive integer. See --help.');
  process.exit(1);
}

const locale = flag('locale', 'en');
if (locale !== 'en' && locale !== 'nl') {
  console.error(`Unknown --locale=${locale}. Expected en or nl.`);
  process.exit(1);
}

const outputPath = flag('output');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY not found in environment — see .env.local.example.');
  process.exit(1);
}
const model = flag('model', process.env.GEMINI_MODEL || DEFAULT_MODEL);
const baseUrl = process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL;
const temperature = Number(process.env.GEMINI_TEMPERATURE ?? 0.3);

const systemInstruction = [
  'You are an astrology reference editor writing a glossary for a general astrology application.',
  `Write every term and definition in ${LANGUAGE_NAME[locale]}.`,
  'Each definition must be plain-language, accurate, and 1-3 sentences long — enough for a',
  'curious reader with no prior astrology background, not a technical treatise.',
  'Cover a broad spread of the domain: houses, planets/bodies, zodiac signs, aspects (major and',
  'minor), dignities (rulership, exaltation, detriment, fall, triplicity, bound/term, face,',
  'peregrine), derived points (Part of Fortune, Vertex, midpoints, etc.), chart techniques',
  '(progressions, directions, transits, returns, synastry, composite charts, profections),',
  'and general vocabulary (retrograde, applying/separating, void of course, orb, dispositor,',
  'chart ruler, stationary, out of bounds, declination, antiscia, fixed stars).',
  'Never invent a term that does not exist in real astrological practice, and never state a',
  'definition as a fact about the real world — astrology is a symbolic/traditional system, not a',
  'scientific claim, so describe what the term means within the practice, not whether it is true.',
  'Never use fatalistic or absolute language ("will cause", "guarantees") in a definition.',
  'Output ONLY a markdown bullet list, one bullet per term, in this exact shape:',
  '- **Term** — Definition.',
  'No heading, no preamble, no closing remarks, no numbering — the list itself, nothing else.',
].join(' ');

const userContent = `List exactly ${String(count)} distinct astrology terms with their definitions, as the markdown bullet list described in your instructions. Do not repeat a term.`;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One plain-text `generateContent` call, retrying on 5xx/429 and surfacing 4xx immediately. */
async function callGemini({ maxRetries = 3 } = {}) {
  const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: { temperature, responseMimeType: 'text/plain' },
  };

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      lastError = networkError;
      if (attempt === maxRetries) throw networkError;
      await sleep(2 ** attempt * 1000);
      continue;
    }

    if (response.ok) {
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') {
        throw new Error(`unexpected response shape: ${JSON.stringify(payload).slice(0, 500)}`);
      }
      return text;
    }

    const errorBody = await response.text();
    lastError = new Error(`Gemini API ${String(response.status)}: ${errorBody.slice(0, 1000)}`);
    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) throw lastError;
    await sleep(2 ** attempt * 1000);
  }
  throw lastError ?? new Error('Gemini call failed for an unknown reason.');
}

const markdown = (await callGemini()).trim();

if (outputPath === undefined) {
  console.log(markdown);
} else {
  await writeFile(outputPath, `${markdown}\n`, 'utf8');
  console.error(`Wrote ${String(count)} terms to ${outputPath}.`);
}
