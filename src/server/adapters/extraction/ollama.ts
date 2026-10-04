import type { ExtractedBill } from '@/contracts/extraction';
import { RetryableExtractionError } from '@/server/adapters/extraction/anthropic';
import { LLM_JSON_SCHEMA, parseLlmBill } from '@/server/adapters/extraction/llmSchema';
import { EXTRACTION_PROMPT, PROMPT_VERSION } from '@/server/adapters/extraction/prompt';

export async function extractWithOllama(input: {
  url: string;
  model: string;
  bytes: Uint8Array;
  pages: number;
  textLayer: boolean;
}): Promise<{ bill: ExtractedBill; model: string }> {
  const response = await fetch(new URL('/api/chat', input.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      format: LLM_JSON_SCHEMA,
      messages: [
        {
          role: 'user',
          content: EXTRACTION_PROMPT,
          images: [Buffer.from(input.bytes).toString('base64')],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const message = `Ollama returned ${response.status}`;
    if (response.status === 429 || response.status >= 500) throw new RetryableExtractionError(message);
    throw new Error(message);
  }
  const body = (await response.json()) as { message?: { content?: string } };
  if (!body.message?.content) throw new Error('Ollama returned no extraction');
  const bill = parseLlmBill(JSON.parse(body.message.content), {
    extractor: 'ollama',
    model: input.model,
    promptVersion: PROMPT_VERSION,
    escalated: false,
    pages: input.pages,
    textLayer: input.textLayer,
    ms: 0,
  });
  return { bill, model: input.model };
}
