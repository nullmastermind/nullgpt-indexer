import Queue from 'better-queue';
import { Request, Response } from 'express';
import { pathExists, readJson, writeFile } from 'fs-extra';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { FaissStore } from 'langchain/vectorstores/faiss';
import { forEach, throttle, uniqueId } from 'lodash';
import path from 'path';

import { docsDir, indexSaveDir, storage, vectorStores } from '../constant';
import CachedOpenAIEmbeddings from '../utility/CachedOpenAIEmbeddings';
import {
  createMd5,
  filterDocIndex,
  getSplitter,
  getVectorStore,
  isMD5,
  listFilesRecursively,
} from '../utility/common';

const cacheTTLMillis = 7 * 24 * 60 * 60 * 1000;

type IndexerQueueInput = {
  f: string;
  vectorStore: FaissStore;
  indexedHash: Record<string, boolean>;
  newIndexedHash: Record<string, boolean>;
  strategy: 'code' | 'document';
};

const indexerQueue = new Queue<IndexerQueueInput>(
  async ({ f, vectorStore, indexedHash, newIndexedHash, strategy }: IndexerQueueInput, cb) => {
    try {
      if (strategy === 'document' && !process.env.SUMMARY_MODEL_NAME?.length) {
        return;
      }

      const ext = path.extname(f);
      const splitter = getSplitter(ext, strategy);
      const loader = new TextLoader(f);
      const docs = (await loader.loadAndSplit(splitter)).filter((doc) => {
        return filterDocIndex(doc);
      });
      const md5 = createMd5(docs.map((v) => v.pageContent).join(''));
      const tempIndexedHash: Record<string, boolean> = {};
      const isNewIndex = !indexedHash[md5];

      await vectorStore.addDocuments(
        docs
          .map((doc) => {
            // const relativePath = (path.relative(docsDir, doc.metadata.source) as string)
            //   .split(path.sep)
            //   .join('/')
            //   .split('../')
            //   .join('')
            //   .split('./')
            //   .join('');
            // const tempDocName = relativePath.split('/');
            // const docName = [
            //   '/',
            //   tempDocName
            //     .filter((v, i) => tempDocName.length - i <= 3)
            //     .filter((v) => !['.', '..'].includes(v))
            //     .join('/'),
            // ].join('');
            const docName = f.split(path.sep).join('/');

            console.log('docName', docName);

            doc.pageContent = `${strategy === 'document' ? 'DOCUMENT NAME' : 'REFERENCE CODE'}: ${docName}\n\n${doc.pageContent}`;

            // doc.metadata.source = '/home/fakeuser' + docName;
            doc.metadata.source = '/home/fakeuser' + docName;
            doc.metadata['md5'] = md5;
            doc.metadata['hash'] = createMd5(doc.pageContent);

            return doc;
          })
          .map((doc) => {
            tempIndexedHash[doc.metadata['hash']] = true;
            return doc;
          }),
      );

      indexedHash[md5] = true;
      newIndexedHash[md5] = true;
      forEach(tempIndexedHash, (value, key) => {
        indexedHash[key] = true;
        newIndexedHash[key] = true;
      });

      cb(null, isNewIndex);
    } catch (e) {
      cb(e);
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
  const { doc_id: docId, extensions, api_key: apiKey } = req.body;
  const indexDir = path.join(docsDir, docId);

  if (!(await pathExists(indexDir))) {
    console.log('The path does not exist.', docId);
    return res.status(400).json({ error: 'The path does not exist.' });
  }

  await storage.set(`${docId}:extensions`, extensions);

  clearConsole();
  console.log(`Start training ${docId}...`);

  const docSaveTo = path.join(indexSaveDir, docId);
  const codeSaveTo = path.join(indexSaveDir, docId + '+code');
  const indexedHashFile = path.join(docSaveTo, 'indexedHash.json');
  const docVectorStoreId = uniqueId('VectorStore');
  const codeVectorStoreId = uniqueId('CodeVectorStore');
  const docVectorStore = await getVectorStore(docVectorStoreId, docId, apiKey, true);
  const codeVectorStore = await getVectorStore(codeVectorStoreId, docId, apiKey, true);
  const indexed = { current: 0 };
  let indexedHash: Record<string, boolean> = {};
  if (await pathExists(indexedHashFile)) {
    indexedHash = await readJson(indexedHashFile);
  }
  const newIndexedHash: Record<string, boolean> = {};

  await listFilesRecursively(indexDir, extensions, async (f) => {
    const exec = (strategy: 'code' | 'document') => {
      return new Promise((rel) => {
        indexerQueue
          .push({
            f,
            vectorStore: {
              code: codeVectorStore,
              document: docVectorStore,
            }[strategy],
            indexedHash,
            newIndexedHash,
            strategy,
          })
          .on('finish', rel);
      });
    };

    await Promise.all([exec('document'), exec('code')]);

    console.log('indexed:', f);

    indexed.current += 1;
  });

  console.log('Cleaning...');

  if (indexed.current > 0) {
    await docVectorStore.save(docSaveTo);
    await codeVectorStore.save(codeSaveTo);
    await writeFile(indexedHashFile, JSON.stringify(indexedHash));
    await (docVectorStore.embeddings as CachedOpenAIEmbeddings).ensureAllDataSaved();

    vectorStores[docId] = docVectorStore;
    delete vectorStores[docVectorStoreId];
  }

  await storage.set(`${docId}:indexAt`, new Date());

  // remove unused keys
  storage
    .eachKey(async (key) => {
      if (isMD5(key)) {
        const updatedAt = await storage.get(`${key}:updatedAt`);
        if (updatedAt === undefined) {
          storage.del(key).finally();
          console.log('removed:', key);
        } else {
          const keyDocId = await storage.get(`${key}:doc_id`);
          if (keyDocId === docId) {
            const lastUpdateAt = new Date(updatedAt);
            const diff = Date.now() - lastUpdateAt.getTime();
            if (diff > cacheTTLMillis) {
              storage.del(key).finally();
              storage.del(`${key}:doc_id`).finally();
              storage.del(`${key}:updatedAt`).finally();
              console.log('removed:', key);
            }
          }
        }
      }
    })
    .finally();

  console.log('Successfully indexed FaissStore');

  res.status(201).json({ message: 'Successfully indexed FaissStore' });
};

export default indexHandler;
