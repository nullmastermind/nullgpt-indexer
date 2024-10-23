import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { TextSplitter } from '@langchain/textsplitters';
import path from 'path';

import Storage from './utility/Storage';

require('dotenv').config({
  path: require('path').join(process.cwd(), '.env'),
});

export const indexers = {};
export const docsDir = path.join(process.cwd(), 'docs');
export const indexSaveDir = path.join(process.cwd(), 'indexes');
export const splitter: Record<string, TextSplitter> = {};
export const vectorStores: Record<string, FaissStore> = {};
export type TEmbeddingsType = 'tensorflow' | 'openai';
export const embeddingsType = (process.env.EMBEDDINGS || 'openai') as TEmbeddingsType;
export const storage = new Storage('DEFAULT');
export const summaryStorage = new Storage('SUMMARY');
