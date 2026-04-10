import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(currentDir, "..");

const datasetSourceDir = resolve(repoRoot, "packages/dataset/assets");
const datasetTargetDir = resolve(repoRoot, "apps/tauri/src-tauri/resources/dataset");

mkdirSync(datasetTargetDir, { recursive: true });
cpSync(datasetSourceDir, datasetTargetDir, { recursive: true });

console.log(`Prepared Tauri assets in ${datasetTargetDir}`);
