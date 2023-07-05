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
  fileExtensions: string[],
  cb: (f: string) => Promise<any>
): Promise<void> {
  const stream = fg.stream(
    [...fileExtensions, ".alias"].map((ext) => `**/*${ext}`),
    {
      cwd: dir,
      dot: false,
      onlyFiles: true,
    }
  );
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

  if ([".cs"].includes(path.extname(doc.metadata.source))) {
    // ignore c# import
    const lines = doc.pageContent
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .filter((v) => !v.startsWith("using"));
    if (lines.length === 0) {
      return false;
    }
  } else if (
    [".js", ".jsx", ".ts", "tsx"].includes(path.extname(doc.metadata.source))
  ) {
    // ignore js import
    const lines = doc.pageContent
      .split("\n")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .filter((v) => {
        return !(v.startsWith("const") || v.startsWith("import"));
      });
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
    const defaultChunkConfig = {
      code: {
        chunkSize: 128 * 10,
        chunkOverlap: 128 * 2,
      },
      text: {
        chunkSize: 128 * 20,
        chunkOverlap: 128 * 4,
      },
    };
    const lang: Record<
      string,
      {
        lang: any;
        chunkSize: number;
        chunkOverlap: number;
      }
    > = {
      ".js": { lang: "js", ...defaultChunkConfig.code },
      ".json": { lang: "js", ...defaultChunkConfig.text },
      ".jsx": { lang: "js", ...defaultChunkConfig.code },
      ".ts": { lang: "js", ...defaultChunkConfig.code },
      ".tsx": { lang: "js", ...defaultChunkConfig.code },
      ".go": { lang: "go", ...defaultChunkConfig.code },
      ".cpp": { lang: "cpp", ...defaultChunkConfig.code },
      ".c": { lang: "cpp", ...defaultChunkConfig.code },
      ".h": { lang: "cpp", ...defaultChunkConfig.code },
      ".hpp": { lang: "cpp", ...defaultChunkConfig.code },
      ".cs": { lang: "java", ...defaultChunkConfig.code },
      ".py": { lang: "python", ...defaultChunkConfig.code },
      ".md": { lang: "markdown", ...defaultChunkConfig.text },
      ".html": { lang: "html", ...defaultChunkConfig.text },
      ".java": { lang: "java", ...defaultChunkConfig.code },
      ".rs": { lang: "rust", ...defaultChunkConfig.code },
      ".scala": { lang: "scala", ...defaultChunkConfig.code },
      ".tex": { lang: "latex", ...defaultChunkConfig.text },
      ".rb": { lang: "ruby", ...defaultChunkConfig.code },
      ".rst": { lang: "rst", ...defaultChunkConfig.text },
      ".proto": { lang: "proto", ...defaultChunkConfig.text },
      ".php": { lang: "php", ...defaultChunkConfig.code },
      ".sol": { lang: "sol", ...defaultChunkConfig.code },
      ".swift": { lang: "swift", ...defaultChunkConfig.code },
      // ".ipynb": { lang: "json", ...defaultChunkConfig.text },
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
        ...defaultChunkConfig.text,
      });
    }
  }

  return splitter[ext];
};

export const getVectorStore = async (
  docId: string,
  embeddingsDocId: string,
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
    const embeddings = new CachedOpenAIEmbeddings(embeddingsDocId, {
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

export function isMD5(str: string) {
  // Regular expression pattern for MD5 hash
  const md5Pattern = /^[a-f0-9]{32}$/;

  return md5Pattern.test(str);
}

import { exec } from "child_process";

export function gitPull(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec("git pull", { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve([stdout, stderr].join("\n\n"));
      }
    });
  });
}
