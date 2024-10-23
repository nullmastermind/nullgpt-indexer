import type { LanceDB } from '@langchain/community/vectorstores/lancedb';
import { TextSplitter } from 'langchain/text_splitter';
import path from 'path';

import Storage from './utility/Storage';

require('dotenv').config({
  path: require('path').join(process.cwd(), '.env'),
});

export const indexers = {};
export const docsDir = path.join(process.cwd(), 'docs');
export const indexSaveDir = path.join(process.cwd(), 'indexes');
export const splitter: Record<string, TextSplitter> = {};
export const vectorStores: Record<string, LanceDB> = {};
export type TEmbeddingsType = 'tensorflow' | 'openai';
export const embeddingsType = (process.env.EMBEDDINGS || 'openai') as TEmbeddingsType;
export const storage = new Storage('DEFAULT');
export const summaryStorage = new Storage('SUMMARY');
