import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  sampleIntervalMs: 100,
  automationDelayMs: 250,
  heavyTaskIterations: null,
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
    } else if (token === "--heavy-task-iterations" && next) {
      options.heavyTaskIterations = Number(next);
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
  --heavy-task-iterations <number>
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

function parseProcessLine(line) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+([0-9.]+)\s+([0-9:\-.]+)\s+(.*)$/);
  if (!match) {
    return null;
  }

  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    rssMb: Number((Number(match[3]) / 1024).toFixed(2)),
    cpuPercent: Number(match[4]),
    cpuTimeSeconds: parseCpuTime(match[5]),
    command: match[6]
  };
}

function parseCpuTime(value) {
  const [daysPart, clockPart] = value.includes("-") ? value.split("-", 2) : [null, value];
  const daySeconds = daysPart ? Number(daysPart) * 24 * 60 * 60 : 0;
  const [left, right] = clockPart.split(".");
  const fractionalSeconds = right ? Number(`0.${right}`) : 0;
  const parts = left.split(":").map((part) => Number(part));

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else if (parts.length === 1) {
    [seconds] = parts;
  }

  return daySeconds + hours * 60 * 60 + minutes * 60 + seconds + fractionalSeconds;
}

function getAppBundlePathFromExecutable(executable) {
  const marker = ".app/";
  const index = executable.indexOf(marker);
  if (index === -1) {
    return dirname(executable);
  }

  return executable.slice(0, index + ".app".length);
}

function isWebKitProcess(process) {
  return process.command.includes("com.apple.WebKit.WebContent") ||
    process.command.includes("com.apple.WebKit.Networking") ||
    process.command.includes("com.apple.WebKit.GPU");
}

async function readProcessTable() {
  const output = await runCommand("ps", ["-axo", "pid=,ppid=,rss=,%cpu=,time=,command="]);
  return output
    .split("\n")
    .map((line) => parseProcessLine(line))
    .filter(Boolean);
}

function collectProcessTree(rootPid, processes) {
  const byParent = new Map();
  for (const process of processes) {
    const children = byParent.get(process.ppid) ?? [];
    children.push(process);
    byParent.set(process.ppid, children);
  }

  const visited = new Set();
  const queue = [rootPid];
  const tree = [];

  while (queue.length > 0) {
    const pid = queue.shift();
    if (!pid || visited.has(pid)) {
      continue;
    }

    visited.add(pid);
    const process = processes.find((entry) => entry.pid === pid);
    if (!process) {
      continue;
    }

    tree.push(process);
    const children = byParent.get(pid) ?? [];
    for (const child of children) {
      queue.push(child.pid);
    }
  }

  return tree;
}

function collectMatchingProcesses(processes, patterns) {
  return processes.filter((process) =>
    patterns.some((pattern) => process.command.includes(pattern))
  );
}

function collectNewWebKitProcesses(processes, baselinePids) {
  return processes.filter(
    (process) => isWebKitProcess(process) && !baselinePids.has(process.pid)
  );
}

function dedupeProcesses(processes) {
  const unique = new Map();
  for (const process of processes) {
    unique.set(process.pid, process);
  }

  return [...unique.values()];
}

function aggregateProcessList(processes, rootPid = null) {
  if (processes.length === 0) {
    return null;
  }

  const primaryProcess = [...processes].sort((left, right) => {
    if (right.cpuPercent !== left.cpuPercent) {
      return right.cpuPercent - left.cpuPercent;
    }

    if (right.rssMb !== left.rssMb) {
      return right.rssMb - left.rssMb;
    }

    return left.pid - right.pid;
  })[0];

  return {
    pid: primaryProcess.pid,
    rootPid,
    processCount: processes.length,
    sampledAtMs: Date.now(),
    rssMb: Number(processes.reduce((sum, process) => sum + process.rssMb, 0).toFixed(2)),
    cpuPercent: Number(processes.reduce((sum, process) => sum + process.cpuPercent, 0).toFixed(2)),
    cpuTimeSeconds: Number(
      processes.reduce((sum, process) => sum + process.cpuTimeSeconds, 0).toFixed(4)
    ),
    command: primaryProcess.command,
    processes
  };
}

function calculateCpuPercentSamples(samples) {
  const cpuSamples = [];

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const elapsedMs = current.sampledAtMs - previous.sampledAtMs;
    const cpuTimeDeltaSeconds = current.cpuTimeSeconds - previous.cpuTimeSeconds;

    if (elapsedMs <= 0 || cpuTimeDeltaSeconds < 0) {
      continue;
    }

    cpuSamples.push(
      Number(((cpuTimeDeltaSeconds / (elapsedMs / 1000)) * 100).toFixed(2))
    );
  }

  return cpuSamples;
}

function aggregateProcessTreeSample(rootPid, processes) {
  return aggregateProcessList(collectProcessTree(rootPid, processes), rootPid);
}

async function sampleProcessTree(child) {
  try {
    const processes = await readProcessTable();
    const treeSample = aggregateProcessTreeSample(child.pid, processes);
    const matchedProcesses = collectMatchingProcesses(
      processes,
      child.__benchmarkMatchPatterns ?? []
    );
    const webKitProcesses = collectNewWebKitProcesses(
      processes,
      child.__benchmarkBaselineWebKitPids ?? new Set()
    );
    for (const process of webKitProcesses) {
      child.__benchmarkExtraPids.add(process.pid);
    }

    const matchingSample = aggregateProcessList(
      dedupeProcesses([...matchedProcesses, ...webKitProcesses]),
      child.pid
    );

    if (!treeSample) {
      return matchingSample;
    }

    if (!matchingSample) {
      return treeSample;
    }

    if (
      matchingSample.processCount > treeSample.processCount ||
      matchingSample.rssMb > treeSample.rssMb
    ) {
      return matchingSample;
    }

    return treeSample;
  } catch {
    return null;
  }
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
  const sourcePath = existsSync(config.appBundle) ? config.appBundle : config.bundleArchive;

  if (existsSync(stagedExecutable)) {
    const [stagedStats, sourceStats] = await Promise.all([stat(stagedExecutable), stat(sourcePath)]);
    if (stagedStats.mtimeMs >= sourceStats.mtimeMs) {
      return stagedExecutable;
    }
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

async function killProcessTree(rootPid, signal = "SIGTERM") {
  const processes = await readProcessTable().catch(() => []);
  const tree = collectProcessTree(rootPid, processes)
    .sort((left, right) => right.pid - left.pid)
    .map((process) => process.pid);

  for (const pid of tree) {
    try {
      process.kill(pid, signal);
    } catch {
      // Ignore processes that already exited.
    }
  }
}

async function killMatchingProcesses(patterns, signal = "SIGTERM") {
  if (!patterns || patterns.length === 0) {
    return;
  }

  const processes = await readProcessTable().catch(() => []);
  const matching = collectMatchingProcesses(processes, patterns)
    .sort((left, right) => right.pid - left.pid)
    .map((process) => process.pid);

  for (const pid of matching) {
    try {
      process.kill(pid, signal);
    } catch {
      // Ignore processes that already exited.
    }
  }
}

async function killKnownPids(pids, signal = "SIGTERM") {
  for (const pid of pids ?? []) {
    try {
      process.kill(pid, signal);
    } catch {
      // Ignore processes that already exited.
    }
  }
}

async function killApp(child) {
  if (child.exitCode === null) {
    await killProcessTree(child.pid, "SIGTERM");
  }
  await killMatchingProcesses(child.__benchmarkMatchPatterns ?? [], "SIGTERM");
  await killKnownPids(child.__benchmarkExtraPids, "SIGTERM");

  const startedAt = Date.now();
  while (child.exitCode === null && Date.now() - startedAt < 3000) {
    await sleep(100);
  }

  if (child.exitCode === null) {
    await killProcessTree(child.pid, "SIGKILL");
  }
  await killMatchingProcesses(child.__benchmarkMatchPatterns ?? [], "SIGKILL");
  await killKnownPids(child.__benchmarkExtraPids, "SIGKILL");
}

async function launchApp({ framework, logFile, scenario, automationDelayMs, heavyTaskIterations }) {
  const config = FRAMEWORKS[framework];
  const executable = await resolveExecutablePath(framework);
  const processMatchPatterns = [getAppBundlePathFromExecutable(executable)];
  const baselineProcesses = await readProcessTable().catch(() => []);
  const baselineWebKitPids = new Set(
    baselineProcesses.filter((process) => isWebKitProcess(process)).map((process) => process.pid)
  );

  if (!existsSync(executable)) {
    throw new Error(`Missing executable for ${framework}: ${executable}`);
  }

  await killMatchingProcesses(processMatchPatterns, "SIGTERM");
  await sleep(150);
  await killMatchingProcesses(processMatchPatterns, "SIGKILL");

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
    if (typeof heavyTaskIterations === "number" && Number.isFinite(heavyTaskIterations)) {
      env.BENCH_HEAVY_TASK_ITERATIONS = String(heavyTaskIterations);
    }
  }

  const child = spawn(executable, [], {
    cwd: dirname(executable),
    env,
    stdio: "ignore"
  });
  child.__benchmarkMatchPatterns = processMatchPatterns;
  child.__benchmarkBaselineWebKitPids = baselineWebKitPids;
  child.__benchmarkExtraPids = new Set();

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
    automationDelayMs: options.automationDelayMs,
    heavyTaskIterations: options.heavyTaskIterations
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
    automationDelayMs: options.automationDelayMs,
    heavyTaskIterations: options.heavyTaskIterations
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
    automationDelayMs: options.automationDelayMs,
    heavyTaskIterations: options.heavyTaskIterations
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
      const sample = await sampleProcessTree(child);
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
    automationDelayMs: options.automationDelayMs,
    heavyTaskIterations: options.heavyTaskIterations
  });

  try {
    await waitForCondition({
      logFile,
      child,
      timeoutMs: options.timeoutMs,
      predicate: (records) => getEventRecord(records, "bench:task:start")
    });

    const samples = [];
    const initialSample = await sampleProcessTree(child);
    if (initialSample) {
      samples.push(initialSample);
    }

    const startedAt = Date.now();
    let records = [];
    let taskEndRecord = null;

    while (Date.now() - startedAt < options.timeoutMs) {
      const sample = await sampleProcessTree(child);
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

    const cpuPercentSamples = calculateCpuPercentSamples(samples);

    return {
      startup: extractStartupMetrics(records),
      memory: {
        peakMb: samples.length > 0 ? Math.max(...samples.map((sample) => sample.rssMb)) : null
      },
      cpu: {
        averagePercent:
          cpuPercentSamples.length > 0
            ? Number(
                (
                  cpuPercentSamples.reduce((sum, sample) => sum + sample, 0) /
                  cpuPercentSamples.length
                ).toFixed(2)
              )
            : null,
        peakPercent: cpuPercentSamples.length > 0 ? Math.max(...cpuPercentSamples) : null
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
