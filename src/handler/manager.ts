import { Request, Response } from "express";

const managerHandler = async (req: Request, res: Response) => {
  res.status(200).json({});
};

export default managerHandler;
