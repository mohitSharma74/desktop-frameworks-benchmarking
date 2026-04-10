import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(currentDir, "..");

const datasetSourceDir = resolve(repoRoot, "packages/dataset/assets");
const datasetTargetDir = resolve(repoRoot, "apps/electrobun/resources/dataset");
const appShellCssSource = resolve(repoRoot, "packages/app-shell/src/styles.css");
const appShellCssTarget = resolve(repoRoot, "apps/electrobun/src/mainview/app-shell.css");

mkdirSync(datasetTargetDir, { recursive: true });
cpSync(datasetSourceDir, datasetTargetDir, { recursive: true });
cpSync(appShellCssSource, appShellCssTarget);

writeFileSync(
  resolve(repoRoot, "apps/electrobun/src/mainview/index.css"),
  '@import "./app-shell.css";\n',
  "utf8"
);

console.log(`Prepared Electrobun assets in ${datasetTargetDir}`);
