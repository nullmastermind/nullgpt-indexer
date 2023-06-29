require("./const");

import express from "express";
import cors from "cors";
import indexHandler from "./handler";
import queryHandler from "./handler/query";
import docsHandler from "./handler/docs";
import removeIndexHandler from "./handler/remove-index";

// if (embeddingsType === "tensorflow") {
//   require("@tensorflow/tfjs-core"); /* or @tensorflow/tfjs-node */
//   require("@tensorflow/tfjs-backend-cpu");
// }

const app = express();
const port = 3456;

app.use(express.json());
app.use(cors()); // Add this line to enable CORS for all routes

app.post("/api/index", indexHandler);
app.post("/api/remove-index", removeIndexHandler);
app.post("/api/query", queryHandler);
app.get("/api/docs", docsHandler);

app.listen(port, () => {
  console.log("---");
  console.log(`The nullgpt-indexer service is now available.`);
  console.log(
    "Please visit https://gpt.dongnv.dev to engage in a conversation with your documents."
  );
  console.log("---");
});
