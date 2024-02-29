import { CohereEmbeddings, CohereEmbeddingsParams } from 'langchain/embeddings/cohere';

import { storage } from '../constant';
import { createMd5 } from './common';

class CachedCohereEmbeddings extends CohereEmbeddings {
  private readonly waitingProcesses: any[];
  private readonly docId: string;

  constructor(
    docId: string,
    fields?: Partial<CohereEmbeddingsParams> & {
      verbose?: boolean;
      apiKey?: string;
    },
  ) {
    super(fields);
    this.waitingProcesses = [];
    this.docId = docId;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const key = createMd5([...texts, ':COHERE_EMBEDDINGS'].join(''));
    const dbVal = await storage.get(key);

    this.waitingProcesses.push(storage.set(`${key}:updatedAt`, new Date()));
    this.waitingProcesses.push(storage.set(`${key}:doc_id`, this.docId));

    if (dbVal !== undefined) {
      if (![undefined, null].includes(dbVal[0])) {
        return dbVal;
      }
    }

    const result = await super.embedDocuments(texts);

    if (texts.length > 0 && result.length === 0) {
      console.log('API error');
      throw { error: 'API error' };
    }

    await storage.set(key, result);

    return result;
  }

  async ensureAllDataSaved() {
    await Promise.all(this.waitingProcesses);
  }
}

export default CachedCohereEmbeddings;
