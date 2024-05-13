import { Request, Response } from 'express';
import { encode } from 'gpt-3-encoder';
import { Document } from 'langchain/document';
import { FaissStore } from 'langchain/vectorstores/faiss';
import { cloneDeep, forEach, map } from 'lodash';

import { getVectorStore, scoreNormalizer2 } from '../utility/common';

const queryByVectorStore = async (
  req: Request,
  vectorStore: FaissStore,
  strategy: 'document' | 'code',
) => {
  const {
    query,
    k = 4,
    maxTokens = 3072,
    maxScore = 0.55,
    includeAllIfKLessThanScore = 0.3,
    scoreChangeThreshold = 0.03,
    ignoreHashes = [],
  } = req.body;
  const ignoredHashesSet = new Set<string>(ignoreHashes);
  const results = await vectorStore.similaritySearchWithScore(query, k + ignoredHashesSet.size);
  const data: [Document, number][] = [];
  const totalTokens = { current: 0 };
  const lastScore = { current: -1 };
  const includedSources = new Set<string>();

  forEach(results, (r) => {
    if (data.length >= k) return false;

    // I don't know why the score is greater than 1.0, like 1.2, 1.6, etc.
    // r[1] = Math.max(0.0, r[1] - 1.0);
    // r[1] = 1.0 - r[1] / 2.0;
    // console.log('score:', scoreNormalizer(r[1]), scoreNormalizer2(r[1]));

    r[1] = scoreNormalizer2(r[1]);

    // console.log('score:', r[1]);

    if (r[1] > maxScore) return false;

    // https://stackoverflow.com/a/76700607
    // if (!(r[1] >= 0.6 && r[1] <= 1.2)) return false;

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
    dataBySource[source] = data.map((doc) => {
      if (doc?.[0]?.metadata) {
        doc[0].metadata.summary = strategy === 'document';
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
  const codeVectorStore = await getVectorStore(docId + '+code', docId, apiKey);
  const docVectorStore = await getVectorStore(docId, docId, apiKey);

  const queries: any[] = [];

  query.replace(/`@(.*?)`/g, (substring: any, args: any) => {
    const req1 = cloneDeep(req);
    req1.body.query = args;
    req1.body.k = Math.min(req1.body.k, 3);
    queries.push(queryByVectorStore(req1, docVectorStore, 'document'));
    queries.push(queryByVectorStore(req1, codeVectorStore, 'code'));
    return substring;
  });

  if (queries.length) {
    req.body.k = Math.min(req.body.k, 3);
  }

  queries.push(queryByVectorStore(req, docVectorStore, 'document'));
  queries.push(queryByVectorStore(req, codeVectorStore, 'code'));

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
