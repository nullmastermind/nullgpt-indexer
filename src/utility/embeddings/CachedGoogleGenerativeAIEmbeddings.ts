import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { GoogleGenerativeAIEmbeddingsParams } from '@langchain/google-genai/dist/embeddings';

import { storage } from '../../constant';
import { createMd5 } from '../common';

class CachedGoogleGenerativeAIEmbeddings extends GoogleGenerativeAIEmbeddings {
  private readonly waitingProcesses: any[];
  private readonly docId: string;

  constructor(docId: string, fields?: GoogleGenerativeAIEmbeddingsParams) {
    super(fields);
    this.waitingProcesses = [];
    this.docId = docId;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const cacheKey = [this.modelName, createMd5(texts.join(''))].join('_');
    const cachedEmbeddings = await storage.get(cacheKey);

    this.waitingProcesses.push(storage.set(`${cacheKey}:updatedAt`, new Date()));
    this.waitingProcesses.push(storage.set(`${cacheKey}:doc_id`, this.docId));

    if (cachedEmbeddings !== undefined) {
      return cachedEmbeddings;
    }

    const embeddings = await super.embedDocuments(texts);

    console.log('embeddings', embeddings, texts);

    if (!(Array.isArray(embeddings) && embeddings.length === 0)) {
      await storage.set(cacheKey, embeddings);
    }

    return embeddings;
  }

  async ensureAllDataSaved() {
    await Promise.all(this.waitingProcesses);
  }
}

export default CachedGoogleGenerativeAIEmbeddings;
