import cors from 'cors';
import express from 'express';

import indexHandler from './api';
import addDocHandler from './api/add-doc';
import docsHandler from './api/docs';
import getVersionHandler from './api/get-version';
import gitPullHandler from './api/git-pull';
import managerHandler from './api/manager';
import queryHandler from './api/query';
import removeIndexHandler from './api/remove-index';
import updateDocHandler from './api/update-doc';

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
