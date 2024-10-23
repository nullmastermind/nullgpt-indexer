import { LanceDB } from '@langchain/community/vectorstores/lancedb';
import Queue from 'better-queue';
import { Request, Response } from 'express';
import { pathExists, readJson, writeFile } from 'fs-extra';
import { forEach, throttle } from 'lodash';
import path from 'path';

import { docsDir, indexSaveDir, storage, vectorStores } from '../constant';
import CachedEmbeddings from '../utility/embeddings/CachedEmbeddings';
import {
  createMd5,
  env,
  filterDocIndex,
  getLoader,
  getSplitter,
  getVectorStore,
  isMD5,
  listFilesRecursively,
  non,
} from '../utility/common';

// Cache TTL set to 7 days in milliseconds
const CACHE_TTL_MILLIS = 7 * 24 * 60 * 60 * 1000; // 7 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds

type IndexerQueueInput = {
  filePath: string;
  vectorStore: LanceDB;
  processedHashes: Record<string, boolean>;
  newlyProcessedHashes: Record<string, boolean>;
  processingStrategy: 'code' | 'document';
};

const documentProcessingQueue = new Queue<IndexerQueueInput>(
  async (
    {
      filePath,
      vectorStore,
      processedHashes,
      newlyProcessedHashes,
      processingStrategy,
    }: IndexerQueueInput,
    callback,
  ) => {
    try {
      if (processingStrategy === 'document' && !env('SUMMARY_MODEL_NAME')) {
        return;
      }

      const fileExtension = path.extname(filePath);
      const { loader, split } = await getLoader(filePath, processingStrategy);
      const documents = (
        split
          ? await loader.loadAndSplit(getSplitter(fileExtension, processingStrategy))
          : await loader.load()
      ).filter((document) => {
        return filterDocIndex(document);
      });
      const contentHash = createMd5(documents.map((doc) => doc.pageContent));
      const temporaryProcessedHashes: Record<string, boolean> = {};
      const isNewDocument = !processedHashes[contentHash];

      await vectorStore.addDocuments(
        documents
          .map((document) => {
            const documentPath = filePath.split(path.sep).join('/');

            document.pageContent = `${processingStrategy === 'document' ? 'DOCUMENT NAME' : 'REFERENCE CODE'}: ${documentPath}\n\n${document.pageContent}`;

            document.metadata.source = documentPath;
            document.metadata['md5'] = contentHash;
            document.metadata['hash'] = createMd5(document.pageContent);

            return document;
          })
          .map((document) => {
            temporaryProcessedHashes[document.metadata['hash']] = true;
            return document;
          }),
      );

      processedHashes[contentHash] = true;
      newlyProcessedHashes[contentHash] = true;
      forEach(temporaryProcessedHashes, (value, key) => {
        processedHashes[key] = true;
        newlyProcessedHashes[key] = true;
      });

      callback(null, isNewDocument);
    } catch (error) {
      callback(error);
    }
  },
  {
    concurrent: 10,
    maxRetries: 10,
    retryDelay: 5000,
  },
);

const clearConsole = throttle(() => {
  console.clear();
}, 10000);

const indexHandler = async (req: Request, res: Response) => {
  const { doc_id: documentId, extensions: allowedExtensions } = req.body;
  const documentDirectory = path.join(docsDir, documentId);

  if (!(await pathExists(documentDirectory))) {
    console.log('The path does not exist.', documentId);
    return res.status(400).json({ error: 'The path does not exist.' });
  }

  await storage.set(`${documentId}:extensions`, allowedExtensions);

  clearConsole();

  console.log(`Starting code indexing and embedding generation for document ID: ${documentId}`);

  const vectorStoreDirectory = path.join(indexSaveDir, documentId);
  const hashCacheFile = path.join(vectorStoreDirectory, 'indexedHash.json');
  const vectorStore = await getVectorStore(documentId, documentId, undefined, true);
  const processedFileCount = { current: 0 };
  let processedHashes: Record<string, boolean> = {};
  if (await pathExists(hashCacheFile)) {
    processedHashes = await readJson(hashCacheFile);
  }
  const newlyProcessedHashes: Record<string, boolean> = {};

  await listFilesRecursively(documentDirectory, allowedExtensions, async (filePath) => {
    const processFile = (processingStrategy: 'code' | 'document') => {
      return new Promise((resolve) => {
        documentProcessingQueue
          .push({
            filePath,
            vectorStore,
            processedHashes,
            newlyProcessedHashes,
            processingStrategy,
          })
          .on('finish', resolve);
      });
    };

    await Promise.all([processFile('code')]);

    console.log(`Successfully indexed file: ${filePath}`);

    processedFileCount.current += 1;
  });

  console.log('Cleaning...');

  if (processedFileCount.current > 0) {
    // await vectorStore.save(vectorStoreDirectory);
    await writeFile(hashCacheFile, JSON.stringify(processedHashes));
    await (vectorStore.embeddings as CachedEmbeddings).ensureAllDataSaved();

    vectorStores[documentId] = vectorStore;
    delete vectorStores[documentId];
  }

  await storage.set(`${documentId}:indexAt`, new Date());

  // remove unused keys
  void storage
    .eachKey(async (key) => {
      if (isMD5(key)) {
        const lastUpdated = await storage.get(`${key}:updatedAt`);
        if (lastUpdated === undefined) {
          storage.del(key).finally();
          console.log('removed:', key);
        } else {
          const storedDocumentId = await storage.get(`${key}:doc_id`);
          if (storedDocumentId === documentId) {
            const lastUpdateTimestamp = new Date(lastUpdated);
            const timeSinceUpdate = Date.now() - lastUpdateTimestamp.getTime();
            if (timeSinceUpdate > CACHE_TTL_MILLIS) {
              storage.del(key).finally();
              storage.del(`${key}:doc_id`).finally();
              storage.del(`${key}:updatedAt`).finally();
              console.log('removed:', key);
            }
          }
        }
      }
    })
    .catch(non);

  console.log(`Successfully indexed ${processedFileCount.current} files for ${documentId}`);

  res.status(201).json({
    message: `Successfully indexed ${processedFileCount.current} files`,
    details: {
      docId: documentId,
      filesIndexed: processedFileCount.current,
      newHashes: Object.keys(newlyProcessedHashes).length,
      timestamp: new Date().toISOString(),
    },
  });
};

export default indexHandler;
