import fs from 'fs-extra';
import { map } from 'lodash';
import path from 'path';

require('dotenv').config({
  path: require('path').join(process.cwd(), '.env'),
});

async function startApplication() {
  try {
    const prebuilds = fs.readJsonSync('prebuilds.json');

    const fileWritePromises = map(prebuilds, async (fileContent: string, filePath: string) => {
      const destinationPath = path.join(process.cwd(), filePath);
      return fs
        .ensureFile(destinationPath)
        .then(() => fs.writeFile(destinationPath, fileContent, 'hex'));
    });

    await Promise.all(fileWritePromises);

    fs.ensureDirSync(path.join(process.cwd(), 'docs'));
    fs.ensureDirSync(path.join(process.cwd(), 'indexes'));

    require('./server');
  } catch (e: any) {
    console.log('Error to start nullgpt-indexer server:\n---');

    console.error(e);
    console.log('---');

    require('./utility/pressToExit');
  }
}

void startApplication();
