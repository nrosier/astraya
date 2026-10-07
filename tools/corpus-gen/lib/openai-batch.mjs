/**
 * OpenAI Batch API client: this project's second batch-provider client, after
 * gemini-batch.mjs — not merged into it, since the wire shapes have nothing in
 * common beyond both being "submit many, poll, retrieve many." Billed at 50%
 * of OpenAI's standard per-token rates, same discount shape as Gemini's.
 *
 * Unlike Gemini's inline-requests batch mode (gemini-batch.mjs), OpenAI's
 * Batch API has no inline path at all — every batch is a JSONL file: upload
 * it via the Files API (`purpose: "batch"`), then create a batch job that
 * references the returned file id. Results come back the same way: a second
 * JSONL file, downloaded once the job finishes, with one line per request
 * keyed by that request's own `custom_id` — "the output line order may not
 * match the input line order" per OpenAI's own docs, so this never assumes
 * it does.
 *
 * Structured outputs use plain JSON Schema (`response_format.json_schema`),
 * not Gemini's own upper-cased `Schema` dialect — no case-transform helper
 * needed here the way gemini.mjs's `toGeminiSchema` is for Gemini.
 */
/**
 * @module openai-batch
 * @purpose OpenAI Batch API client (file-upload based submit/poll/retrieve) for asynchronous,
 *   discounted-rate structured-output judging, used by evaluate-corpus-batch.mjs.
 * @conventions JSONL file upload/download only (OpenAI's Batch API has no inline path) — up to
 *   200MB/50,000 requests per OpenAI's own limits. Billed at 50% of OpenAI's standard rates;
 *   costs real API money. Includes stall detection (detectStalledBatch) for an in_progress batch
 *   showing no progress. Results are keyed by each request's own `custom_id`, never by line order.
 * @exports buildBatchRequest, submitBatch, getBatch, detectStalledBatch, isBatchTerminal,
 *   pollBatch, extractBatchResults, parseResultLines, downloadFile.
 */
const DEFAULT_BASE_URL = 'https://api.openai.com';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'expired', 'cancelled']);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, maxRetries) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (networkError) {
      lastError = networkError;
      if (attempt === maxRetries) throw networkError;
      await sleep(2 ** attempt * 1000);
      continue;
    }
    if (response.ok) return response;
    const errorBody = await response.text();
    lastError = new Error(`OpenAI batch API ${String(response.status)}: ${errorBody.slice(0, 1000)}`);
    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) throw lastError;
    await sleep(2 ** attempt * 1000);
  }
  throw lastError;
}

/** Builds one JSONL line of the batch input file — `customId` is this placement's own corpus key. */
export function buildBatchRequest({
  customId,
  model,
  systemInstruction,
  userContent,
  temperature,
  responseSchema,
  schemaName,
}) {
  return {
    custom_id: customId,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model,
      // Omitted entirely when undefined, not sent as 0 — confirmed against a real batch job
      // (#381): gpt-6-luna (this script's own default model) rejects any explicit temperature
      // other than its own default (1) with a 400, "Only the default (1) value is supported."
      // Newer/reasoning-tier models commonly drop temperature control; older ones (gpt-4o-mini,
      // for instance) still take it, so this stays a caller-supplied option, just never
      // defaulted to a value that silently breaks the models that don't accept it.
      ...(temperature === undefined ? {} : { temperature }),
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName ?? 'response', strict: true, schema: responseSchema },
      },
    },
  };
}

/**
 * Uploads `requests` as one JSONL file and creates a batch job against it. No inline-request
 * size cap to enforce here the way gemini-batch.mjs has — OpenAI's file-upload path (the only
 * path it has) is already good for up to 200MB / 50,000 requests per their own documented limits,
 * comfortably more than any locale scope this project runs.
 */
export async function submitBatch({ apiKey, baseUrl, requests, maxRetries = 3 }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set — check .env.local');

  const jsonl = requests.map((request) => JSON.stringify(request)).join('\n');
  const form = new FormData();
  form.append('purpose', 'batch');
  form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'batch.jsonl');

  const uploadResponse = await fetchWithRetry(
    `${baseUrl || DEFAULT_BASE_URL}/v1/files`,
    { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form },
    maxRetries,
  );
  const uploaded = await uploadResponse.json();

  const createResponse = await fetchWithRetry(
    `${baseUrl || DEFAULT_BASE_URL}/v1/batches`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input_file_id: uploaded.id, endpoint: '/v1/chat/completions', completion_window: '24h' }),
    },
    maxRetries,
  );
  return createResponse.json();
}

/** Fetches a batch job's current state with a single request — no loop, no blocking wait. */
export async function getBatch({ apiKey, baseUrl, batchId, maxRetries = 3 }) {
  const url = `${baseUrl || DEFAULT_BASE_URL}/v1/batches/${batchId}`;
  const response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${apiKey}` } }, maxRetries);
  return response.json();
}

/**
 * Detects when a batch has stalled by tracking when counts last *changed*.
 * A batch is considered stalled if:
 * 1. The batch is still in_progress
 * 2. The completed + failed count hasn't changed since the last check
 * 3. The time since that count last changed is >= stallThresholdMinutes
 *
 * Tracking is stored in the job object: `lastSeenCounts` { completed, failed, changedAt }.
 * `changedAt` is updated ONLY when the counts differ from the previous observation.
 * On each call, this function returns { isStalled, shouldAbandon, reason }.
 */
export function detectStalledBatch(batch, jobTracking, stallThresholdMinutes = 30) {
  if (batch.status !== 'in_progress' || !batch.request_counts) {
    return { isStalled: false, shouldAbandon: false, reason: null };
  }

  const { completed, failed } = batch.request_counts;
  const currentCount = completed + failed;
  const now = new Date();

  // First check: initialize tracking with the current timestamp as "when it changed"
  if (!jobTracking.lastSeenCounts) {
    return {
      isStalled: false,
      shouldAbandon: false,
      reason: null,
      nextTracking: { completed, failed, changedAt: now.toISOString() },
    };
  }

  const lastCount = jobTracking.lastSeenCounts.completed + jobTracking.lastSeenCounts.failed;
  const lastChanged = new Date(jobTracking.lastSeenCounts.changedAt);
  const stallDurationMinutes = (now - lastChanged) / (1000 * 60);

  // Counts have changed — update changedAt to now
  if (currentCount !== lastCount) {
    return {
      isStalled: false,
      shouldAbandon: false,
      reason: null,
      nextTracking: { completed, failed, changedAt: now.toISOString() },
    };
  }

  // No change in counts — check if stalled
  if (stallDurationMinutes >= stallThresholdMinutes) {
    return {
      isStalled: true,
      shouldAbandon: true,
      reason: `stalled for ${Math.round(stallDurationMinutes)}min (${currentCount} requests stuck, no progress since ${lastChanged.toISOString()})`,
      nextTracking: { completed, failed, changedAt: lastChanged.toISOString() },
    };
  }

  // No change yet, but still within threshold
  return {
    isStalled: true,
    shouldAbandon: false,
    reason: `stalling: no progress for ${Math.round(stallDurationMinutes)}min (${currentCount}/${batch.request_counts.total} done, ${stallThresholdMinutes - Math.round(stallDurationMinutes)}min until abandon)`,
    nextTracking: { completed, failed, changedAt: lastChanged.toISOString() },
  };
}

/** Whether a batch has reached a terminal status (not necessarily success — see TERMINAL_STATUSES). */
export function isBatchTerminal(batch) {
  return TERMINAL_STATUSES.has(batch.status);
}

/** Polls a batch job until it reaches a terminal status. `onPoll(status)` fires after every poll. */
export async function pollBatch({ apiKey, baseUrl, batchId, intervalMs = 15000, onPoll, maxRetries = 3 }) {
  for (;;) {
    const batch = await getBatch({ apiKey, baseUrl, batchId, maxRetries });
    onPoll?.(batch.status, batch.request_counts);
    if (isBatchTerminal(batch)) return batch;
    await sleep(intervalMs);
  }
}

/** Parses one JSONL results file's lines (output or error — both use the same per-line shape, confirmed against a real failed batch: a per-request error surfaces as `response.status_code` != 200 with the API's own error body, not as the line's own top-level `error` field, which OpenAI reserves for a request that couldn't even be attempted). */
export function parseResultLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parsed = JSON.parse(line);
      const customId = parsed.custom_id;
      if (parsed.error) return { customId, error: new Error(parsed.error.message ?? JSON.stringify(parsed.error)) };
      if (parsed.response?.status_code !== 200) {
        return {
          customId,
          error: new Error(
            `HTTP ${String(parsed.response?.status_code)}: ${JSON.stringify(parsed.response?.body).slice(0, 500)}`,
          ),
        };
      }
      const content = parsed.response.body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') return { customId, error: new Error('unexpected response shape') };
      try {
        return { customId, result: JSON.parse(content), usage: parsed.response.body?.usage };
      } catch (parseError) {
        return { customId, error: parseError };
      }
    });
}

/**
 * Downloads one uploaded/generated batch file's raw content by id — the input file (the JSONL
 * this script itself uploaded, `{custom_id, method, url, body}` per line) as well as the
 * output/error files extractBatchResults already reads. Exported so a caller that lost track of
 * a job's own candidate list (e.g. evaluate-corpus-batch.mjs's `--batch=<id>` fallback, for an id
 * never recorded locally) can re-derive it straight from the input file it uploaded, instead of
 * needing that bookkeeping to have survived on disk.
 */
export async function downloadFile({ apiKey, baseUrl, fileId }) {
  const response = await fetchWithRetry(
    `${baseUrl || DEFAULT_BASE_URL}/v1/files/${fileId}/content`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
    3,
  );
  return response.text();
}

/**
 * Normalizes a batch job's results into one `{ customId, result, usage }` or `{ customId, error }`
 * per request, keyed by each request's own `custom_id` — the API's own docs say output line order
 * is not guaranteed to match input order. Reads both `output_file_id` (succeeded requests) and
 * `error_file_id` (failed ones — e.g. every request rejected with the same 400, the exact real
 * case that motivated reading this file at all rather than silently returning nothing for an
 * all-failed batch) when either is present.
 *
 * Deliberately not restricted to `status === 'completed'`: a `cancelled`/`failed`/`expired` batch
 * can still carry a real `output_file_id` for whatever requests finished before it stopped —
 * confirmed against a real cancelled batch (#381) with 749/750 requests completed and a populated
 * output file. Whether there's anything to read is judged by file presence, not status, so those
 * partial results aren't thrown away. Only truly empty (no output file and no error file at all —
 * e.g. cancelled before a single request ran) throws, with a message built from `batch.errors`.
 */
export async function extractBatchResults({ apiKey, baseUrl, batch }) {
  const hasFiles =
    (batch.output_file_id !== null && batch.output_file_id !== undefined) ||
    (batch.error_file_id !== null && batch.error_file_id !== undefined);
  if (!hasFiles) {
    // Parse batch errors to provide a user-friendly message
    const batchErrors = batch.errors?.data || [];
    let errorMsg = `Batch job status: ${String(batch.status)}`;
    if (batchErrors.length > 0) {
      const codes = batchErrors.map((e) => e.code).filter(Boolean);
      const messages = batchErrors.map((e) => e.message).filter(Boolean);
      if (codes.includes('token_limit_exceeded')) {
        errorMsg +=
          '\n\n⏳ Token limit reached for this organization. Please try again in a few minutes once other batches complete.';
      } else if (messages.length > 0) {
        errorMsg += `\n\n${messages.join('\n')}`;
      }
    }
    const error = new Error(errorMsg);
    error.name = 'BatchJobFailed';
    throw error;
  }
  const results = [];
  if (batch.output_file_id !== null && batch.output_file_id !== undefined) {
    results.push(...parseResultLines(await downloadFile({ apiKey, baseUrl, fileId: batch.output_file_id })));
  }
  if (batch.error_file_id !== null && batch.error_file_id !== undefined) {
    results.push(...parseResultLines(await downloadFile({ apiKey, baseUrl, fileId: batch.error_file_id })));
  }
  return results;
}
