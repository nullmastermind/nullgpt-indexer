import { BM25Retriever } from '@langchain/community/retrievers/bm25';
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
  const results = await vectorStore.similaritySearch(query, maxScanLimit + ignoreHashes.length);
  const totalTokens = { current: 0 };
  const retriever = BM25Retriever.fromDocuments(
    results.filter(
      (document) => document.metadata.hash && !ignoredHashesSet.has(document.metadata.hash),
    ),
    { k: maxScanLimit },
  );
  const bm25RankedDocuments: [Document, number][] = (await retriever.invoke(query)).map(
    (document) => [document, 0],
  );

  try {
    if (process.env.VOYAGE_RERANK_MODEL && process.env.VOYAGE_API_KEY) {
      const documentsToRerank = [];
      let accumulatedTokenCount = 0;
      const maxTokensForReranking = Math.max(
        +env('VOYAGE_RERANK_MODEL_CONTEXT_LENGTH', '8000') - 128,
        512,
      );

      for (let i = 0; i < bm25RankedDocuments.length; i++) {
        const currentDocument = bm25RankedDocuments[i];
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
          documentsToRerank[rerankResult.index][1] = rerankResult.relevance_score;
          rerankedDocuments.push(documentsToRerank[rerankResult.index]);
        }
      });

      if (rerankedDocuments.length) {
        bm25RankedDocuments.length = 0;
        bm25RankedDocuments.push(...rerankedDocuments);
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
    const limitedData = bm25RankedDocuments.slice(0, k);
    bm25RankedDocuments.length = 0;
    bm25RankedDocuments.push(...limitedData);
  }

  const dataBySource: Record<string, [Document, number][]> = {};

  forEach(bm25RankedDocuments, (item) => {
    totalTokens.current += countTokens(item[0].pageContent);
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

  res.status(200).json({
    data: responseData,
    tokens: tokenUsageResults
      .map((result) => result.tokens)
      .reduce((total, current) => total + current, 0),
  });
};

export default queryHandler;
