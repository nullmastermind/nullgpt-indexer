import { Request, Response } from "express";
import { pathExists, remove } from "fs-extra";
import { docsDir, indexSaveDir } from "../const";
import path from "path";

const removeIndexHandler = async (req: Request, res: Response) => {
  const { doc_id: docId } = req.body;
  const removeDir = path.join(indexSaveDir, docId);
  const removeDocsDir = path.join(docsDir, docId);

  if (await pathExists(removeDir)) {
    try {
      await remove(removeDir);
    } catch (e) {
      console.error(e);
    }
  } else if (await pathExists(removeDocsDir)) {
    try {
      await remove(removeDocsDir);
    } catch (e) {
      console.error(e);
    }
  }

  res.status(200).json({});
};

export default removeIndexHandler;
