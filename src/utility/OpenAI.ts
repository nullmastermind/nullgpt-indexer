import { RateLimiter } from 'limiter';
import path from 'node:path';
import OpenAI from 'openai';
import { retryDecorator } from 'ts-retry-promise';

import { summaryStorage } from '../constant';
import { SummaryStrategy } from './SummarySplitter';
import { countTokens, createMd5, env } from './common';
import pLimit from './limit';

const RATE_LIMIT = +env('CONTEXTUAL_RATE_LIMIT_PER_SECOND', '10');

const rateLimiter = new RateLimiter({
  interval: 'second',
  tokensPerInterval: RATE_LIMIT,
});

const concurrencyLimiter = pLimit(RATE_LIMIT);

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
    documentId: string,
  ): Promise<string | null> => {
    await rateLimiter.removeTokens(1);
    return concurrencyLimiter(async () => {
      const contextualMaxTokens = +env('CONTEXTUAL_MAX_TOKENS', '16000');
      const contentTokens = countTokens(content);

      // if (contentTokens > contextualMaxTokens) {
      //   const chunkIndex = content.indexOf(chunk);
      //   if (chunkIndex === -1) return chunk;
      //   const contextWindowSize = chunk.length;
      //   const contextStartIndex = Math.max(0, chunkIndex - contextWindowSize);
      //   const contextEndIndex = Math.min(
      //     content.length,
      //     chunkIndex + chunk.length + contextWindowSize,
      //   );
      //
      //   content = content.slice(contextStartIndex, contextEndIndex);
      //
      //   // console.log('content', content.length, content.indexOf(chunk));
      // }

      if (contentTokens > contextualMaxTokens) {
        const chunkIndex = content.indexOf(chunk);

        // console.log('chunkIndex:', chunkIndex);

        // Calculate initial sections (10% - 80% - 10%)
        const startSectionEndIndex = Math.min(Math.floor(content.length * 0.1), chunk.length);
        const startSection = content.slice(0, startSectionEndIndex);
        const endSectionStartIndex = Math.max(
          Math.floor(content.length * 0.9),
          content.length - chunk.length,
        );
        const endSection = content.slice(endSectionStartIndex);
        const estimatedOffset = Math.floor(
          chunk.length * (contextualMaxTokens / countTokens(chunk) / 2 - 2),
        );
        // const estimatedOffset = Math.floor(chunk.length * 3);

        // Calculate the middle section around the chunk
        const middleStartIndex = Math.max(chunkIndex - estimatedOffset, startSectionEndIndex);
        const middleEndIndex = Math.min(
          chunkIndex + chunk.length + estimatedOffset,
          endSectionStartIndex,
        );
        let middleSection = content.slice(middleStartIndex, middleEndIndex);

        // Combine sections
        content = startSection + '\n\n...\n\n' + middleSection + '\n\n...\n\n' + endSection;

        // console.log('chunkIndex:', chunkIndex, 'Done', countTokens(content));
      }

      const messages: any[] = [
        {
          role: 'system',
          content: `You are a helpful assistant that provides concise contextual summaries optimized for semantic search and BM25 retrieval. Your task is to analyze document chunks and provide clear context that enhances search relevance. Focus on key terms, technical concepts, and document structure that would improve matching in both semantic and keyword-based searches (BM25). Be direct and use terminology that aligns with likely search queries.

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
        // console.log(`Processing new chunk for file (from cached): ${filePath}`);
        return cached;
      }

      console.log(`Processing new chunk for file: ${filePath}`);

      const completion = await openai.chat.completions
        .create({
          messages,
          model,
          temperature: 0,
        })
        .catch((e) => {
          console.error(e);
          return Promise.reject(e);
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
        // console.log('summarized:', summarized);

        await summaryStorage.set(key, summarized);
        return summarized;
      }

      console.error('Failed to generate contextual summary - no valid response from API');

      throw {
        message: 'Failed to generate contextual summary - no valid response from API',
      };
    });
  },
  {
    retries: 10,
    delay: 10000,
    timeout: 'INFINITELY',
  },
);
