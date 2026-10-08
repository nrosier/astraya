#!/usr/bin/env node
/**
 * Cross-translate undisputed composite entries to replace disputed ones (#451).
 *
 * Validates each translation for language correctness before accepting it.
 *
 * Workflow:
 *   node cross-translate-composite.mjs --translate
 *      → Identifies en/nl mismatches (one language clean, other disputed)
 *      → Translates each via Gemini generative API
 *      → Validates each translation for language correctness
 *      → Writes results and resets eval-tracking
 *      → Ready to commit
 *
 * Can use --batch to submit all translation + validation calls as one Gemini Batch API job
 * (50% pricing) instead of ~38 individual HTTP calls.
 *
 * Usage:
 *   node tools/corpus-gen/cross-translate-composite.mjs --translate
 *   node tools/corpus-gen/cross-translate-composite.mjs --translate --batch
 *
 * Cost: ~19 Gemini calls for translation + 1 per translation for validation,
 * or half of that under --batch.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTracking } from './lib/eval-tracking.mjs';
import { generateStructured, toGeminiSchema } from './lib/gemini.mjs';
import { buildLanguageQualityPrompt, LANGUAGE_QUALITY_RESPONSE_SCHEMA } from './lib/language-quality.mjs';
import { buildBatchRequest, submitBatch, pollBatch, extractBatchResults } from './lib/gemini-batch.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load environment
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY not found in environment');
  process.exit(1);
}
const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// Disputed keys per locale (from #451 closure comment)
const DISPUTED_EN = new Set([
  'composite-aspect-pair:semisextile:interpolatedLilith:uranus',
  'composite-aspect-pair:semisquare:interpolatedLilith:pluto',
  'composite-aspect-pair:semisquare:meanNode:moon',
  'composite-aspect-pair:trine:ceres:osculatingLilith',
  'composite-aspect-pair:sesquiquadrate:chiron:uranus',
  'composite-aspect-pair:sesquiquadrate:interpolatedLilith:neptune',
  'composite-aspect-pair:sesquiquadrate:interpolatedLilith:uranus',
  'composite-aspect-pair:biquintile:mercury:pluto',
  'composite-aspect-pair:quincunx:interpolatedLilith:jupiter',
  'composite-aspect-pair:opposition:chiron:neptune',
  'composite-aspect-pair:opposition:meanNode:venus',
  'composite-aspect-pair:opposition:osculatingLilith:trueNode',
  'composite-planet-in-sign:interpolatedLilith:1',
  'composite-aspect-pair:semisquare:trueNode:venus',
  'composite-aspect-pair:sextile:chiron:uranus',
  'composite-aspect-pair:quintile:meanLilith:pluto',
]);

const DISPUTED_NL = new Set([
  'composite-aspect-pair:biquintile:juno:saturn',
  'composite-aspect-pair:semisextile:interpolatedLilith:pluto',
  'composite-aspect-pair:biquintile:ceres:neptune',
]);

async function findMismatches() {
  const corpusEn = JSON.parse(await readFile(join(root, 'src/interpretation/corpus/en.json'), 'utf8'));
  const corpusNl = JSON.parse(await readFile(join(root, 'src/interpretation/corpus/nl.json'), 'utf8'));

  const mapEn = new Map(corpusEn.map((e) => [e.key, e]));
  const mapNl = new Map(corpusNl.map((e) => [e.key, e]));

  const mismatches = [];

  // en clean, nl disputed
  for (const key of DISPUTED_NL) {
    if (!DISPUTED_EN.has(key) && mapEn.has(key)) {
      mismatches.push({ key, sourceLocale: 'en', targetLocale: 'nl', sourceText: mapEn.get(key).text });
    }
  }

  // nl clean, en disputed
  for (const key of DISPUTED_EN) {
    if (!DISPUTED_NL.has(key) && mapNl.has(key)) {
      mismatches.push({ key, sourceLocale: 'nl', targetLocale: 'en', sourceText: mapNl.get(key).text });
    }
  }

  return mismatches;
}

async function translateViaBatch(mismatches, useBatch) {
  if (!useBatch) {
    return await translateViaSync(mismatches);
  }

  console.log(`\nSubmitting ${mismatches.length} translation + validation requests as one batch job...\n`);

  // Build translation batch
  const translationRequests = mismatches.map((m, idx) => {
    const prompt = `Translate this astrological interpretation exactly, preserving tone and meaning. Do NOT add explanations or alter the text. Output only the translated text.

[${m.sourceLocale.toUpperCase()}]
${m.sourceText}

[Translate to ${m.targetLocale.toUpperCase()}]`;

    return buildBatchRequest({
      key: `translate:${idx}`,
      systemInstruction: 'You are a professional translator specializing in astrological texts.',
      userContent: prompt,
      temperature: 0.3,
      responseSchema: { type: 'object', properties: { text: { type: 'string' } } },
    });
  });

  const translationBatch = await submitBatch({
    apiKey,
    model,
    displayName: `cross-translate-composite translations (${mismatches.length} entries)`,
    requests: translationRequests,
  });

  console.log(`Batch submitted: ${translationBatch.name}`);
  console.log(`Polling for completion (this can take a while)...`);

  const completedTranslationBatch = await pollBatch({
    apiKey,
    name: translationBatch.name,
  });

  if (completedTranslationBatch.state !== 'BATCH_STATE_SUCCEEDED') {
    throw new Error(
      `Translation batch failed: ${completedTranslationBatch.state} — ${completedTranslationBatch.error?.message || 'unknown error'}`,
    );
  }

  const translationResults = extractBatchResults(completedTranslationBatch);
  const translatedTexts = new Map();
  let translationFailCount = 0;

  for (const [key, result] of Object.entries(translationResults)) {
    const idx = Number(key.split(':')[1]);
    if (result.error) {
      console.error(`  ✗ Translation failed for ${mismatches[idx].key}: ${result.error.message}`);
      translationFailCount++;
    } else {
      try {
        const parsed = JSON.parse(result.content);
        translatedTexts.set(idx, parsed.text);
      } catch {
        console.error(`  ✗ Failed to parse translation for ${mismatches[idx].key}`);
        translationFailCount++;
      }
    }
  }

  console.log(`Translation batch complete: ${translatedTexts.size} succeeded, ${translationFailCount} failed\n`);

  if (translatedTexts.size === 0) {
    return { results: [] };
  }

  // Now validate all translations in a second batch
  console.log(`Submitting ${translatedTexts.size} validation requests as one batch job...\n`);

  const validationRequests = [];
  const validationIndexToMismatchIdx = new Map();

  let validationIdx = 0;
  for (const [mismatchIdx, translatedText] of translatedTexts) {
    const m = mismatches[mismatchIdx];
    const { systemInstruction, userContent } = buildLanguageQualityPrompt({
      entryText: translatedText,
      locale: m.targetLocale,
    });

    validationRequests.push(
      buildBatchRequest({
        key: `validate:${validationIdx}`,
        systemInstruction,
        userContent,
        temperature: 0,
        responseSchema: toGeminiSchema(LANGUAGE_QUALITY_RESPONSE_SCHEMA),
      }),
    );
    validationIndexToMismatchIdx.set(validationIdx, mismatchIdx);
    validationIdx++;
  }

  const validationBatch = await submitBatch({
    apiKey,
    model,
    displayName: `cross-translate-composite validations (${validationRequests.length} entries)`,
    requests: validationRequests,
  });

  console.log(`Batch submitted: ${validationBatch.name}`);
  console.log(`Polling for completion...`);

  const completedValidationBatch = await pollBatch({
    apiKey,
    name: validationBatch.name,
  });

  if (completedValidationBatch.state !== 'BATCH_STATE_SUCCEEDED') {
    throw new Error(
      `Validation batch failed: ${completedValidationBatch.state} — ${completedValidationBatch.error?.message || 'unknown error'}`,
    );
  }

  const validationResults = extractBatchResults(completedValidationBatch);
  const results = [];
  let validationFailCount = 0;

  for (const [key, result] of Object.entries(validationResults)) {
    const valIdx = Number(key.split(':')[1]);
    const mismatchIdx = validationIndexToMismatchIdx.get(valIdx);
    const m = mismatches[mismatchIdx];
    const translatedText = translatedTexts.get(mismatchIdx);

    if (result.error) {
      console.error(`  ✗ Validation failed for ${m.key}: ${result.error.message}`);
      validationFailCount++;
      continue;
    }

    try {
      const validation = JSON.parse(result.content);
      if (validation.verdict === 'BAD') {
        console.log(`  ✗ Language validation failed for ${m.key}: ${validation.issues?.join(', ') || 'unknown error'}`);
        validationFailCount++;
      } else {
        results.push({
          key: m.key,
          sourceLocale: m.sourceLocale,
          targetLocale: m.targetLocale,
          translatedText: validation.correctedText || translatedText,
          verdict: validation.verdict,
          issues: validation.issues,
        });
        console.log(
          `  ✓ ${m.key}: validation ${validation.verdict}${validation.issues?.length ? ` - fixed: ${validation.issues.join(', ')}` : ''}`,
        );
      }
    } catch {
      console.error(`  ✗ Failed to parse validation for ${m.key}`);
      validationFailCount++;
    }
  }

  console.log(`\nValidation batch complete: ${results.length} passed, ${validationFailCount} failed`);

  return { results };
}

async function translateViaSync(mismatches) {
  const results = [];
  let successCount = 0;
  let validationFailCount = 0;
  let translationFailCount = 0;

  for (const m of mismatches) {
    try {
      console.log(`Translating ${m.key} (${m.sourceLocale} → ${m.targetLocale})...`);

      const translationPrompt = `Translate this astrological interpretation exactly, preserving tone and meaning. Do NOT add explanations or alter the text. Output only the translated text.

[${m.sourceLocale.toUpperCase()}]
${m.sourceText}

[Translate to ${m.targetLocale.toUpperCase()}]`;

      const translatedText = await generateStructured({
        apiKey,
        model,
        systemInstruction: 'You are a professional translator specializing in astrological texts.',
        userContent: translationPrompt,
        temperature: 0.3,
        responseSchema: { type: 'object', properties: { text: { type: 'string' } } },
      });

      console.log(`  Validating language...`);
      const { systemInstruction, userContent } = buildLanguageQualityPrompt({
        entryText: translatedText.text,
        locale: m.targetLocale,
      });

      const validation = await generateStructured({
        apiKey,
        model,
        systemInstruction,
        userContent,
        temperature: 0,
        responseSchema: LANGUAGE_QUALITY_RESPONSE_SCHEMA,
      });

      if (validation.verdict === 'BAD') {
        console.log(`  ✗ Language validation failed: ${validation.issues?.join(', ') || 'unknown error'}`);
        validationFailCount++;
        continue;
      }

      results.push({
        key: m.key,
        sourceLocale: m.sourceLocale,
        targetLocale: m.targetLocale,
        translatedText: validation.correctedText || translatedText.text,
        verdict: validation.verdict,
        issues: validation.issues,
      });

      successCount++;
      console.log(
        `  ✓ Success (validation: ${validation.verdict}${validation.issues?.length ? ` - fixed: ${validation.issues.join(', ')}` : ''})`,
      );
    } catch (e) {
      console.error(`  ✗ Failed:`, e.message);
      translationFailCount++;
    }

    // Delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    `\nTranslation complete: ${successCount} succeeded, ${validationFailCount} validation failures, ${translationFailCount} translation errors`,
  );

  return { results };
}

async function translateAll(useBatch) {
  const mismatches = await findMismatches();
  console.log(`Found ${mismatches.length} mismatches to translate\n`);

  if (mismatches.length === 0) {
    console.log('No mismatches found. Exiting.');
    return;
  }

  const { results } = await translateViaBatch(mismatches, useBatch);

  if (results.length === 0) {
    console.log('\nNo translations passed validation. Exiting without writing changes.');
    return;
  }

  // Load corpus and tracking
  const corpusEn = JSON.parse(await readFile(join(root, 'src/interpretation/corpus/en.json'), 'utf8'));
  const corpusNl = JSON.parse(await readFile(join(root, 'src/interpretation/corpus/nl.json'), 'utf8'));
  const trackingEn = await readTracking(join(root, 'tools/corpus-gen/eval-tracking/en.json'));
  const trackingNl = await readTracking(join(root, 'tools/corpus-gen/eval-tracking/nl.json'));

  // Apply results
  for (const r of results) {
    // Update corpus
    const corpus = r.targetLocale === 'en' ? corpusEn : corpusNl;
    const entry = corpus.find((e) => e.key === r.key);
    if (entry) {
      entry.text = r.translatedText;
    }

    // Reset eval-tracking
    const tracking = r.targetLocale === 'en' ? trackingEn : trackingNl;
    const rec = tracking.find((rec) => rec.key === r.key);
    if (rec) {
      rec.evaluationCount = 0;
      rec.clean = false;
      rec.updatedAt = new Date().toISOString();
    } else {
      tracking.push({
        key: r.key,
        locale: r.targetLocale,
        clean: false,
        evaluationCount: 0,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  // Write back (pretty-print like the original files)
  await writeFile(join(root, 'src/interpretation/corpus/en.json'), JSON.stringify(corpusEn, null, 2) + '\n', 'utf8');
  await writeFile(join(root, 'src/interpretation/corpus/nl.json'), JSON.stringify(corpusNl, null, 2) + '\n', 'utf8');
  await writeFile(
    join(root, 'tools/corpus-gen/eval-tracking/en.json'),
    JSON.stringify(trackingEn, null, 2) + '\n',
    'utf8',
  );
  await writeFile(
    join(root, 'tools/corpus-gen/eval-tracking/nl.json'),
    JSON.stringify(trackingNl, null, 2) + '\n',
    'utf8',
  );

  console.log(`\n✓ Updated ${results.length} entries in corpus and eval-tracking`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review the changes: git diff src/interpretation/corpus/ tools/corpus-gen/eval-tracking/`);
  console.log(
    `  2. Commit: git add -A && git commit -m "fix(#451): cross-translate composite entries, reset eval-tracking"`,
  );
  console.log(`  3. Re-evaluate with judge:`);
  console.log(`     node tools/corpus-gen/evaluate-corpus-batch.mjs --locale=en --limit=2`);
  console.log(`     node tools/corpus-gen/evaluate-corpus-batch.mjs --locale=nl --limit=2`);
}

// Main
const rawArgs = process.argv.slice(2);
const cmd = rawArgs[0];
const useBatch = rawArgs.includes('--batch');

if (cmd === '--translate') {
  await translateAll(useBatch);
} else {
  console.log(`
Usage:
  node tools/corpus-gen/cross-translate-composite.mjs --translate [--batch]

Translates undisputed composite entries from one language to another, validates each
translation for correct language, and resets eval-tracking.

Options:
  --translate              Required. Perform the translation workflow.
  --batch                  Use Gemini Batch API (50% pricing) instead of individual calls.

Cost: ~19 Gemini API calls for translation + 1 per translation for validation (~38 total),
or half of that with --batch.
`);
}
