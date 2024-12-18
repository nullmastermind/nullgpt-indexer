import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { TextSplitter, TokenTextSplitter } from '@langchain/textsplitters';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import fg from 'fast-glob';
import * as fs from 'fs-extra';
import { pathExists } from 'fs-extra';
import { encode } from 'gpt-tokenizer';
import ignore, { Ignore } from 'ignore';
import { BaseDocumentLoader } from 'langchain/dist/document_loaders/base';
import { Document } from 'langchain/document';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { forEach } from 'lodash';
import path, { join } from 'path';

import { indexSaveDir, splitter, vectorStores } from '../constant';
import SummarySplitter from './SummarySplitter';
import CachedEmbeddings from './embeddings/CachedEmbeddings';
import CachedGoogleGenerativeAIEmbeddings from './embeddings/CachedGoogleGenerativeAIEmbeddings';

function getGitFiles(cwd: string): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    if (!(await pathExists(join(cwd, '.git')))) {
      return reject('Not a git root directory');
    }
    exec('git ls-files', { cwd }, (error, stdout) => {
      if (error) {
        console.log('Git is not in this folder:', cwd);
        return reject(error);
      }

      const files = stdout.split('\n').filter(Boolean);
      resolve(files);
    });
  });
}

export async function listFilesRecursively(
  dir: string,
  fileExtensions: string[],
  cb: (f: string) => Promise<any>,
): Promise<void> {
  const handlers = [];
  const ignores = await getIgnores(dir);
  const dirIgnoresMap: Record<string, Ignore[]> = {};
  let stream: string[] = [];

  try {
    stream = await getGitFiles(dir);
    const extSet = new Set(fileExtensions);
    stream = stream.filter((f) => {
      return extSet.has(path.extname(f));
    });
  } catch {}

  if (!stream.length) {
    stream = await fg(
      [...fileExtensions, '.alias'].map((ext) => `**/*${ext}`),
      {
        cwd: dir,
        dot: false,
        onlyFiles: true,
      },
    );
  }

  for (const entry of stream) {
    const fullPath = path.join(dir, entry as string);
    const dirname = path.dirname(fullPath);

    if (path.extname(fullPath) === '.alias') {
      const aliasEntries = (await fs.readFile(fullPath))
        .toString('utf-8')
        .split('\n')
        .map((v) => v.trim())
        .filter((v) => v.length);
      for (let i = 0; i < aliasEntries.length; i++) {
        const aliasEntry = aliasEntries[i];
        if (await pathExists(aliasEntry)) {
          if (await isDirectory(aliasEntry)) {
            await listFilesRecursively(aliasEntry, fileExtensions, cb);
          } else {
            handlers.push(cb(aliasEntry));
          }
        }
      }
      continue;
    }

    if (!dirIgnoresMap[dirname]) {
      dirIgnoresMap[dirname] = [];
      forEach(ignores[0], (k) => {
        if (dirname.includes(k)) {
          dirIgnoresMap[dirname].push(ignores[1][k]);
        }
      });
    }

    let ignore = false;
    forEach(dirIgnoresMap[dirname], (ig) => {
      if (ig.ignores(entry as string)) {
        ignore = true;
        return false;
      }
    });

    if (ignore) continue;

    handlers.push(cb(fullPath));
  }

  await Promise.all(handlers);
}

export async function getIgnores(dir: string): Promise<[string[], Record<string, Ignore>]> {
  const stream = fg.stream('**/.gitignore', {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const keys = [];
  const mapValue: Record<string, Ignore> = {};

  for await (const entry of stream) {
    const fullPath = path.join(dir, entry as string);
    const dirname = path.dirname(fullPath);
    const gitignoreContent = (await fs.readFile(fullPath)).toString('utf-8');
    mapValue[dirname] = ignore().add(gitignoreContent);
    keys.push(dirname);
  }

  keys.sort((a, b) => {
    return a.length - b.length;
  });

  return [keys, mapValue];
}

export const filterDocIndex = (doc: Document): boolean => {
  if (!doc.pageContent || !doc.pageContent.trim()) return false;

  // filter hash
  if (
    !doc.pageContent.includes(' ') &&
    !doc.pageContent.includes('\t') &&
    !doc.pageContent.includes(';') &&
    !doc.pageContent.includes('\n')
  ) {
    return false;
  }

  // if (['.cs'].includes(path.extname(doc.metadata.source))) {
  //   // ignore c# import
  //   const lines = doc.pageContent
  //     .split('\n')
  //     .map((v) => v.trim())
  //     .filter((v) => v.length > 0)
  //     .filter((v) => !v.startsWith('using'));
  //   if (lines.length === 0) {
  //     console.log('ignored c# import');
  //     return false;
  //   }
  // } else if (['.js', '.jsx', '.ts', 'tsx'].includes(path.extname(doc.metadata.source))) {
  //   // ignore js import
  //   const lines = doc.pageContent
  //     .split('\n')
  //     .map((v) => v.trim())
  //     .filter((v) => v.length > 0)
  //     .filter((v) => {
  //       return !(v.startsWith('const') || v.startsWith('import'));
  //     });
  //   if (lines.length === 0) {
  //     console.log('ignored js import');
  //     return false;
  //   }
  // }

  // ignore if all lines contains special symbol only
  // const lines = doc.pageContent
  //   .split('\n')
  //   .map((v) => v.trim())
  //   .filter((v) => v.length > 0)
  //   .filter((v) => {
  //     v = v.split(' ').join('').split('\t').join('');
  //     return !isOnlySpecial(v);
  //   });
  // if (lines.length === 0) {
  //   console.log('ignored special characters');
  //   return false;
  // }

  return true;
};

export const env = (key: string, defaultValue?: string): string | undefined => {
  if (key in process.env) return process.env[key];
  return defaultValue;
};

export const getSplitter = (filePath: string, ext: string): TextSplitter | SummarySplitter => {
  if (env('CONTEXTUAL_MODEL_NAME')?.length > 0) {
    let summaryStrategy = 'document';

    if (
      [
        '.js',
        '.jsx',
        '.ts',
        '.tsx',
        '.py',
        '.java',
        '.cpp',
        '.c',
        '.cs',
        '.go',
        '.rb',
        '.php',
        '.swift',
        '.rs',
        '.kt',
        '.scala',
        '.pl',
        '.sh',
        '.ps1',
        '.bat',
        '.cmd',
        '.vb',
        '.fs',
        '.hs',
        '.lua',
        '.r',
        '.m',
        '.mm',
        '.f90',
        '.f95',
        '.f03',
        '.f08',
        '.ada',
        '.pas',
        '.d',
        '.erl',
        '.ex',
        '.exs',
        '.elm',
        '.clj',
        '.coffee',
        '.groovy',
        '.jl',
        '.ml',
        '.nim',
        '.rkt',
        '.v',
        '.zig',
        '.au3',
        '.sql',
        '.yaml',
        '.yml',
        '.json',
        '.xml',
        '.html',
        '.css',
        '.scss',
        '.sass',
        '.less',
        '.vue',
        '.svelte',
        '.dart',
        '.gradle',
        '.tf',
        '.tfvars',
        '.hcl',
        '.dockerfile',
        '.sol',
        '.wasm',
        '.wat',
        '.asm',
        '.s',
        '.nasm',
        '.mips',
        '.arm',
        '.cmake',
        '.make',
        '.toml',
        '.ini',
        '.cfg',
        '.conf',
        '.properties',
        '.env',
      ].includes(ext)
    ) {
      summaryStrategy = 'code';
    }

    return new SummarySplitter(summaryStrategy, filePath);
  }

  if (!splitter[ext]) {
    // https://platform.openai.com/docs/assistants/tools/file-search/how-it-works
    splitter[ext] = new TokenTextSplitter({
      encodingName: 'cl100k_base',
      chunkOverlap: 400,
      chunkSize: 800,
    });
  }

  return splitter[ext];
};

export const getVectorStore = async (
  docId: string,
  apiKey?: string,
  forceNew?: boolean,
): Promise<FaissStore> => {
  if (!vectorStores[docId] || forceNew) {
    const saveDir = path.join(indexSaveDir, docId);
    const embeddings = { current: undefined as any };
    const embeddingModel = env('EMBEDDING_MODEL', 'text-embedding-004');
    // const tableName = createMd5(['vectors', embeddingModel]);

    // // Determine vector dimensions based on the model
    // const vectorDimensions = +env(
    //   'EMBEDDING_DIMENSIONS',
    //   env('EMBEDDINGS') === 'google' ? '768' : '1536',
    // );

    if (env('EMBEDDINGS') === 'google') {
      embeddings.current = new CachedGoogleGenerativeAIEmbeddings(docId, {
        apiKey: env('GOOGLE_API_KEY'),
        maxRetries: +env('MAX_RETRIES', '10'),
        model: embeddingModel, // dimensions: 768
      });
    } else {
      embeddings.current = new CachedEmbeddings(docId, {
        openAIApiKey: apiKey || env('OPENAI_API_KEY'),
        maxRetries: +env('MAX_RETRIES', '10'),
        model: embeddingModel, // dimensions: 1536 for OpenAI
      });
    }

    try {
      if (forceNew) {
        throw new Error('Force new vector store creation requested');
      }
      vectorStores[docId] = await FaissStore.load(saveDir, embeddings.current);
    } catch {
      vectorStores[docId] = await FaissStore.fromTexts(['🐧'], [{ id: 1 }], embeddings.current);
    }
  }

  return vectorStores[docId];
};

export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await fs.stat(path);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

export function createMd5(content: any): string {
  content = JSON.stringify(content);
  return createHash('md5').update(content).digest('hex');
}

export function isMD5(str: string) {
  // Regular expression pattern for MD5 hash
  const md5Pattern = /^[a-f0-9]{32}$/;

  return md5Pattern.test(str);
}

export function gitPull(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec('git pull', { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve([stdout, stderr].join('\n\n'));
      }
    });
  });
}

export function gitAddSafeDir(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec('git config --global --add safe.directory *', { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve([stdout, stderr].join('\n\n'));
      }
    });
  });
}

export const countTokens = (content: string) => {
  try {
    return encode(content).length;
  } catch {
    return 0;
  }
};

// export const scoreNormalizer = (score: number) => {
//   // return 1 - 1 / (1 + Math.exp(score));
//   score = 1.0 - score / Math.sqrt(2.0);
//
//   if (score < 0) {
//     return 1.0 - score;
//   }
//
//   return score;
//   // return 1 - 1 / (1 + Math.exp(score));
// };

// https://math.stackexchange.com/a/3116145
export const scoreNormalizer2 = (x: number): number => {
  return (2 / Math.PI) * Math.atan(x);
};

export const getLoader = async (
  filePath: string,
  strategy: 'code' | 'document',
): Promise<{
  loader: BaseDocumentLoader;
  split: boolean;
}> => {
  // if (filePath.endsWith('.csv')) {
  //   return {
  //     loader: new TextLoader(filePath),
  //     split: true,
  //   };
  // }
  //
  // if (filePath.endsWith('.txt')) {
  //   return {
  //     loader: new TextLoader(filePath),
  //     split: true,
  //   };
  // }

  return {
    loader: new TextLoader(filePath),
    split: true,
  };
};

export const non = () => {};

export const trimLines = (content: string) => {
  return content
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
};
