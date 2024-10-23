import { RateLimiter } from 'limiter';
import OpenAI from 'openai';
import { retryDecorator } from 'ts-retry-promise';

import { summaryStorage } from '../constant';
import { SummaryStrategy } from './SummarySplitter';
import { createMd5, env } from './common';

const limiter = new RateLimiter({
  interval: 'minute',
  tokensPerInterval: +(process.env.CONTEXTUAL_RATE_LIMIT_PER_MINUTE || '300'),
});

export const openai = new OpenAI({
  apiKey: process.env.CONTEXTUAL_API_KEY || process.env.OPENAI_API_KEY,
  baseURL:
    process.env.CONTEXTUAL_API_BASE || process.env.OPENAI_API_BASE || process.env.OPENAI_BASE_URL,
});

export const addChunkContext = retryDecorator(
  async (
    filePath: string,
    content: string,
    chunk: string,
    strategy: SummaryStrategy,
  ): Promise<string | null> => {
    await limiter.removeTokens(1);

    const messages: any[] = [
      {
        role: 'system',
        content:
          'You are a helpful assistant that provides concise contextual summaries. Your task is to analyze document chunks and provide brief, clear context about how each chunk fits into the overall document. Focus on key relationships and positioning within the document structure. Be direct and succinct.',
      },
      {
        role: 'user',
        content: `File Location: ${filePath}

<document>
${content}
</document>

Here is the chunk we want to situate within the whole document
<chunk>
${chunk}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Include relevant file path context if helpful. Answer only with the succinct context and nothing else.`,
      },
    ];
    const model = env('CONTEXTUAL_MODEL_NAME', 'gpt-4o-mini');
    const key = [createMd5(JSON.stringify(messages)), model].join(':');
    const cached = await summaryStorage.get(key);

    if (cached) {
      return cached;
    }

    console.log(`Processing new chunk for file: ${filePath}`);

    const completion = await openai.chat.completions.create({
      messages,
      model,
      temperature: 0,
    });
    const summarized = completion.choices?.[0]?.message?.content || null;

    if (summarized) {
      await summaryStorage.set(key, summarized);
      return summarized;
    }

    throw {
      message: 'Failed to generate contextual summary - no valid response from API',
    };
  },
  {
    retries: 3,
    delay: 10000,
  },
);
