import cors from 'cors';
import express from 'express';

import indexHandler from './handler';
import addDocHandler from './handler/add-doc';
import docsHandler from './handler/docs';
import getVersionHandler from './handler/get-version';
import gitPullHandler from './handler/git-pull';
import managerHandler from './handler/manager';
import queryHandler from './handler/query';
import removeIndexHandler from './handler/remove-index';
import updateDocHandler from './handler/update-doc';
import { summaryCode } from './utility/OpenAI';

require('./constant');

// if (embeddingsType === "tensorflow") {
//   require("@tensorflow/tfjs-core"); /* or @tensorflow/tfjs-node */
//   require("@tensorflow/tfjs-backend-cpu");
// }

const app = express();
const port = process.env.SERVER_PORT || 3456;

app.use(express.json());
app.use(cors()); // Add this line to enable CORS for all routes

app.post('/api/index', indexHandler);
app.post('/api/remove-index', removeIndexHandler);
app.post('/api/query', queryHandler);
app.get('/api/docs', docsHandler);
app.get('/api/manager', managerHandler);
app.post('/api/update-doc', updateDocHandler);
app.post('/api/add-doc', addDocHandler);
app.post('/api/git-pull', gitPullHandler);
app.get('/api/get-version', getVersionHandler);

app.listen(port, () => {
  console.log(`The nullgpt-indexer service is now available at: http://localhost:${port}`);
  console.log(
    'Please visit https://gpt.dongnv.dev to engage in a conversation with your documents.',
  );
});
