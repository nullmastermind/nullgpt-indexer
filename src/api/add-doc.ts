import { Request, Response } from 'express';
import { ensureDir } from 'fs-extra';
import path from 'path';

import { docsDir } from '../constant';

const addDocHandler = async (req: Request, res: Response) => {
  const { doc_id: docId } = req.body;
  const addTo = path.join(docsDir, docId);

  await ensureDir(addTo);

  res.status(200).json({});
};

export default addDocHandler;
