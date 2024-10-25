import { TokenTextSplitter } from '@langchain/textsplitters';

import { countTokens, env } from './common';

export type SummaryStrategy = 'document' | 'code' | string;

class SummarySplitter {
  summaryStrategy: SummaryStrategy;
  filePath: string;
  splitter: TokenTextSplitter;

  constructor(summaryStrategy: SummaryStrategy, filePath: string) {
    this.summaryStrategy = summaryStrategy;
    this.filePath = filePath;
  }

  async createDocuments(
    texts: string[],
    metadatas?: Record<string, any>[],
    chunkHeaderOptions?: any,
  ) {
    if (!this.splitter) return [];
    return this.splitter?.createDocuments(texts, metadatas, chunkHeaderOptions);
  }

  async splitText(text: string): Promise<string[]> {
    // Get total tokens in text
    const textTokens = countTokens(text);

    if (textTokens === 0) return [];

    // Constants for token size constraints
    const MIN_TOKENS = +env('CHUNK_MIN_TOKENS', '150');
    const MAX_TOKENS = +env('CHUNK_MAX_TOKENS', '800');
    const OPTIMAL_CHUNKS = +env('CHUNK_OPTIMAL_COUNT', '20');
    const MIN_CHUNK_RATIO = +env('CHUNK_MIN_RATIO', '0.05'); // Minimum chunk size as % of total tokens
    const MAX_CHUNK_RATIO = +env('CHUNK_MAX_RATIO', '0.2'); // Maximum chunk size as % of total tokens

    // Calculate optimal chunk size based on text length
    const tokensPerChunk = Math.ceil(textTokens / OPTIMAL_CHUNKS);
    const ratioBasedTokens = Math.min(
      Math.max(textTokens * MIN_CHUNK_RATIO, MIN_TOKENS),
      textTokens * MAX_CHUNK_RATIO,
    );

    // Use the most appropriate chunk size
    const recommendedTokens = Math.min(
      Math.max(tokensPerChunk, ratioBasedTokens, MIN_TOKENS),
      MAX_TOKENS,
    );

    // Calculate overlap - larger for bigger chunks to maintain context
    const overlapRatio = recommendedTokens > 400 ? 0.3 : 0.2;
    const overlap = Math.ceil(recommendedTokens * overlapRatio);

    console.log(
      `Splitting text into chunks: ${textTokens} total tokens, ${overlap} token overlap, ${recommendedTokens} tokens per chunk`,
    );

    this.splitter = new TokenTextSplitter({
      encodingName: 'cl100k_base',
      chunkOverlap: overlap,
      chunkSize: recommendedTokens,
    });

    return this.splitter.splitText(text);

    // const chunks = await this.splitter.splitText(text);
    //
    // return Promise.all(
    //   chunks.map(async (chunk) => {
    //     const context = await addChunkContext(this.filePath, text, chunk, this.summaryStrategy);
    //
    //     // console.log('---------');
    //     // console.log('context:', context);
    //     // console.log('chunk:', chunk);
    //     // console.log('---------');
    //
    //     // if (this.summaryStrategy === 'code') {
    //     //   return `### Context\n${context}\n\n### Chunk content\n\`\`\`\n${chunk}\n\`\`\``;
    //     // }
    //
    //     return `${context}\n---\n${chunk}`;
    //   }),
    // );
  }
}

export default SummarySplitter;
