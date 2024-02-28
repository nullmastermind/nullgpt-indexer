import { Request, Response } from "express";
import path from "path";
import { docsDir } from "../constant";
import { ensureFile, pathExists, writeFile } from "fs-extra";

const updateDocHandler = async (req: Request, res: Response) => {
  const { doc_id: docId, content } = req.body;
  const docDir = path.join(docsDir, docId);

  if (!(await pathExists(docDir))) {
    return res.status(400).json({ error: "Invalid document ID" });
  }

  const aliasFile = path.join(docDir, "1.alias");

  await ensureFile(aliasFile);
  await writeFile(aliasFile, content);

  res.status(200).json({
    data: content,
  });
};

export default updateDocHandler;
