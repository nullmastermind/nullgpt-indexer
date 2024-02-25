import { Request, Response } from "express";
import { gitAddSafeDir, gitPull } from "../u";

const gitPullHandler = async (req: Request, res: Response) => {
  const { cwd } = req.body;

  try {
    const stdio = await gitPull(cwd);
    return res.status(200).send(stdio);
  } catch (e: any) {
    try {
      if (e.toString().includes("git config --global --add safe.directory")) {
        await gitAddSafeDir(cwd);
        const stdio = await gitPull(cwd);
        return res.status(200).send(stdio);
      }
    } finally {
    }
    return res.status(400).send(e.toString());
  }
};

export default gitPullHandler;
