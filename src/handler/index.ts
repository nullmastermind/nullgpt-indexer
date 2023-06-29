import { Request, Response } from "express";
import path from "path";
import {
  createMd5,
  filterDocIndex,
  getSplitter,
  getVectorStore,
  listFilesRecursively,
} from "../u";
import { pathExists, readJson, writeFile } from "fs-extra";
import { db, docsDir, indexSaveDir, vectorStores } from "../const";
import { TextLoader } from "langchain/document_loaders/fs/text";
import Queue from "better-queue";
import { FaissStore } from "langchain/vectorstores/faiss";
import { forEach, uniqueId } from "lodash";
import CachedOpenAIEmbeddings from "../utility/CachedOpenAIEmbeddings";

type IndexerQueueInput = {
  f: string;
  vectorStore: FaissStore;
  indexedHash: Record<string, boolean>;
  newIndexedHash: Record<string, boolean>;
};

const indexerQueue = new Queue<IndexerQueueInput>(
  async (
    { f, vectorStore, indexedHash, newIndexedHash }: IndexerQueueInput,
    cb
  ) => {
    try {
      const ext = path.extname(f);
      const splitter = getSplitter(ext);
      const loader = new TextLoader(f);
      const docs = (await loader.loadAndSplit(splitter)).filter((doc) => {
        return filterDocIndex(doc);
      });
      const md5 = createMd5(docs.map((v) => v.pageContent).join(""));
      const tempIndexedHash: Record<string, boolean> = {};

      await vectorStore.addDocuments(
        docs
          .map((doc) => {
            const relativePath = (
              path.relative(docsDir, doc.metadata.source) as string
            )
              .split(path.sep)
              .join("/")
              .split("../")
              .join("")
              .split("./")
              .join("");

            doc.metadata.source = "/home/fakeuser/" + relativePath;
            doc.metadata["md5"] = md5;
            doc.metadata["hash"] = createMd5(doc.pageContent);

            return doc;
          })
          .map((doc) => {
            tempIndexedHash[doc.metadata["hash"]] = true;
            return doc;
          })
      );

      indexedHash[md5] = true;
      newIndexedHash[md5] = true;
      forEach(tempIndexedHash, (value, key) => {
        indexedHash[key] = true;
        newIndexedHash[key] = true;
      });

      cb(null);
    } catch (e) {
      cb(e);
    }
  },
  {
    concurrent: 10,
    maxRetries: 10,
    retryDelay: 5000,
  }
);

const indexHandler = async (req: Request, res: Response) => {
  const { doc_id: docId, extensions, api_key: apiKey } = req.body;
  const indexDir = path.join(docsDir, docId);

  if (!(await pathExists(indexDir))) {
    return res.status(400).json({ error: "The path does not exist." });
  }

  const saveTo = path.join(indexSaveDir, docId);
  const indexedHashFile = path.join(saveTo, "indexedHash.json");
  const tempVectorStoreId = uniqueId("VectorStore");
  const vectorStore = await getVectorStore(tempVectorStoreId, apiKey, true);
  const indexed = { current: 0 };
  let indexedHash: Record<string, boolean> = {};
  if (await pathExists(indexedHashFile)) {
    indexedHash = await readJson(indexedHashFile);
  }
  const newIndexedHash: Record<string, boolean> = {};

  await listFilesRecursively(indexDir, extensions, async (f) => {
    const exec = () => {
      return new Promise((rel) => {
        indexerQueue
          .push({
            f,
            vectorStore,
            indexedHash,
            newIndexedHash,
          })
          .on("finish", rel);
      });
    };

    await exec();
    indexed.current += 1;

    console.log("indexed:", f);
  });

  console.log("Cleaning...");

  if (indexed.current > 0) {
    await vectorStore.save(saveTo);
    await writeFile(indexedHashFile, JSON.stringify(indexedHash));
    await (
      vectorStore.embeddings as CachedOpenAIEmbeddings
    ).ensureAllDataSaved();

    vectorStores[docId] = vectorStore;
    delete vectorStores[tempVectorStoreId];
  }

  await db.set(`${docId}:extensions`, extensions);
  await db.set(`${docId}:indexAt`, new Date());

  console.log("Successfully indexed FaissStore");

  res.status(201).json({ message: "Successfully indexed FaissStore" });
};

export default indexHandler;
