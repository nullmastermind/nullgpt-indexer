import fs from 'fs-extra';
import { forEach } from 'lodash';
import path from 'path';
import readline from 'readline';

require('dotenv').config({
  path: require('path').join(process.cwd(), '.env'),
});

function _start() {
  try {
    const prebuilds = fs.readJsonSync('prebuilds.json');
    forEach(prebuilds, (content: string, f: string) => {
      const dest = path.join(process.cwd(), f);
      fs.ensureFileSync(dest);
      fs.writeFileSync(dest, content, 'hex');
    });

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

if (process.env.OPENAI_API_KEY) {
  _start();
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Please enter your OPENAI_API_KEY value: ', (apiKey) => {
    // Write the API key to the .env file
    fs.writeFileSync('.env', `OPENAI_API_KEY=${apiKey}`);

    console.log('API key has been saved to .env file.');

    rl.close();

    _start();
  });
}
