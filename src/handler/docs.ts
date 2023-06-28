import { Request, Response } from "express";
import { readdir } from "fs-extra";
import { indexSaveDir } from "../const";
import { isDirectory } from "../u";
import { join } from "path";

const docsHandler = async (req: Request, res: Response) => {
  const files = await readdir(indexSaveDir);
  const dirs: string[] = [];

  await Promise.all(
    files.map(async (f) => {
      if (await isDirectory(join(indexSaveDir, f))) {
        dirs.push(f);
      }
    })
  );

  res.status(200).json({
    data: dirs.filter((v) => v !== "_db"),
  });
};

export default docsHandler;
