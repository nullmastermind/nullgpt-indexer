import { Request, Response } from "express";
import path from "path";
import {
  createMd5,
  getSplitter,
  getVectorStore,
  listFilesRecursively,
} from "../u";
import { pathExists, readJson, remove, writeFile } from "fs-extra";
import { docsDir, indexSaveDir, vectorStores } from "../const";
import { TextLoader } from "langchain/document_loaders/fs/text";
import Queue from "better-queue";
import { FaissStore } from "langchain/vectorstores/faiss";
import { forEach, uniqueId } from "lodash";

type IndexerQueueInput = {
  f: string;
  indexFileExtensions: Set<string>;
  vectorStore: FaissStore;
  indexedHash: Record<string, boolean>;
  newIndexedHash: Record<string, boolean>;
};

const indexerQueue = new Queue<IndexerQueueInput>(
  async (
    {
      f,
      indexFileExtensions,
      vectorStore,
      indexedHash,
      newIndexedHash,
    }: IndexerQueueInput,
    cb
  ) => {
    const ext = path.extname(f);
    if (!indexFileExtensions.has(ext)) return cb(null);

    try {
      const splitter = getSplitter(ext);
      const loader = new TextLoader(f);
      const docs = (await loader.loadAndSplit(splitter)).filter((doc) => {
        return !(
          !doc.pageContent.includes(" ") &&
          !doc.pageContent.includes("\t") &&
          !doc.pageContent.includes(";") &&
          !doc.pageContent.includes("\n")
        );
      });
      const md5 = createMd5(docs.map((v) => v.pageContent).join(""));
      const tempIndexedHash: Record<string, boolean> = {};

      await vectorStore.addDocuments(
        docs
          .map((doc) => {
            doc.metadata.source =
              "/home/fakeuser/" +
              (path.relative(docsDir, doc.metadata.source) as string)
                .split(path.sep)
                .join("/");
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

  const indexFileExtensions: Set<string> = new Set(extensions);
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

  await listFilesRecursively(indexDir, async (f) => {
    const ext = path.extname(f);
    if (!indexFileExtensions.has(ext)) return;

    const exec = () => {
      return new Promise((rel) => {
        indexerQueue
          .push({
            f,
            indexFileExtensions,
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

    vectorStores[docId] = vectorStore;
    delete vectorStores[tempVectorStoreId];
  }

  console.log("Successfully indexed FaissStore");

  res.status(201).json({ message: "Successfully indexed FaissStore" });
};

export default indexHandler;
