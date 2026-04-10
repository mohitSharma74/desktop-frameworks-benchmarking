import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(currentDir, "..");
const sourceDir = resolve(repoRoot, "packages/dataset/assets");
const targetDir = resolve(repoRoot, "apps/electron/resources/dataset");

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Copied dataset assets to ${targetDir}`);

