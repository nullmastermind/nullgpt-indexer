import { FaissStore } from '@langchain/community/vectorstores/faiss';
import axios from 'axios';
import { Request, Response } from 'express';
import { Document } from 'langchain/document';
import { cloneDeep, forEach, map } from 'lodash';

import { countTokens, env, getVectorStore, trimLines } from '../utility/common';

const queryByVectorStore = async (req: Request, vectorStore: FaissStore) => {
  const { query, ignoreHashes = [], k = 20, minScore: rerankMinScore = 0.3 } = req.body;
  const ignoredHashesSet = new Set<string>(ignoreHashes);
  const maxScanLimit = Math.max(k, 150);
  const results = await vectorStore.similaritySearchWithScore(
    query,
    maxScanLimit + ignoreHashes.length,
  );
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
    const tokenCount = countTokens(result[0].pageContent);
    const tokenDensity = tokenCount / contentLength;
    const densityScore = Math.min(tokenDensity * 2, 1); // Normalize to 0-1

    // Combine scores with weights
    result[1] =
      normalizedScore * 0.6 + // Similarity importance
      lengthScore * 0.3 + // Length importance
      densityScore * 0.1; // Token density importance;

    // console.log('normalizedScore', normalizedScore, finalScore);

    totalTokens.current += tokenCount;

    data.push(result);
  }

  // Sort by final score (lower is better)
  data.sort((a, b) => a[1] - b[1]);

  try {
    if (process.env.VOYAGE_RERANK_MODEL && process.env.VOYAGE_API_KEY) {
      const documentsToRerank = [];
      let accumulatedTokenCount = 0;
      const maxTokensForReranking = Math.max(
        +env('VOYAGE_RERANK_MODEL_CONTEXT_LENGTH', '8000') - 128,
        512,
      );

      for (let i = 0; i < data.length; i++) {
        const currentDocument = data[i];
        const currentDocumentTokens = countTokens(trimLines(currentDocument[0].pageContent));
        accumulatedTokenCount += currentDocumentTokens;
        if (accumulatedTokenCount <= maxTokensForReranking) {
          documentsToRerank.push(currentDocument);
        } else {
          break;
        }
      }

      const { data: voyageRerankResponse } = await axios.post(
        'https://api.voyageai.com/v1/rerank',
        {
          query: query,
          documents: documentsToRerank.map((document) => {
            return trimLines(document[0].pageContent);
          }),
          model: env('VOYAGE_RERANK_MODEL', 'rerank-2'),
          top_k: k,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
          },
        },
      );

      const rerankedDocuments = [];

      forEach(voyageRerankResponse.data, (rerankResult) => {
        if (rerankResult.relevance_score >= rerankMinScore) {
          rerankedDocuments.push(documentsToRerank[rerankResult.index]);
        }
      });

      if (rerankedDocuments.length) {
        data.length = 0;
        data.push(...rerankedDocuments);
      } else {
        throw new Error('Reranking failed - no results returned from VOYAGE_RERANK model');
      }
    } else {
      throw new Error(
        'VOYAGE_RERANK model not configured - please set VOYAGE_RERANK_MODEL and VOYAGE_API_KEY environment variables',
      );
    }
  } catch (error) {
    console.log(error);

    // Limit processing to first k items
    const limitedData = data.slice(0, k);
    data.length = 0;
    data.push(...limitedData);
  }

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
  const { doc_id: documentId, query = '' } = req.body;
  const documentVectorStore = await getVectorStore(documentId, undefined);

  const vectorQueries: any[] = [];

  query.replace(/`@(.*?)`/g, (matchedString: any, queryText: any) => {
    const subRequest = cloneDeep(req);
    subRequest.body.query = queryText;
    subRequest.body.k = Math.min(subRequest.body.k, 3);
    vectorQueries.push(queryByVectorStore(subRequest, documentVectorStore));
    return matchedString;
  });

  vectorQueries.push(queryByVectorStore(req, documentVectorStore));

  const searchResults = await Promise.all(vectorQueries);
  const responseData: any[] = [];
  const processedDocumentKeys = new Set<string>([]);
  const tokenUsageResults: any[] = [];

  forEach(searchResults, (searchResult) => {
    let hasValidDocument = false;
    forEach(searchResult.data, (document) => {
      const documentKey = [document[0].metadata.hash, document[0].metadata.summary].join('/');
      if (!processedDocumentKeys.has(documentKey)) {
        responseData.push(document);
        hasValidDocument = true;
        processedDocumentKeys.add(documentKey);
      }
    });
    if (hasValidDocument) tokenUsageResults.push(searchResult);
  });

  const sortedResults = responseData.map((document) => {
    document[1] = 0;
    return document;
  });

  sortedResults.sort((docA, docB) => {
    return (docA[0]?.metadata?.summary ? 0 : 1) - (docB[0]?.metadata?.summary ? 0 : 1);
  });

  res.status(200).json({
    data: sortedResults,
    tokens: tokenUsageResults
      .map((result) => result.tokens)
      .reduce((total, current) => total + current, 0),
  });
};

export default queryHandler;
