/**
 * Recover results from a completed OpenAI batch and write to feedback file.
 * OpenAI stores completed batch results permanently — we can retrieve them
 * at any time without resubmitting.
 *
 *   npx tsx --env-file=.env.local tools/corpus-gen/recover-batch.mjs \
 *     --batch-id=batch_6ac51c25a8cc8190a28b69f60b4e1a00 \
 *     --locale=en
 */
/**
 * @module recover-batch
 * @purpose Recovers results from an already-completed OpenAI batch job and writes flagged entries
 *   to the feedback file, without resubmitting — OpenAI stores completed batch results permanently.
 * @conventions CLI flags: --batch-id=<id> (required), --locale=<locale> (required), --dump-first.
 *   Reads OPENAI_API_KEY from .env.local; retrieving an already-completed batch's results is free.
 *   Writes to tools/corpus-gen/feedback/<locale>.json.
 * @exports CLI entry point, no exports.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const rawArgs = process.argv.slice(2);
function flag(name, fallback) {
  const found = rawArgs.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
  console.log('Usage: npx tsx --env-file=.env.local tools/corpus-gen/recover-batch.mjs --batch-id=<id> --locale=en');
  process.exit(0);
}

const batchId = flag('batch-id');
const locale = flag('locale');
const dumpFirst = rawArgs.includes('--dump-first');

if (!batchId) throw new Error('--batch-id=<id> is required');
if (!locale) throw new Error('--locale=<locale> is required');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY not set in .env.local');

const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

console.log(`[${locale}] Retrieving batch ${batchId}...`);

// Get batch status
const batchResponse = await fetch(`${baseUrl}/batches/${batchId}`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!batchResponse.ok) {
  console.error(`[${locale}] Failed to retrieve batch: ${batchResponse.status} ${batchResponse.statusText}`);
  const text = await batchResponse.text();
  console.error(text);
  process.exit(1);
}

const batch = await batchResponse.json();
console.log(`[${locale}] Batch status: ${batch.status}`);

if (batch.status !== 'completed' && batch.status !== 'failed') {
  console.log(`[${locale}] Batch is in progress (status: ${batch.status}). Try again later.`);
  process.exit(0);
}

if (batch.status === 'failed') {
  console.error(`[${locale}] Batch failed on OpenAI's side. Cannot recover results.`);
  process.exit(1);
}

// Batch is completed — retrieve results
console.log(`[${locale}] Retrieving results from ${batch.output_file_id}...`);

const fileResponse = await fetch(`${baseUrl}/files/${batch.output_file_id}/content`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
if (!fileResponse.ok) {
  console.error(`[${locale}] Failed to retrieve results: ${fileResponse.status} ${fileResponse.statusText}`);
  process.exit(1);
}

// Parse JSONL results
const text = await fileResponse.text();
const lines = text.trim().split('\n');

console.log(`[${locale}] Total lines in output: ${lines.length}`);

if (dumpFirst) {
  console.log(`[${locale}] First 3 lines (raw):`);
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    console.log(`Line ${i}:`, lines[i].slice(0, 300));
  }
  console.log(`[${locale}] Last 3 lines (raw):`);
  for (let i = Math.max(0, lines.length - 3); i < lines.length; i++) {
    console.log(`Line ${i}:`, lines[i].slice(0, 300));
  }
}

const flagged = [];
let processedCount = 0;
let successCount = 0;
let errorCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;

  try {
    const parsed = JSON.parse(line);

    // OpenAI batch results format:
    // { "id": "batch_req_...", "custom_id": "...", "response": { "status_code": 200, "body": { "choices": [...] } }, "error": null }

    const customId = parsed.custom_id;
    const response = parsed.response;

    if (!response || response.status_code !== 200) {
      if (dumpFirst && i < 3) {
        const status = response?.status_code ?? 'no status';
        const error = parsed.error?.message ?? 'no error message';
        console.log(`[${locale}] Line ${i} failed: status=${status}, error=${error}`);
      }
      errorCount++;
      continue;
    }

    // response.body is the chat completion
    const body = response.body;
    if (!body || !body.choices || body.choices.length === 0) {
      errorCount++;
      continue;
    }

    const choice = body.choices[0];
    const messageContent = choice.message?.content;

    if (!messageContent) {
      errorCount++;
      continue;
    }

    // The content is the judge's response, which should be JSON-encoded
    try {
      const parsed_body = typeof messageContent === 'string' ? JSON.parse(messageContent) : messageContent;
      if (parsed_body.verdict === 'FLAGGED') {
        flagged.push({
          key: customId,
          verdict: 'FLAGGED',
          issues: parsed_body.issues || [],
        });
        console.log(`[${locale}] FLAGGED ${customId}: ${(parsed_body.issues || []).join(' / ')}`);
      }
      successCount++;
      processedCount++;
    } catch (parseErr) {
      if (dumpFirst && i < 3) {
        console.warn(`[${locale}] Failed to parse judge verdict at line ${i}: ${String(parseErr)}`);
      }
      errorCount++;
    }
  } catch (e) {
    errorCount++;
    if (dumpFirst && i < 3) {
      console.warn(`[${locale}] Failed to parse JSON at line ${i}: ${String(e)}`);
    }
  }
}

console.log(`[${locale}] Processed: ${processedCount} successful, ${successCount} with content, ${errorCount} errors`);
console.log(`[${locale}] Found ${flagged.length} flagged entries`);

if (flagged.length === 0) {
  console.log(`[${locale}] No flagged entries to write.`);
  process.exit(0);
}

// Write flagged entries to feedback file
const feedbackPath = join(root, 'tools', 'corpus-gen', 'feedback', `${locale}.json`);

let existingFeedback = [];
try {
  const existing = await readFile(feedbackPath, 'utf8');
  existingFeedback = JSON.parse(existing);
} catch {
  // File doesn't exist or is invalid, start fresh
}

// Merge: avoid duplicates, keep the recovered ones
const keys = new Set(existingFeedback.map((e) => e.key));
const newEntries = flagged.filter((e) => !keys.has(e.key));

const merged = [...existingFeedback, ...newEntries];
await writeFile(feedbackPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

console.log(`[${locale}] Wrote ${newEntries.length} new flagged entries to ${feedbackPath}`);
console.log(`[${locale}] Feedback file now contains ${merged.length} flagged entries total`);
