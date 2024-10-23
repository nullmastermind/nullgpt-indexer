import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { GoogleGenerativeAIEmbeddingsParams } from '@langchain/google-genai/dist/embeddings';
import { RateLimiter } from 'limiter';
import { retry } from 'ts-retry-promise';

import { storage } from '../../constant';
import { createMd5 } from '../common';

const limiter = new RateLimiter({
  interval: 'minute',
  tokensPerInterval: +(process.env.EMBEDDING_RATE_LIMIT || '1500'),
});

class CachedGoogleGenerativeAIEmbeddings extends GoogleGenerativeAIEmbeddings {
  private readonly docId: string;

  constructor(docId: string, fields?: GoogleGenerativeAIEmbeddingsParams) {
    super(fields);
    this.docId = docId;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const cacheKey = createMd5([texts, this.modelName]);
    const cachedEmbeddings = await storage.get(cacheKey);

    await Promise.all([
      storage.set(`${cacheKey}:updatedAt`, new Date()),
      storage.set(`${cacheKey}:doc_id`, this.docId),
    ]);

    if (cachedEmbeddings !== undefined) {
      return cachedEmbeddings;
    }

    if (!texts.length) {
      throw new Error('Cannot embed empty text array');
    }

    const embeddings = await retry(
      async () => {
        await limiter.removeTokens(1);
        return super.embedDocuments(texts);
      },
      {
        retries: 10,
        delay: 10000,
        timeout: 'INFINITELY',
      },
    );

    if (!(Array.isArray(embeddings) && embeddings.length === 0)) {
      await storage.set(cacheKey, embeddings);
    }

    return embeddings;
  }
}

export default CachedGoogleGenerativeAIEmbeddings;
