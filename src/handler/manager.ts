import { Request, Response } from "express";
import { pathExists, pathExistsSync, readdir, readFile } from "fs-extra";
import path from "path";
import { docsDir } from "../constant";
import { map } from "lodash";
import { isDirectory } from "../utility/common";

const managerHandler = async (req: Request, res: Response) => {
  const { doc_id: docId } = req.query as Record<any, string>;
  const docDir = path.join(docsDir, docId);

  if (!(await pathExists(docDir))) {
    return res.status(400).json({ error: "Invalid document ID" });
  }

  const docs: {
    f: string;
    editable: boolean;
    git?: string;
    exists: boolean;
  }[] = [];

  await Promise.all(
    (
      await readdir(docDir)
    ).map(async (f) => {
      if (f.endsWith(".alias")) return;

      const fullPath = path.join(docDir, f);

      docs.push({
        f: fullPath,
        editable: false,
        exists: await pathExists(fullPath),
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
          exists: pathExistsSync(f),
        });
      });
  }

  const findGit = async (findPath: string): Promise<string | undefined> => {
    findPath = findPath.split(path.sep).join("/");
    if (!(await pathExists(findPath))) {
      return undefined;
    }
    const currentDir = (await isDirectory(findPath))
      ? findPath
      : path.dirname(findPath);
    let temp = currentDir.split("/");
    while (temp.length > 0) {
      if (await pathExists(path.join(temp.join("/"), ".git"))) {
        return temp.join(path.sep);
      }
      temp.pop();
    }
    return undefined;
  };

  const docsWithGit = await Promise.all(
    map(docs, async (doc) => {
      doc.git = await findGit(doc.f);
      return doc;
    })
  );

  res.status(200).json({
    data: docsWithGit,
  });
};

export default managerHandler;
