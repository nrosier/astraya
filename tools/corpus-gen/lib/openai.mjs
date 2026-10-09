/**
 * Minimal synchronous OpenAI structured-output client — openai-batch.mjs's sibling, the same
 * relationship gemini.mjs has to gemini-batch.mjs. Reuses `buildBatchRequest`'s request-body
 * shape (model, messages, response_format) so a sync call and a Batch API submission can never
 * drift apart on the wire format, and only swaps the transport: `POST /v1/chat/completions`
 * directly instead of uploading a JSONL file and polling a batch job. Exists for scripts that
 * need an OpenAI judge/reviewer call *now*, not after the Batch API's up-to-24h turnaround —
 * `sample-degree-symbol.mjs`'s own #381 feedback-loop demonstration is the first caller.
 */
/**
 * @module openai
 * @purpose Minimal synchronous OpenAI structured-output client, for callers that need a result
 *   immediately rather than through the Batch API's asynchronous submit/poll/retrieve cycle.
 * @conventions Reuses openai-batch.mjs's buildBatchRequest for the request body shape, so the two
 *   transports can't disagree on wire format. Retries on 5xx, surfaces 4xx immediately. Costs
 *   real API money per call, at standard (not batch-discounted) rates.
 * @exports DEFAULT_BASE_URL, generateStructured.
 */
import { buildBatchRequest } from './openai-batch.mjs';

export const DEFAULT_BASE_URL = 'https://api.openai.com';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One structured-output request. Returns the parsed JSON object the model produced. `onUsage`
 * receives OpenAI's own `usage` shape (`prompt_tokens`/`completion_tokens`), not Gemini's field
 * names — callers that estimate cost across both providers already branch on provider for this.
 */
export async function generateStructured({
  apiKey,
  model,
  baseUrl,
  temperature,
  systemInstruction,
  userContent,
  responseSchema,
  schemaName,
  maxRetries = 3,
  onUsage,
}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set — check .env.local');
  if (!model) throw new Error('model is required (e.g. gpt-6-luna)');

  const { body } = buildBatchRequest({
    customId: 'sync',
    model,
    systemInstruction,
    userContent,
    temperature,
    responseSchema,
    schemaName,
  });
  const url = `${baseUrl || DEFAULT_BASE_URL}/v1/chat/completions`;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
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
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error(`unexpected response shape: ${JSON.stringify(payload).slice(0, 500)}`);
      }
      onUsage?.(payload.usage);
      return JSON.parse(content);
    }

    const errorBody = await response.text();
    lastError = new Error(`OpenAI API ${String(response.status)}: ${errorBody.slice(0, 1000)}`);
    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxRetries) throw lastError;
    await sleep(2 ** attempt * 1000);
  }
  throw lastError;
}
