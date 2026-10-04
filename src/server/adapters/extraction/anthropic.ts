import type { ExtractedBill } from '@/contracts/extraction';
import { takeExtractionCall, type ExtractionWindow } from '@/server/adapters/extraction/budget';
import { LLM_JSON_SCHEMA, parseLlmBill } from '@/server/adapters/extraction/llmSchema';
import { EXTRACTION_PROMPT, PROMPT_VERSION } from '@/server/adapters/extraction/prompt';

export class RetryableExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableExtractionError';
  }
}

export async function extractWithAnthropic(input: {
  apiKey: string;
  model: string;
  bytes: Uint8Array;
  mime: string;
  pages: number;
  textLayer: boolean;
  budget: ExtractionWindow;
}): Promise<{
  bill: ExtractedBill;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}> {
  const mediaType = input.mime === 'image/jpg' ? 'image/jpeg' : input.mime;
  const data = Buffer.from(input.bytes).toString('base64');
  const block =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  await takeExtractionCall(input.budget);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: [block, { type: 'text', text: EXTRACTION_PROMPT }] }],
      output_config: { format: { type: 'json_schema', schema: LLM_JSON_SCHEMA } },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json()) as {
    error?: { message?: string; type?: string };
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!response.ok) {
    const message = body.error?.message ?? `Anthropic returned ${response.status}`;
    if (response.status === 429 || response.status >= 500 || /overloaded/i.test(message)) {
      throw new RetryableExtractionError(message);
    }
    throw new Error(message);
  }
  const text = body.content?.find((part) => part.type === 'text')?.text;
  if (!text) throw new Error('Anthropic returned no extraction');
  const bill = parseLlmBill(JSON.parse(text), {
    extractor: 'anthropic',
    model: input.model,
    promptVersion: PROMPT_VERSION,
    escalated: false,
    pages: input.pages,
    textLayer: input.textLayer,
    ms: 0,
    ...(body.usage?.input_tokens !== undefined ? { inputTokens: body.usage.input_tokens } : {}),
    ...(body.usage?.output_tokens !== undefined ? { outputTokens: body.usage.output_tokens } : {}),
  });
  return {
    bill,
    model: input.model,
    ...(body.usage?.input_tokens !== undefined ? { inputTokens: body.usage.input_tokens } : {}),
    ...(body.usage?.output_tokens !== undefined ? { outputTokens: body.usage.output_tokens } : {}),
  };
}
