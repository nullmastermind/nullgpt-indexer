import Db from "./utility/db";
import path from "path";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "langchain/vectorstores/faiss";

require("dotenv").config({
  path: require("path").join(process.cwd(), ".env"),
});

export const indexers = {};
export const docsDir = path.join(process.cwd(), "docs");
export const indexSaveDir = path.join(process.cwd(), "indexes");
export const splitter: Record<string, RecursiveCharacterTextSplitter> = {};
export const vectorStores: Record<string, FaissStore> = {};
export type TEmbeddingsType = "tensorflow" | "openai";
export const embeddingsType = (process.env.EMBEDDINGS ||
  "openai") as TEmbeddingsType;
export const db = new Db("_db");
