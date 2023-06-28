import { Request, Response } from "express";
import { pathExists, remove } from "fs-extra";
import { indexSaveDir } from "../const";
import path from "path";

const removeIndexHandler = async (req: Request, res: Response) => {
  const { doc_id: docId } = req.body;
  const removeDir = path.join(indexSaveDir, docId);

  if (await pathExists(removeDir)) {
    try {
      await remove(removeDir);
    } catch (e) {
      console.error(e);
    }
  }

  res.status(200).json({});
};

export default removeIndexHandler;
