import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { Request, Response } from 'express';
import { encode } from 'gpt-3-encoder';
import { Document } from 'langchain/document';
import { cloneDeep, forEach, map } from 'lodash';

import { getVectorStore } from '../utility/common';

const queryByVectorStore = async (req: Request, vectorStore: FaissStore) => {
  const { query, ignoreHashes = [] } = req.body;
  const ignoredHashesSet = new Set<string>(ignoreHashes);
  const results = await vectorStore.similaritySearchWithScore(query, 100);
  const data: [Document, number][] = [];
  const totalTokens = { current: 0 };

  // Normalize similarity scores to 0-1 range
  const scores = results.map((r) => r[1]);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (ignoredHashesSet.has(result[0].metadata.hash)) {
      continue;
    }

    const document = result[0];

    // Normalize the similarity score (lower is better)
    const normalizedScore = scoreRange ? (result[1] - minScore) / scoreRange : 0;

    // Calculate content length score (prefer shorter content)
    const contentLength = document.pageContent.length;
    const lengthScore = Math.min(contentLength / 1000, 1); // Normalize to 0-1

    // Calculate token density score
    const encodedContent = encode(result[0].pageContent);
    const tokenDensity = encodedContent.length / contentLength;
    const densityScore = Math.min(tokenDensity * 2, 1); // Normalize to 0-1

    // Combine scores with weights
    result[1] =
      normalizedScore * 0.6 + // Similarity importance
      lengthScore * 0.3 + // Length importance
      densityScore * 0.1; // Token density importance;

    // console.log('normalizedScore', normalizedScore, finalScore);

    totalTokens.current += encodedContent.length;

    if (data.length < 20) {
      data.push(result);
    } else {
      break;
    }
  }

  // Sort by final score (lower is better)
  data.sort((a, b) => a[1] - b[1]);

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
    dataBySource[source] = data.map((doc) => {
      if (doc?.[0]?.metadata) {
        doc[0].metadata.summary = true;
      }
      return doc;
    });
  });

  return {
    data: map(dataBySource, (value) => value).flat(),
    tokens: totalTokens.current,
  };
};

const queryHandler = async (req: Request, res: Response) => {
  const { doc_id: docId, api_key: apiKey, query = '' } = req.body;
  const docVectorStore = await getVectorStore(docId, docId, apiKey);

  const queries: any[] = [];

  query.replace(/`@(.*?)`/g, (substring: any, args: any) => {
    const req1 = cloneDeep(req);
    req1.body.query = args;
    req1.body.k = Math.min(req1.body.k, 3);
    queries.push(queryByVectorStore(req1, docVectorStore));
    return substring;
  });

  queries.push(queryByVectorStore(req, docVectorStore));

  const queryResults = await Promise.all(queries);
  const resData: any[] = [];
  const exitsKeys = new Set<string>([]);
  const tokenResults: any[] = [];

  forEach(queryResults, (r) => {
    let hasItem = false;
    forEach(r.data, (d) => {
      const key = [d[0].metadata.hash, d[0].metadata.summary].join('/');
      if (!exitsKeys.has(key)) {
        resData.push(d);
        hasItem = true;
        exitsKeys.add(key);
      }
    });
    if (hasItem) tokenResults.push(r);
  });

  const results = resData.map((v) => {
    v[1] = 0;
    return v;
  });

  results.sort((a, b) => {
    return (a[0]?.metadata?.summary ? 0 : 1) - (b[0]?.metadata?.summary ? 0 : 1);
  });

  res.status(200).json({
    data: results,
    tokens: tokenResults
      .map((v) => v.tokens)
      .reduce((previousValue, currentValue) => previousValue + currentValue, 0),
  });
};

export default queryHandler;
