import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const resultsRoot = resolve(repoRoot, "benchmarks/results");

function parseArgs(argv) {
  return {
    input: argv[0] ? resolve(process.cwd(), argv[0]) : null
  };
}

function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
  }

  return Number(sorted[middle].toFixed(2));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function groupBy(items, keySelector) {
  const map = new Map();
  for (const item of items) {
    const key = keySelector(item);
    const values = map.get(key) ?? [];
    values.push(item);
    map.set(key, values);
  }

  return map;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return typeof value === "number" ? value.toFixed(2) : String(value);
}

function summarizeResults(results) {
  const grouped = groupBy(results, (result) => `${result.framework}:${result.scenario}:${result.launch}`);
  const rows = [];

  for (const [key, group] of grouped.entries()) {
    const [framework, scenario, launch] = key.split(":");

    rows.push({
      framework,
      scenario,
      launch,
      interactiveMs: median(group.map((result) => result.startup?.interactiveReady).filter((value) => typeof value === "number")),
      firstPaintMs: median(group.map((result) => result.startup?.firstPaint).filter((value) => typeof value === "number")),
      idleMb: median(group.map((result) => result.memory?.idleMb).filter((value) => typeof value === "number")),
      peakMb: median(group.map((result) => result.memory?.peakMb).filter((value) => typeof value === "number")),
      avgCpu: median(group.map((result) => result.cpu?.averagePercent).filter((value) => typeof value === "number")),
      peakCpu: median(group.map((result) => result.cpu?.peakPercent).filter((value) => typeof value === "number")),
      taskMs: median(group.map((result) => result.task?.durationMs).filter((value) => typeof value === "number")),
      appBundleBytes: median(group.map((result) => result.artifacts?.appBundleBytes).filter((value) => typeof value === "number")),
      distributableBytes: median(group.map((result) => result.artifacts?.distributableBytes).filter((value) => typeof value === "number"))
    });
  }

  return rows;
}

function renderMarkdown(rows, sourcePath) {
  const lines = [];
  lines.push(`# Benchmark Summary`);
  lines.push("");
  lines.push(`Source: \`${sourcePath}\``);
  lines.push("");
  lines.push("| Framework | Scenario | Launch | Interactive (ms) | First Paint (ms) | Idle MB | Peak MB | Avg CPU % | Peak CPU % | Task (ms) | .app bytes | Artifact bytes |");
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const row of rows) {
    lines.push(
      `| ${row.framework} | ${row.scenario} | ${row.launch} | ${formatNumber(row.interactiveMs)} | ${formatNumber(row.firstPaintMs)} | ${formatNumber(row.idleMb)} | ${formatNumber(row.peakMb)} | ${formatNumber(row.avgCpu)} | ${formatNumber(row.peakCpu)} | ${formatNumber(row.taskMs)} | ${formatNumber(row.appBundleBytes)} | ${formatNumber(row.distributableBytes)} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function findLatestResultsFile() {
  const { readdir } = await import("node:fs/promises");
  const entries = (await readdir(resultsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const latestDir = entries[0];
  if (!latestDir) {
    throw new Error("No benchmark results found.");
  }

  return resolve(resultsRoot, latestDir, "results.json");
}

async function main() {
  const { input } = parseArgs(process.argv.slice(2));
  const sourcePath = input ?? (await findLatestResultsFile());

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing results file: ${sourcePath}`);
  }

  const resultsFile = await readJson(sourcePath);
  const rows = summarizeResults(resultsFile.results);
  const markdown = renderMarkdown(rows, sourcePath);
  console.log(markdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
