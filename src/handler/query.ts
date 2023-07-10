import { Request, Response } from "express";
import { getVectorStore } from "../u";
import { encode } from "gpt-3-encoder";
import { Document } from "langchain/document";
import { forEach, map } from "lodash";

const DEFAULT_MAX_K = 13;

const queryHandler = async (req: Request, res: Response) => {
  const {
    doc_id: docId,
    api_key: apiKey,
    query,
    k = 4,
    maxTokens = 3072,
    maxScore = 0.55,
    includeAllIfKLessThanScore = 0.3,
    scoreChangeThreshold = 0.03,
    ignoreHashes = [],
  } = req.body;
  const vectorStore = await getVectorStore(docId, docId, apiKey);
  const ignoredHashesSet = new Set<string>(ignoreHashes);
  const results = await vectorStore.similaritySearchWithScore(
    query,
    Math.max(k, DEFAULT_MAX_K) + ignoredHashesSet.size
  );
  const data: [Document, number][] = [];
  const totalTokens = { current: 0 };
  const lastScore = { current: -1 };
  const includedSources = new Set<string>();

  forEach(results, (r) => {
    if (r[1] > maxScore) return false;

    if (lastScore.current === -1) {
      lastScore.current = r[1];
    }

    if (ignoredHashesSet.has(r[0].metadata.hash)) {
      return;
    }

    const doc = r[0];
    const encoded = encode(doc.pageContent);

    totalTokens.current += encoded.length;

    if (totalTokens.current <= maxTokens) {
      const canAddC1 = r[1] <= includeAllIfKLessThanScore;
      const canAddC2 = r[1] - lastScore.current <= scoreChangeThreshold;
      const canAddC3 = includedSources.has(r[0].metadata.source);
      const canAdd = canAddC1 || canAddC2 || canAddC3;

      if (!canAdd) {
        if (data.length >= k) {
          return false;
        }
      }

      includedSources.add(r[0].metadata.source);
      data.push(r);
    } else {
      totalTokens.current -= encoded.length;
      return false;
    }
  });

  data.sort((a, b) => {
    return a[1] - b[1];
  });

  const dataBySource: Record<string, [Document, number][]> = {};

  forEach(data, (item) => {
    const source = item[0].metadata.source;
    if (!dataBySource[source]) {
      dataBySource[source] = [];
    }
    dataBySource[source].push(item);
  });

  forEach(dataBySource, (data, source) => {
    data.sort((a, b) => {
      const from1 = a[0]?.metadata?.loc?.lines?.from || 0;
      const from2 = b[0]?.metadata?.loc?.lines?.from || 0;

      return from1 - from2;
    });
    dataBySource[source] = data;
  });

  res.status(200).json({
    data: map(dataBySource, (value) => value).flat(),
    tokens: totalTokens.current,
  });
};

export default queryHandler;
