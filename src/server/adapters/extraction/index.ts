import type { Env } from '@/server/env';
import { extractWithAnthropic } from '@/server/adapters/extraction/anthropic';
import { mockExtraction } from '@/server/adapters/extraction/mock';
import { extractWithOllama } from '@/server/adapters/extraction/ollama';
import type { BillExtractor } from '@/server/adapters/extraction/pipeline';

export function billExtractor(env: Env, sha256: string, nowMs: () => number): BillExtractor {
  if (env.BILL_EXTRACTOR === 'mock') {
    return {
      async extract(input) {
        const bill = await mockExtraction(sha256);
        return {
          bill: {
            ...bill,
            meta: { ...bill.meta, pages: input.pages, textLayer: input.textLayer },
          },
        };
      },
    };
  }
  if (env.BILL_EXTRACTOR === 'ollama') {
    if (!env.OLLAMA_URL || !env.OLLAMA_MODEL) {
      throw new Error('Ollama URL and model are not set');
    }
    const url = env.OLLAMA_URL;
    const model = env.OLLAMA_MODEL;
    return {
      async extract(input) {
        const result = await extractWithOllama({
          url,
          model,
          bytes: input.bytes,
          pages: input.pages,
          textLayer: input.textLayer,
        });
        return { bill: result.bill, model: result.model };
      },
    };
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  const apiKey = env.ANTHROPIC_API_KEY;
  return {
    async extract(input) {
      const result = await extractWithAnthropic({
        apiKey,
        model: input.strong ? env.EXTRACTION_MODEL_STRONG : env.EXTRACTION_MODEL,
        bytes: input.bytes,
        mime: input.mime,
        pages: input.pages,
        textLayer: input.textLayer,
        budget: {
          redisUrl: env.REDIS_URL,
          maxCalls: env.EXTRACTION_MAX_CALLS,
          windowSec: env.EXTRACTION_WINDOW_SEC,
          nowMs: nowMs(),
        },
      });
      return {
        bill: result.bill,
        model: result.model,
        ...(result.inputTokens !== undefined ? { inputTokens: result.inputTokens } : {}),
        ...(result.outputTokens !== undefined ? { outputTokens: result.outputTokens } : {}),
      };
    },
  };
}

export { runPipeline, UnreadableDocumentError } from '@/server/adapters/extraction/pipeline';
export { RetryableExtractionError } from '@/server/adapters/extraction/anthropic';
