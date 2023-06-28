import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ConfigurationParameters } from "openai";
import { OpenAIEmbeddingsParams } from "langchain/embeddings/openai";
import { createMd5 } from "../u";
import { db } from "../const";

class CachedOpenAIEmbeddings extends OpenAIEmbeddings {
  constructor(
    fields?: Partial<OpenAIEmbeddingsParams> &
      Partial<any> & {
        verbose?: boolean;
        openAIApiKey?: string;
      },
    configuration?: ConfigurationParameters
  ) {
    super(fields, configuration);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const key = createMd5(texts.join(""));
    const dbVal = await db.get(key);

    if (dbVal !== undefined) {
      return dbVal;
    }

    const result = await super.embedDocuments(texts);

    await db.set(key, result);

    return result;
  }
}

export default CachedOpenAIEmbeddings;
