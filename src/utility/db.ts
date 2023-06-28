import path from "path";
import { indexSaveDir } from "../const";

const { Level } = require("level");

class Db {
  private db: any;

  constructor(name: string) {
    this.db = new Level(path.join(indexSaveDir, name), {
      valueEncoding: "json",
    });
  }

  async get(key: string) {
    return this.db.get(key).catch(() => Promise.resolve(undefined));
  }

  async set(key: string, value: any) {
    return this.db.put(key, value);
  }
}

export default Db;
