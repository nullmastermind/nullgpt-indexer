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

  async del(key: string) {
    return this.db.del(key);
  }

  async eachKey(cb: (key: string) => Promise<any>) {
    for await (const key of this.db.keys()) {
      await cb(key);
    }
  }

  getDb() {
    return this.db;
  }
}

export default Db;
