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
    ignore: getIgnoredFiles(dir),
    onlyFiles: true,
  });

  const handlers = [];

  for await (const entry of stream) {
    const fullPath = path.join(dir, entry as string);
    handlers.push(cb(fullPath));
  }

  await Promise.all(handlers);
}

function getIgnoredFiles(dir: string): string[] {
  const gitignorePath = path.join(dir, ".gitignore");
  let ignoredFiles: string[] = [];

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    ignoredFiles = gitignoreContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  }

  return ignoredFiles.map((v) => {
    if (!v.startsWith("/")) {
      v = "**/" + v;
    }

    return v;
  });
}

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
    const lang: Record<string, any> = {
      ".js": "js",
      ".jsx": "js",
      ".ts": "js",
      ".tsx": "js",
      ".go": "go",
      ".cpp": "cpp",
      ".c": "cpp",
      ".h": "cpp",
      ".hpp": "cpp",
      ".cs": "cpp",
      ".py": "python",
      ".md": "markdown",
      ".html": "html",
      ".java": "java",
    };

    if (lang[ext]) {
      splitter[ext] = RecursiveCharacterTextSplitter.fromLanguage(lang[ext], {
        chunkSize: 128 * 8,
        chunkOverlap: 128,
      });
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
