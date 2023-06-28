import { Request, Response } from "express";
import { getVectorStore } from "../u";
import { encode } from "gpt-3-encoder";
import { Document } from "langchain/document";
import { forEach } from "lodash";

const DEFAULT_MAX_K = 13;

const queryHandler = async (req: Request, res: Response) => {
  const {
    doc_id: docId,
    api_key: apiKey,
    query,
    k = 4,
    maxTokens = 3072,
    maxScore = 0.45,
    includeAllIfKLessThanScore = 0.3,
    scoreChangeThreshold = 0.02,
  } = req.body;
  const vectorStore = await getVectorStore(docId, apiKey);
  const results = await vectorStore.similaritySearchWithScore(
    query,
    Math.max(k, DEFAULT_MAX_K)
  );
  const data: [Document, number][] = [];
  const totalTokens = { current: 0 };
  const lastScore = { current: -1 };

  forEach(results, (r) => {
    if (r[1] > maxScore) return false;

    if (lastScore.current === -1) {
      lastScore.current = r[1];
    }

    const doc = r[0];
    const encoded = encode(doc.pageContent);

    totalTokens.current += encoded.length;

    if (totalTokens.current <= maxTokens) {
      const canAddC1 = r[1] <= includeAllIfKLessThanScore;
      const canAddC2 = r[1] - lastScore.current <= scoreChangeThreshold;
      const canAdd = canAddC1 || canAddC2;

      if (!canAdd) {
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
