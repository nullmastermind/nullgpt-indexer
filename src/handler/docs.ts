import { Request, Response } from "express";
import { readdir } from "fs-extra";
import { db, docsDir, indexSaveDir } from "../const";
import { isDirectory } from "../u";
import { join } from "path";

const docsHandler = async (req: Request, res: Response) => {
  const docs: {
    doc_id: string;
    extensions: string[];
    indexAt: Date;
    isIndexed: boolean;
  }[] = [];
  const indexedDocIds = new Set<string>();

  const handleFile = async (f: string, parent: string, isIndexed: boolean) => {
    if (f === "_db") return;
    if (await isDirectory(join(parent, f))) {
      const extensions = await db.get(`${f}:extensions`);

      if (isIndexed) {
        indexedDocIds.add(f);
      }

      docs.push({
        doc_id: f,
        extensions: extensions || [],
        indexAt: new Date(
          (await db.get(`${f}:indexAt`)) || new Date(2023, 5, 29)
        ),
        isIndexed,
      });
    }
  };

  const indexedDirFiles = await readdir(indexSaveDir);
  const docsDirFiles = await readdir(docsDir);

  await Promise.all([
    ...indexedDirFiles.map((f) => {
      return handleFile(f, indexSaveDir, true);
    }),
    ...docsDirFiles.map((f) => {
      return handleFile(f, docsDir, false);
    }),
  ]);

  docs.sort((a, b) => {
    return a.doc_id.localeCompare(b.doc_id);
  });

  res.status(200).json({
    data: docs.filter((doc) => {
      if (!doc.isIndexed) {
        return !indexedDocIds.has(doc.doc_id);
      }
      return true;
    }),
  });
};

export default docsHandler;
