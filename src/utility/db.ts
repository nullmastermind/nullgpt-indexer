import { Level } from 'level';
import path from 'path';

import { indexSaveDir } from '../constant';

class Db {
  private readonly db: any;

  constructor(name: string) {
    this.db = new Level(path.join(indexSaveDir, name), {
      valueEncoding: 'json',
    });
  }

  async get(key: string) {
    let value = this.db.get(key);

    try {
      value = await this.db.get(key);
      // This field is for removing trash in features.
      await this.db.set(`${key}:get_at`, Date.now());
    } catch (e) {}

    return value;
  }

  async set(key: string, value: any) {
    return this.db.put(key, value);
  }

  async del(key: string) {
    try {
      await this.db.del(`${key}:get_at`);
    } catch (e) {}
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
