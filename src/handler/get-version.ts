import { Request, Response } from "express";

const getVersionHandler = async (req: Request, res: Response) => {
  res.status(200).json({
    data: require("../../package.json").version,
  });
};

export default getVersionHandler;
