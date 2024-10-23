import { OpenAIEmbeddings, OpenAIEmbeddingsParams } from '@langchain/openai';
import { AzureOpenAIInput } from '@langchain/openai/dist/types';

import { storage } from '../../constant';
import { createMd5 } from '../common';

class CachedEmbeddings extends OpenAIEmbeddings {
  private readonly waitingProcesses: any[];
  private readonly docId: string;

  constructor(
    docId: string,
    fields?: Partial<OpenAIEmbeddingsParams> &
      Partial<AzureOpenAIInput> & {
        verbose?: boolean;
        openAIApiKey?: string;
      },
    configuration?: any,
  ) {
    super(fields, configuration);
    this.waitingProcesses = [];
    this.docId = docId;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const key = [this.modelName, createMd5(texts.join(''))].join('_');
    const dbVal = await storage.get(key);

    this.waitingProcesses.push(storage.set(`${key}:updatedAt`, new Date()));
    this.waitingProcesses.push(storage.set(`${key}:doc_id`, this.docId));

    if (dbVal !== undefined) {
      return dbVal;
    }

    const result = await super.embedDocuments(texts);

    await storage.set(key, result);

    return result;
  }

  async ensureAllDataSaved() {
    await Promise.all(this.waitingProcesses);
  }
}

export default CachedEmbeddings;
