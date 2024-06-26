import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { exec } from 'child_process';
import { createHash } from 'crypto';
import fg from 'fast-glob';
import * as fs from 'fs-extra';
import { pathExists } from 'fs-extra';
import ignore, { Ignore } from 'ignore';
import { BaseDocumentLoader } from 'langchain/dist/document_loaders/base';
import { Document } from 'langchain/document';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import {
  RecursiveCharacterTextSplitter,
  TextSplitter,
  TokenTextSplitter,
} from 'langchain/text_splitter';
import { forEach } from 'lodash';
import path, { join } from 'path';

import { indexSaveDir, splitter, vectorStores } from '../constant';
import CachedOpenAIEmbeddings from './CachedOpenAIEmbeddings';
import Strategy from './Strategy';
import SummarySplitter from './SummarySplitter';

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

export function isOnlySpecial(content: string) {
  const specialRegex = /^[^\p{L}\s]+$/u;

  return specialRegex.test(content);
}

export const filterDocIndex = (doc: Document<Record<string, any>>): boolean => {
  // filter hash
  if (
    !doc.pageContent.includes(' ') &&
    !doc.pageContent.includes('\t') &&
    !doc.pageContent.includes(';') &&
    !doc.pageContent.includes('\n')
  ) {
    return false;
  }

  if (['.cs'].includes(path.extname(doc.metadata.source))) {
    // ignore c# import
    const lines = doc.pageContent
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .filter((v) => !v.startsWith('using'));
    if (lines.length === 0) {
      console.log('ignored c# import');
      return false;
    }
  } else if (['.js', '.jsx', '.ts', 'tsx'].includes(path.extname(doc.metadata.source))) {
    // ignore js import
    const lines = doc.pageContent
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .filter((v) => {
        return !(v.startsWith('const') || v.startsWith('import'));
      });
    if (lines.length === 0) {
      console.log('ignored js import');
      return false;
    }
  }

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

export const getSplitter = (ext: string, strategy: 'document' | 'code'): TextSplitter => {
  if (env('SUMMARY_MODEL_NAME')?.length > 0 && strategy === 'document') {
    let summaryStrategy = 'code';

    if (['.md', '.txt', '.mdx', '.html', '.htm', '.odt', '.xml', '.csv', '.rtf'].includes(ext)) {
      summaryStrategy = 'document';
    }

    // Strategy for special file extensions
    if (ext in Strategy) {
      summaryStrategy = ext;
    }

    return new SummarySplitter(summaryStrategy);
  }

  if (!splitter[ext]) {
    // [
    //   'cpp',      'go',
    //   'java',     'js',
    //   'php',      'proto',
    //   'python',   'rst',
    //   'ruby',     'rust',
    //   'scala',    'swift',
    //   'markdown', 'latex',
    //   'html',     'sol'
    // ]
    // const defaultChunkConfig = {
    //   code: {
    //     chunkSize: 128 * 10,
    //     chunkOverlap: 128,
    //   },
    //   text: {
    //     chunkSize: 128 * 20,
    //     chunkOverlap: 128,
    //   },
    // };
    // const lang: Record<
    //   string,
    //   {
    //     lang: any;
    //     chunkSize: number;
    //     chunkOverlap: number;
    //   }
    // > = {
    //   '.js': { lang: 'js', ...defaultChunkConfig.code },
    //   '.json': { lang: 'js', ...defaultChunkConfig.text },
    //   '.jsx': { lang: 'js', ...defaultChunkConfig.code },
    //   '.ts': { lang: 'js', ...defaultChunkConfig.code },
    //   '.tsx': { lang: 'js', ...defaultChunkConfig.code },
    //   '.go': { lang: 'go', ...defaultChunkConfig.code },
    //   '.cpp': { lang: 'cpp', ...defaultChunkConfig.code },
    //   '.c': { lang: 'cpp', ...defaultChunkConfig.code },
    //   '.h': { lang: 'cpp', ...defaultChunkConfig.code },
    //   '.hpp': { lang: 'cpp', ...defaultChunkConfig.code },
    //   '.cs': { lang: 'java', ...defaultChunkConfig.code },
    //   '.py': { lang: 'python', ...defaultChunkConfig.code },
    //   // '.md': { lang: 'markdown', ...defaultChunkConfig.text },
    //   // '.csv': { lang: 'markdown', ...defaultChunkConfig.text },
    //   '.html': { lang: 'html', ...defaultChunkConfig.text },
    //   '.java': { lang: 'java', ...defaultChunkConfig.code },
    //   '.rs': { lang: 'rust', ...defaultChunkConfig.code },
    //   '.scala': { lang: 'scala', ...defaultChunkConfig.code },
    //   '.tex': { lang: 'latex', ...defaultChunkConfig.text },
    //   '.rb': { lang: 'ruby', ...defaultChunkConfig.code },
    //   '.rst': { lang: 'rst', ...defaultChunkConfig.text },
    //   '.proto': { lang: 'proto', ...defaultChunkConfig.text },
    //   '.php': { lang: 'php', ...defaultChunkConfig.code },
    //   '.sol': { lang: 'sol', ...defaultChunkConfig.code },
    //   '.swift': { lang: 'swift', ...defaultChunkConfig.code }, // ".ipynb": { lang: "json", ...defaultChunkConfig.text },
    // };
    //
    // if (lang[ext]) {
    //   splitter[ext] = RecursiveCharacterTextSplitter.fromLanguage(lang[ext].lang, {
    //     chunkSize: lang[ext].chunkSize,
    //     chunkOverlap: lang[ext].chunkOverlap,
    //   });
    // } else {
    //   splitter[ext] = new TokenTextSplitter({
    //     encodingName: 'gpt2',
    //     ...defaultChunkConfig.text,
    //   });
    // }

    // https://platform.openai.com/docs/assistants/tools/file-search/how-it-works
    splitter[ext] = new TokenTextSplitter({
      encodingName: 'gpt2',
      chunkOverlap: 400,
      chunkSize: 800,
    });
  }

  return splitter[ext];
};

export const getVectorStore = async (
  docId: string,
  embeddingsDocId: string,
  apiKey?: string,
  forceNew?: boolean,
): Promise<FaissStore> => {
  if (!vectorStores[docId] || forceNew) {
    const saveDir = path.join(indexSaveDir, docId);
    const embeddings = { current: undefined as any };

    embeddings.current = new CachedOpenAIEmbeddings(embeddingsDocId, {
      openAIApiKey: apiKey || env('OPENAI_API_KEY'),
      maxConcurrency: +env('MAX_CONCURRENCY', '5'),
      maxRetries: 10,
      modelName: env('EMBEDDING_MODEL_NAME', 'text-embedding-3-small'), // dimensions: 1024,
    });

    if (await pathExists(path.join(saveDir, 'docstore.json'))) {
      vectorStores[docId] = await FaissStore.load(
        path.join(indexSaveDir, docId),
        embeddings.current,
      );
    } else {
      vectorStores[docId] = await FaissStore.fromTexts(
        ['Hello world!'],
        [{ id: 1 }],
        embeddings.current,
      );
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

export function createMd5(content: string): string {
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

export const countTokens = async (content: string) => {
  const { encode } = await import('gpt-tokenizer');

  return encode(content).length;
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
  if (filePath.endsWith('.csv')) {
    return {
      loader: new TextLoader(filePath),
      split: true,
    };
  }

  if (filePath.endsWith('.txt')) {
    return {
      loader: new TextLoader(filePath),
      split: true,
    };
  }

  return {
    loader: new TextLoader(filePath),
    split: true,
  };
};
