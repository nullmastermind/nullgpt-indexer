import { Request, Response } from "express";
import { pathExists, readdir, readFile } from "fs-extra";
import path from "path";
import { docsDir } from "../const";

const managerHandler = async (req: Request, res: Response) => {
  const { doc_id: docId } = req.query as Record<any, string>;
  const docDir = path.join(docsDir, docId);

  if (!(await pathExists(docDir))) {
    return res.status(400).json({ error: "Invalid document ID" });
  }

  const docs: {
    f: string;
    editable: boolean;
  }[] = [];

  await Promise.all(
    (
      await readdir(docDir)
    ).map(async (f) => {
      if (f.endsWith(".alias")) return;

      docs.push({
        f: path.join(docDir, f),
        editable: false,
      });
    })
  );

  const aliasFile = path.join(docDir, "1.alias");

  if (await pathExists(path.join(docDir, "1.alias"))) {
    (await readFile(aliasFile, "utf-8"))
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length)
      .forEach((f) => {
        docs.push({
          f,
          editable: true,
        });
      });
  }

  res.status(200).json({
    data: docs,
  });
};

export default managerHandler;
