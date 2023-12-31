import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ConfigurationParameters } from "openai";
import { OpenAIEmbeddingsParams } from "langchain/embeddings/openai";
import { createMd5 } from "../u";
import { db } from "../const";

class CachedOpenAIEmbeddings extends OpenAIEmbeddings {
  private readonly waitingProcesses: any[];
  private readonly docId: string;

  constructor(
    docId: string,
    fields?: Partial<OpenAIEmbeddingsParams> &
      Partial<any> & {
        verbose?: boolean;
        openAIApiKey?: string;
      },
    configuration?: ConfigurationParameters
  ) {
    super(fields, configuration);
    this.waitingProcesses = [];
    this.docId = docId;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const key = createMd5(texts.join(""));
    const dbVal = await db.get(key);

    this.waitingProcesses.push(db.set(`${key}:updatedAt`, new Date()));
    this.waitingProcesses.push(db.set(`${key}:doc_id`, this.docId));

    if (dbVal !== undefined) {
      return dbVal;
    }

    const result = await super.embedDocuments(texts);

    await db.set(key, result);

    return result;
  }

  async ensureAllDataSaved() {
    await Promise.all(this.waitingProcesses);
  }
}

export default CachedOpenAIEmbeddings;
