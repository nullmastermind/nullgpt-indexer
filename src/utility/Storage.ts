import { ensureDirSync } from 'fs-extra';
import { Level } from 'level';
import path from 'path';

import { indexSaveDir } from '../constant';

class Storage {
  levelDb: any;

  constructor(name: string) {
    const saveDir = path.join(indexSaveDir, '.storage', name);

    ensureDirSync(saveDir);

    this.levelDb = new Level(saveDir, {
      valueEncoding: 'json',
    });
  }

  async get(key: string) {
    let value = undefined;

    try {
      value = await this.levelDb.get(key);
      await this.updateDate(key);
    } catch (e) {}

    return value;
  }

  async set(key: string, value: any) {
    await this.updateDate(key);
    return this.levelDb.put(key, value);
  }

  async del(key: string) {
    try {
      await this.levelDb.del(`${key}:get_at`);
    } catch (e) {}
    return this.levelDb.del(key);
  }

  async eachKey(cb: (key: string) => Promise<any>) {
    for await (const key of this.levelDb.keys()) {
      await cb(key);
    }
  }

  async updateDate(key: string) {
    try {
      await this.levelDb.del(`${key}:get_at`);
    } catch (e) {}
  }

  getDb() {
    return this.levelDb;
  }
}

export default Storage;
