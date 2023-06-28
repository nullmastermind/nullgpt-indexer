require("./const");

import express from "express";
import cors from "cors";
import indexHandler from "./handler";
import queryHandler from "./handler/query";
import docsHandler from "./handler/docs";
import { embeddingsType } from "./const";

if (embeddingsType === "tensorflow") {
  require("@tensorflow/tfjs-core"); /* or @tensorflow/tfjs-node */
  require("@tensorflow/tfjs-backend-cpu");
}

const app = express();
const port = 3456;

app.use(express.json());
app.use(cors()); // Add this line to enable CORS for all routes

app.post("/api/index", indexHandler);
app.post("/api/query", queryHandler);
app.get("/api/docs", docsHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
