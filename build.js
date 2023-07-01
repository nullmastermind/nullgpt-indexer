const { compile } = require("nexe");
const path = require("path");
const fg = require("fast-glob");
const { forEach } = require("lodash");
const fs = require("fs");

const prebuilds = ["node_modules/classic-level/prebuilds/**"];
const prebuildFiles = fg.sync(prebuilds);
const prebuildsJson = {};

forEach(prebuildFiles, (f) => {
  prebuildsJson[f] = fs.readFileSync(f, "hex");
});

fs.writeFileSync("prebuilds.json", JSON.stringify(prebuildsJson));

async function main() {
  await compile({
    input: "build/_exec.js",
    output: "dist/nullgpt-indexer",
    resources: [
      // "node_modules/classic-level/prebuilds/**",
      "node_modules/gpt-3-encoder/**",
      "prebuilds.json",
    ],
    vcBuild: ["nosign", "release", "openssl-no-asm"],
    // build: true,
    // ico: "bot.ico",
  });
}

main().finally();
