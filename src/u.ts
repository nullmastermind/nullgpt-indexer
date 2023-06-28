import { spawnSync } from "child_process";
import { platform } from "os";
import path from "path";
import * as fs from "fs-extra";
import { pathExists } from "fs-extra";
import fg from "fast-glob";
import { indexSaveDir, splitter, vectorStores } from "./const";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "langchain/vectorstores/faiss";
import { createHash } from "crypto";
import CachedOpenAIEmbeddings from "./utility/CachedOpenAIEmbeddings";
import ignore, { Ignore } from "ignore";
import { forEach } from "lodash";
import { Document } from "langchain/document";

const platformName = platform()
  .toLowerCase()
  .replace(/[0-9]/g, "")
  .replace("darwin", "macos");

export function openExplorerIn(
  path: string,
  callback: (error: Error | null) => void
): void {
  let cmd = "";
  switch (platformName) {
    case "win":
      path = path || "=";
      cmd = "explorer";
      break;
    case "linux":
      path = path || "/";
      cmd = "xdg-open";
      break;
    case "macos":
      path = path || "/";
      cmd = "open";
      break;
  }
  const result = spawnSync(cmd, [path], { stdio: "inherit" });
  if (result.error) {
    return callback(result.error);
  }
  callback(null);
}

export async function listFilesRecursively(
  dir: string,
  cb: (f: string) => Promise<any>
): Promise<void> {
  const stream = fg.stream("**", {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const handlers = [];
  const ignores = await getIgnores(dir);
  const dirIgnoresMap: Record<string, Ignore[]> = {};

  for await (const entry of stream) {
    const fullPath = path.join(dir, entry as string);
    const dirname = path.dirname(fullPath);

    if (path.extname(fullPath) === ".alias") {
      const aliasEntries = (await fs.readFile(fullPath, "utf8"))
        .split("\n")
        .map((v) => v.trim())
        .filter((v) => v.length);
      for (let i = 0; i < aliasEntries.length; i++) {
        const aliasEntry = aliasEntries[i];
        if (await pathExists(aliasEntry)) {
          if (await isDirectory(aliasEntry)) {
            await listFilesRecursively(aliasEntry, cb);
          } else {
            handlers.push(cb(aliasEntry));
          }
        }
      }
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

export async function getIgnores(
  dir: string
): Promise<[string[], Record<string, Ignore>]> {
  const stream = fg.stream("**/.gitignore", {
    cwd: dir,
    dot: false,
    onlyFiles: true,
  });
  const keys = [];
  const mapValue: Record<string, Ignore> = {};

  for await (const entry of stream) {
    const fullPath = path.join(dir, entry as string);
    const dirname = path.dirname(fullPath);
    const gitignoreContent = await fs.readFile(fullPath, "utf-8");
    mapValue[dirname] = ignore().add(gitignoreContent);
    keys.push(dirname);
  }

  keys.sort((a, b) => {
    return a.length - b.length;
  });

  return [keys, mapValue];
}

export const filterDocIndex = (doc: Document<Record<string, any>>): boolean => {
  // filter hash
  if (
    !doc.pageContent.includes(" ") &&
    !doc.pageContent.includes("\t") &&
    !doc.pageContent.includes(";") &&
    !doc.pageContent.includes("\n")
  ) {
    return false;
  }

  // filter c# import
  if ([".cs"].includes(path.extname(doc.metadata.source))) {
    const lines = doc.pageContent
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .filter((v) => !v.startsWith("using"));
    if (lines.length === 0) {
      return false;
    }
  }

  return true;
};

export const getSplitter = (ext: string): RecursiveCharacterTextSplitter => {
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
    const lang: Record<
      string,
      {
        lang: any;
        chunkSize: number;
        chunkOverlap: number;
      }
    > = {
      ".js": { lang: "js", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".json": { lang: "js", chunkSize: 128 * 13, chunkOverlap: 128 },
      ".jsx": { lang: "js", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".ts": { lang: "js", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".tsx": { lang: "js", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".go": { lang: "go", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".cpp": { lang: "cpp", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".c": { lang: "cpp", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".h": { lang: "cpp", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".hpp": { lang: "cpp", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".cs": { lang: "java", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".py": { lang: "python", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".md": { lang: "markdown", chunkSize: 128 * 13, chunkOverlap: 128 },
      ".html": { lang: "html", chunkSize: 128 * 13, chunkOverlap: 128 },
      ".java": { lang: "java", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".rs": { lang: "rust", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".scala": { lang: "scala", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".tex": { lang: "latex", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".rb": { lang: "ruby", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".rst": { lang: "rst", chunkSize: 128 * 13, chunkOverlap: 128 },
      ".proto": { lang: "proto", chunkSize: 128 * 13, chunkOverlap: 128 },
      ".php": { lang: "php", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".sol": { lang: "sol", chunkSize: 128 * 8, chunkOverlap: 128 },
      ".swift": { lang: "swift", chunkSize: 128 * 8, chunkOverlap: 128 },
    };

    if (lang[ext]) {
      splitter[ext] = RecursiveCharacterTextSplitter.fromLanguage(
        lang[ext].lang,
        {
          chunkSize: lang[ext].chunkSize,
          chunkOverlap: lang[ext].chunkOverlap,
        }
      );
    } else {
      splitter[ext] = new RecursiveCharacterTextSplitter({
        chunkSize: 128 * 13,
        chunkOverlap: 128,
      });
    }
  }

  return splitter[ext];
};

export const getVectorStore = async (
  docId: string,
  apiKey?: string,
  forceNew?: boolean
): Promise<FaissStore> => {
  if (!vectorStores[docId] || forceNew) {
    const saveDir = path.join(indexSaveDir, docId);
    // const embeddings =
    //   embeddingsType === "tensorflow"
    //     ? new TensorFlowEmbeddings()
    //     : new CachedOpenAIEmbeddings({
    //         openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
    //       });
    const embeddings = new CachedOpenAIEmbeddings({
      openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
    });

    if (await pathExists(path.join(saveDir, "docstore.json"))) {
      vectorStores[docId] = await FaissStore.load(
        path.join(indexSaveDir, docId),
        embeddings
      );
    } else {
      vectorStores[docId] = await FaissStore.fromTexts(
        ["Hello world!"],
        [{ id: 1 }],
        embeddings
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
  return createHash("md5").update(content).digest("hex");
}
