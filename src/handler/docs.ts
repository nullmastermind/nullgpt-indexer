import { Request, Response } from "express";
import { readdir } from "fs-extra";
import { db, indexSaveDir } from "../const";
import { isDirectory } from "../u";
import { join } from "path";

const docsHandler = async (req: Request, res: Response) => {
  const files = await readdir(indexSaveDir);
  const docs: {
    doc_id: string;
    extensions: string[];
    indexAt: Date;
  }[] = [];

  await Promise.all(
    files.map(async (f) => {
      if (f === "_db") return;
      if (await isDirectory(join(indexSaveDir, f))) {
        const extensions = await db.get(`${f}:extensions`);

        if (extensions !== undefined) {
          docs.push({
            doc_id: f,
            extensions,
            indexAt: new Date(
              (await db.get(`${f}:indexAt`)) || new Date(2023, 5, 29)
            ),
          });
        }
      }
    })
  );

  docs.sort((a, b) => {
    return b.indexAt.getTime() - a.indexAt.getTime();
  });

  res.status(200).json({
    data: docs,
  });
};

export default docsHandler;
