import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const resultsRoot = resolve(repoRoot, "benchmarks/results");

const FRAMEWORKS = {
  electron: {
    executable: resolve(
      repoRoot,
      "apps/electron/release/mac-arm64/Desktop Framework Benchmark Electron.app/Contents/MacOS/Desktop Framework Benchmark Electron"
    ),
    appBundle: resolve(
      repoRoot,
      "apps/electron/release/mac-arm64/Desktop Framework Benchmark Electron.app"
    ),
    distributable: resolve(
      repoRoot,
      "apps/electron/release/Desktop Framework Benchmark Electron-0.1.0-arm64.dmg"
    )
  },
  electrobun: {
    executable: resolve(
      repoRoot,
      "apps/electrobun/build/stable-macos-arm64/Desktop Framework Benchmark Electrobun.app/Contents/MacOS/launcher"
    ),
    appBundle: resolve(
      repoRoot,
      "apps/electrobun/build/stable-macos-arm64/Desktop Framework Benchmark Electrobun.app"
    ),
    bundleArchive: resolve(
      repoRoot,
      "apps/electrobun/build/stable-macos-arm64/DesktopFrameworkBenchmarkElectrobun.app.tar.zst"
    ),
    decompressor: resolve(
      repoRoot,
      "apps/electrobun/build/dev-macos-arm64/Desktop Framework Benchmark Electrobun-dev.app/Contents/MacOS/zig-zstd"
    ),
    distributable: resolve(
      repoRoot,
      "apps/electrobun/artifacts/stable-macos-arm64-DesktopFrameworkBenchmarkElectrobun.dmg"
    )
  },
  tauri: {
    executable: resolve(
      repoRoot,
      "apps/tauri/src-tauri/target/release/bundle/macos/Desktop Framework Benchmark Tauri.app/Contents/MacOS/Desktop Framework Benchmark Tauri"
    ),
    appBundle: resolve(
      repoRoot,
      "apps/tauri/src-tauri/target/release/bundle/macos/Desktop Framework Benchmark Tauri.app"
    ),
    distributable: resolve(
      repoRoot,
      "apps/tauri/src-tauri/target/release/bundle/dmg/Desktop Framework Benchmark Tauri_0.1.0_aarch64.dmg"
    )
  }
};

const DEFAULTS = {
  framework: "all",
  scenario: "startup",
  runs: 1,
  launch: "cold",
  timeoutMs: 30000,
  stabilizationMs: 2000,
  sampleIntervalMs: 500,
  automationDelayMs: 250,
  outputDir: resultsRoot
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--framework" && next) {
      options.framework = next;
      index += 1;
    } else if (token === "--scenario" && next) {
      options.scenario = next;
      index += 1;
    } else if (token === "--runs" && next) {
      options.runs = Number(next);
      index += 1;
    } else if (token === "--launch" && next) {
      options.launch = next;
      index += 1;
    } else if (token === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
    } else if (token === "--stabilization-ms" && next) {
      options.stabilizationMs = Number(next);
      index += 1;
    } else if (token === "--sample-interval-ms" && next) {
      options.sampleIntervalMs = Number(next);
      index += 1;
    } else if (token === "--output-dir" && next) {
      options.outputDir = resolve(process.cwd(), next);
      index += 1;
    } else if (token === "--help") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/run-benchmark.mjs [options]

Options:
  --framework <electron|electrobun|tauri|all>
  --scenario <startup|idle-memory|heavy-task|artifacts>
  --runs <number>
  --launch <cold|warm>
  --timeout-ms <number>
  --stabilization-ms <number>
  --sample-interval-ms <number>
  --output-dir <path>
`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function ensureCleanDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function readJsonLines(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const contents = await readFile(filePath, "utf8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getStageTime(records, stage) {
  return records.find((record) => record.stage === stage)?.relativeMs;
}

function getEventRecord(records, eventName) {
  return records.find((record) => record.eventName === eventName);
}

async function sampleProcess(pid) {
  const output = await runCommand("ps", ["-o", "pid=,rss=,%cpu=,command=", "-p", String(pid)]);
  const line = output.trim();
  if (!line) {
    return null;
  }

  const match = line.match(/^(\d+)\s+(\d+)\s+([0-9.]+)\s+(.*)$/);
  if (!match) {
    return null;
  }

  return {
    pid: Number(match[1]),
    rssMb: Number((Number(match[2]) / 1024).toFixed(2)),
    cpuPercent: Number(match[3]),
    command: match[4]
  };
}

function runCommand(command, args) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", rejectCommand);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveCommand(stdout);
        return;
      }

      rejectCommand(new Error(`${command} ${args.join(" ")} failed with code ${code}\n${stderr}`));
    });
  });
}

async function measurePathBytes(path) {
  if (!existsSync(path)) {
    return null;
  }

  const output = await runCommand("du", ["-sk", path]);
  const kilobytes = Number(output.trim().split(/\s+/)[0]);
  return kilobytes * 1024;
}

async function resolveExecutablePath(framework) {
  const config = FRAMEWORKS[framework];

  if (framework !== "electrobun") {
    return config.executable;
  }

  const stagedDir = resolve("/tmp", "electrobun-benchmark-stable");
  const stagedTar = resolve(stagedDir, basename(config.bundleArchive, ".zst"));
  const stagedAppBundle = resolve(stagedDir, "Desktop Framework Benchmark Electrobun.app");
  const stagedExecutable = resolve(stagedAppBundle, "Contents/MacOS/launcher");

  if (existsSync(stagedExecutable)) {
    return stagedExecutable;
  }

  await rm(stagedDir, { recursive: true, force: true });
  await mkdir(stagedDir, { recursive: true });

  if (existsSync(config.appBundle)) {
    await runCommand("cp", ["-R", config.appBundle, stagedAppBundle]);
  } else if (existsSync(config.bundleArchive)) {
    if (!existsSync(config.decompressor)) {
      throw new Error(`Missing Electrobun decompressor: ${config.decompressor}`);
    }

    await runCommand(config.decompressor, [
      "decompress",
      "-i",
      config.bundleArchive,
      "-o",
      stagedTar,
      "--no-timing"
    ]);
    await runCommand("tar", ["-xf", stagedTar, "-C", stagedDir]);
  } else {
    throw new Error(
      `Missing Electrobun app bundle and archive: ${config.appBundle} / ${config.bundleArchive}`
    );
  }

  if (!existsSync(stagedExecutable)) {
    throw new Error(`Failed to stage Electrobun executable: ${stagedExecutable}`);
  }

  return stagedExecutable;
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

async function waitForCondition({ logFile, child, timeoutMs, predicate }) {
  const startedAt = Date.now();
  let lastRecords = [];

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null && child.exitCode !== 0) {
      throw new Error(`App exited early with code ${child.exitCode}`);
    }

    lastRecords = await readJsonLines(logFile);
    const match = predicate(lastRecords);
    if (match) {
      return {
        records: lastRecords,
        match
      };
    }

    await sleep(100);
  }

  throw new Error(`Timed out waiting for benchmark condition. Last records: ${JSON.stringify(lastRecords.slice(-5), null, 2)}`);
}

async function killApp(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const startedAt = Date.now();
  while (child.exitCode === null && Date.now() - startedAt < 3000) {
    await sleep(100);
  }

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function launchApp({ framework, logFile, scenario, automationDelayMs }) {
  const config = FRAMEWORKS[framework];
  const executable = await resolveExecutablePath(framework);

  if (!existsSync(executable)) {
    throw new Error(`Missing executable for ${framework}: ${executable}`);
  }

  const env = {
    ...process.env,
    BENCH_OUTPUT_FILE: logFile
  };

  if (scenario === "startup" || scenario === "idle-memory") {
    env.BENCH_AUTOMATION_MODE = "startup";
    env.BENCH_AUTOMATION_DELAY_MS = String(automationDelayMs);
  } else if (scenario === "heavy-task") {
    env.BENCH_AUTOMATION_MODE = "heavy-task";
    env.BENCH_AUTOMATION_DELAY_MS = String(automationDelayMs);
  }

  const child = spawn(executable, [], {
    cwd: dirname(executable),
    env,
    stdio: "ignore"
  });

  return child;
}

function extractStartupMetrics(records) {
  return {
    mainStarted: getStageTime(records, "main_started"),
    windowCreated: getStageTime(records, "window_created"),
    rendererLoaded: getStageTime(records, "renderer_loaded"),
    firstPaint: getEventRecord(records, "bench:first-paint")?.relativeMs,
    interactiveReady: getEventRecord(records, "bench:interactive")?.relativeMs
  };
}

async function performWarmup(framework, options, tempDir) {
  const logFile = resolve(tempDir, `${framework}-warmup.jsonl`);
  const child = await launchApp({
    framework,
    logFile,
    scenario: "startup",
    automationDelayMs: options.automationDelayMs
  });

  try {
    await waitForCondition({
      logFile,
      child,
      timeoutMs: options.timeoutMs,
      predicate: (records) => getEventRecord(records, "bench:interactive")
    });
  } finally {
    await killApp(child);
    await sleep(750);
  }
}

async function runStartupScenario(framework, options, runDir, runLabel) {
  const logFile = resolve(runDir, `${framework}-startup-${runLabel}.jsonl`);
  const child = await launchApp({
    framework,
    logFile,
    scenario: "startup",
    automationDelayMs: options.automationDelayMs
  });

  try {
    const { records } = await waitForCondition({
      logFile,
      child,
      timeoutMs: options.timeoutMs,
      predicate: (nextRecords) => getEventRecord(nextRecords, "bench:interactive")
    });

    return {
      startup: extractStartupMetrics(records),
      logFile,
      records
    };
  } finally {
    await killApp(child);
  }
}

async function runIdleMemoryScenario(framework, options, runDir, runLabel) {
  const logFile = resolve(runDir, `${framework}-idle-memory-${runLabel}.jsonl`);
  const child = await launchApp({
    framework,
    logFile,
    scenario: "idle-memory",
    automationDelayMs: options.automationDelayMs
  });

  try {
    const { records } = await waitForCondition({
      logFile,
      child,
      timeoutMs: options.timeoutMs,
      predicate: (nextRecords) => getEventRecord(nextRecords, "bench:interactive")
    });

    await sleep(options.stabilizationMs);

    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      const sample = await sampleProcess(child.pid);
      if (sample) {
        samples.push(sample);
      }

      await sleep(options.sampleIntervalMs);
    }

    return {
      startup: extractStartupMetrics(records),
      memory: {
        idleMb: median(samples.map((sample) => sample.rssMb))
      },
      idleSamples: samples,
      logFile,
      records
    };
  } finally {
    await killApp(child);
  }
}

async function runHeavyTaskScenario(framework, options, runDir, runLabel) {
  const logFile = resolve(runDir, `${framework}-heavy-task-${runLabel}.jsonl`);
  const child = await launchApp({
    framework,
    logFile,
    scenario: "heavy-task",
    automationDelayMs: options.automationDelayMs
  });

  try {
    await waitForCondition({
      logFile,
      child,
      timeoutMs: options.timeoutMs,
      predicate: (records) => getEventRecord(records, "bench:task:start")
    });

    const samples = [];
    const startedAt = Date.now();
    let records = [];
    let taskEndRecord = null;

    while (Date.now() - startedAt < options.timeoutMs) {
      const sample = await sampleProcess(child.pid);
      if (sample) {
        samples.push(sample);
      }

      records = await readJsonLines(logFile);
      taskEndRecord = getEventRecord(records, "bench:task:end");
      if (taskEndRecord) {
        break;
      }

      await sleep(options.sampleIntervalMs);
    }

    if (!taskEndRecord) {
      throw new Error(`Timed out waiting for heavy task completion in ${framework}`);
    }

    return {
      startup: extractStartupMetrics(records),
      memory: {
        peakMb: samples.length > 0 ? Math.max(...samples.map((sample) => sample.rssMb)) : null
      },
      cpu: {
        averagePercent: samples.length > 0 ? Number((samples.reduce((sum, sample) => sum + sample.cpuPercent, 0) / samples.length).toFixed(2)) : null,
        peakPercent: samples.length > 0 ? Math.max(...samples.map((sample) => sample.cpuPercent)) : null
      },
      task: {
        durationMs: taskEndRecord.payload?.durationMs ?? null,
        iterations: taskEndRecord.payload?.iterations ?? null,
        itemCount: taskEndRecord.payload?.itemCount ?? null
      },
      heavyTaskSamples: samples,
      logFile,
      records
    };
  } finally {
    await killApp(child);
  }
}

async function runArtifactsScenario(framework) {
  const config = FRAMEWORKS[framework];

  return {
    artifacts: {
      appBundleBytes: await measurePathBytes(config.appBundle),
      distributableBytes: await measurePathBytes(config.distributable)
    }
  };
}

async function runScenario(framework, options, runDir, runLabel) {
  if (options.scenario === "startup") {
    return runStartupScenario(framework, options, runDir, runLabel);
  }

  if (options.scenario === "idle-memory") {
    return runIdleMemoryScenario(framework, options, runDir, runLabel);
  }

  if (options.scenario === "heavy-task") {
    return runHeavyTaskScenario(framework, options, runDir, runLabel);
  }

  if (options.scenario === "artifacts") {
    return runArtifactsScenario(framework);
  }

  throw new Error(`Unsupported scenario: ${options.scenario}`);
}

function selectFrameworks(frameworkArg) {
  if (frameworkArg === "all") {
    return Object.keys(FRAMEWORKS);
  }

  if (!FRAMEWORKS[frameworkArg]) {
    throw new Error(`Unknown framework: ${frameworkArg}`);
  }

  return [frameworkArg];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const frameworks = selectFrameworks(options.framework);
  const invocationId = new Date().toISOString().replace(/[:.]/g, "-");
  const invocationDir = resolve(options.outputDir, invocationId);

  await ensureCleanDir(invocationDir);

  const results = [];

  for (const framework of frameworks) {
    if (options.scenario !== "artifacts" && options.launch === "warm") {
      await performWarmup(framework, options, invocationDir);
    }

    const runs = options.scenario === "artifacts" ? 1 : options.runs;

    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      const runLabel = `run-${runIndex + 1}`;
      const runResult = await runScenario(framework, options, invocationDir, runLabel);
      results.push({
        framework,
        scenario: options.scenario,
        launch: options.launch,
        runIndex: runIndex + 1,
        timestamp: new Date().toISOString(),
        ...runResult
      });
    }
  }

  const output = {
    invocationId,
    createdAt: new Date().toISOString(),
    options,
    results
  };

  const outputFile = resolve(invocationDir, "results.json");
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Benchmark results written to ${outputFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
