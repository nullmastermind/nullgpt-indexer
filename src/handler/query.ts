import { Request, Response } from "express";
import { getVectorStore } from "../u";
import { encode } from "gpt-3-encoder";
import { Document } from "langchain/document";
import { forEach } from "lodash";

const queryHandler = async (req: Request, res: Response) => {
  const {
    doc_id: docId,
    api_key: apiKey,
    query,
    k = 4,
    maxTokens = 3072,
    maxScore = 0.45,
    includeAllIfKLessThanScore = 0.3,
  } = req.body;
  const vectorStore = await getVectorStore(docId, apiKey);
  const results = await vectorStore.similaritySearchWithScore(
    query,
    Math.max(k, 13)
  );
  const data: [Document, number][] = [];
  const totalTokens = { current: 0 };

  forEach(results, (r) => {
    if (r[1] > maxScore) return false;

    const doc = r[0];
    const encoded = encode(doc.pageContent);

    totalTokens.current += encoded.length;

    if (totalTokens.current <= maxTokens) {
      if (r[1] > includeAllIfKLessThanScore) {
        if (data.length >= k) {
          return false;
        }
      }

      data.push(r);
    } else {
      totalTokens.current -= encoded.length;
      return false;
    }
  });

  res.status(200).json({
    data: data,
    tokens: totalTokens.current,
  });
};

export default queryHandler;
