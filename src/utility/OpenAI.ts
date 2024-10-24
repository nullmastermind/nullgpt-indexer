import { RateLimiter } from 'limiter';
import OpenAI from 'openai';
import path from 'path';
import { retryDecorator } from 'ts-retry-promise';

import { summaryStorage } from '../constant';
import { SummaryStrategy } from './SummarySplitter';
import { createMd5, env } from './common';

const limiter = new RateLimiter({
  interval: 'second',
  tokensPerInterval: +(process.env.CONTEXTUAL_RATE_LIMIT_PER_SECOND || '10'),
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
        content: `You are a helpful assistant that provides concise contextual summaries. Your task is to analyze document chunks and provide brief, clear context about how each chunk fits into the overall document. Focus on key relationships and positioning within the document structure. Be direct and succinct.

Here is the response boilerplate:

<response_boilerplate>
This chunk...
</response_boilerplate>`,
      },
      {
        role: 'user',
        content: `<document filename="${path.basename(filePath)}">
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
    const key = createMd5([messages, model]);
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
    const summarized = (() => {
      const response = completion.choices?.[0]?.message?.content;
      if (!response) return null;

      const startTag = '<response_boilerplate>';
      const endTag = '</response_boilerplate>';

      const startIndex = response.indexOf(startTag);
      if (startIndex === -1) return response;

      const endIndex = response.indexOf(endTag);
      if (endIndex === -1) return response.slice(startIndex + startTag.length);

      return response.slice(startIndex + startTag.length, endIndex);
    })()?.trim();

    if (summarized) {
      await summaryStorage.set(key, summarized);
      return summarized;
    }

    throw {
      message: 'Failed to generate contextual summary - no valid response from API',
    };
  },
  {
    retries: 10,
    delay: 10000,
    timeout: 'INFINITELY',
  },
);
