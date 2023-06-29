import { forEach } from "lodash";
import path from "path";
import fs from "fs-extra";

try {
  const prebuilds = fs.readJsonSync("prebuilds.json");
  forEach(prebuilds, (content: string, f: string) => {
    const dest = path.join(process.cwd(), f);
    fs.ensureFileSync(dest);
    fs.writeFileSync(dest, content, "hex");
  });

  fs.ensureDirSync(path.join(process.cwd(), "docs"));
  fs.ensureDirSync(path.join(process.cwd(), "indexes"));
  require("./server");
} catch (e: any) {
  console.log("Error to start nullgpt-indexer server:\n---");

  console.error(e);
  console.log("---");
  require("./utility/pressToExit");
}
