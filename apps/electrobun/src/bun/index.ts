import { ApplicationMenu, BrowserView, BrowserWindow, PATHS, Utils } from "electrobun/bun";

import { mkdir, appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { BenchmarkAutomationConfig } from "@benchmark/benchmark-core";
import type { MockApiResponse } from "@benchmark/dataset";
import type { PersistedAppState } from "@benchmark/app-shell/types";
import { startMockApiServer } from "@benchmark/mock-api";

import type { ElectrobunBenchmarkRpc } from "../shared/rpc";
import { secondaryWindowHtml } from "../shared/secondary-window.html";

const BENCH_AUTOMATION_MODE_ENV = "BENCH_AUTOMATION_MODE";
const BENCH_AUTOMATION_DELAY_MS_ENV = "BENCH_AUTOMATION_DELAY_MS";
const BENCH_HEAVY_TASK_ITERATIONS_ENV = "BENCH_HEAVY_TASK_ITERATIONS";
const BENCH_OUTPUT_FILE_ENV = "BENCH_OUTPUT_FILE";
const DATASET_FILE_NAME = "benchmark-dataset.json";
const MOCK_API_FILE_NAME = "mock-api-response.json";

const bootStartedAt = performance.now();
const benchmarkOutputFile = process.env[BENCH_OUTPUT_FILE_ENV];

let mainWindow: BrowserWindow | null = null;
let secondaryWindow: BrowserWindow | null = null;
let mockApiBaseUrl = "";
let closeMockServer: null | (() => Promise<void>) = null;

function roundDuration(value: number): number {
  return Number(value.toFixed(2));
}

function getBundledAssetPath(fileName: string): string {
  return join(PATHS.VIEWS_FOLDER, "assets", "dataset", fileName);
}

function getPersistenceFilePath(): string {
  return join(
    process.env.HOME ?? process.cwd(),
    "Library",
    "Application Support",
    "desktop-frameworks-benchmarking",
    "electrobun-benchmark-app-state.json"
  );
}

async function appendBenchmarkLog(payload: Record<string, unknown>): Promise<void> {
  const record = {
    timestamp: new Date().toISOString(),
    relativeMs: roundDuration(performance.now() - bootStartedAt),
    ...payload
  };

  if (benchmarkOutputFile) {
    await mkdir(dirname(benchmarkOutputFile), { recursive: true });
    await appendFile(benchmarkOutputFile, `${JSON.stringify(record)}\n`, "utf8");
  }

  console.log("[benchmark]", JSON.stringify(record));
}

function getBenchmarkConfig(): BenchmarkAutomationConfig | null {
  const mode = process.env[BENCH_AUTOMATION_MODE_ENV];
  if (mode !== "startup" && mode !== "heavy-task") {
    return null;
  }

  const heavyTaskIterations =
    mode === "heavy-task"
      ? Number(process.env[BENCH_HEAVY_TASK_ITERATIONS_ENV] ?? "") || undefined
      : undefined;

  return {
    mode,
    delayMs: Number(process.env[BENCH_AUTOMATION_DELAY_MS_ENV] ?? "250"),
    heavyTaskIterations
  };
}

async function startLocalMockApi(): Promise<void> {
  const payloadText = await Bun.file(getBundledAssetPath(MOCK_API_FILE_NAME)).text();
  const payload = JSON.parse(payloadText) as MockApiResponse;
  const server = await startMockApiServer({
    dashboardPayload: payload
  });

  mockApiBaseUrl = server.baseUrl;
  closeMockServer = server.close;
}

async function createSecondaryWindow(): Promise<void> {
  if (secondaryWindow) {
    secondaryWindow.focus();
    return;
  }

  secondaryWindow = new BrowserWindow({
    title: "Benchmark Secondary Window",
    frame: {
      width: 520,
      height: 320,
      x: 120,
      y: 120
    },
    html: secondaryWindowHtml
  });

  secondaryWindow.on("close", () => {
    secondaryWindow = null;
  });
}

const browserRpc = BrowserView.defineRPC<ElectrobunBenchmarkRpc>({
  maxRequestTime: 15000,
  handlers: {
    requests: {
      getBenchmarkConfig: async () => getBenchmarkConfig(),
      getMockApiBaseUrl: async () => mockApiBaseUrl,
      loadDatasetText: async () => Bun.file(getBundledAssetPath(DATASET_FILE_NAME)).text(),
      readPersistedState: async (): Promise<PersistedAppState | null> => {
        try {
          return JSON.parse(await readFile(getPersistenceFilePath(), "utf8")) as PersistedAppState;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return null;
          }

          throw error;
        }
      },
      writePersistedState: async (state) => {
        const filePath = getPersistenceFilePath();
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
        return true;
      },
      openNativeFilePicker: async () => {
        const chosenPaths = await Utils.openFileDialog({
          startingFolder: process.env.HOME ?? process.cwd(),
          allowedFileTypes: "*",
          canChooseFiles: true,
          canChooseDirectory: false,
          allowsMultipleSelection: true
        });

        return chosenPaths ?? [];
      },
      openSecondaryWindow: async () => {
        await createSecondaryWindow();
        return true;
      }
    },
    messages: {
      emitBenchmarkEvent: async (payload) => {
        await appendBenchmarkLog({
          source: "renderer",
          ...payload
        });
      }
    }
  }
});

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: "Desktop Framework Benchmark",
    url: "views://mainview/index.html",
    rpc: browserRpc,
    frame: {
      width: 1440,
      height: 960,
      x: 80,
      y: 80
    }
  });

  await appendBenchmarkLog({
    stage: "window_created"
  });

  mainWindow.webview.on("dom-ready", () => {
    void appendBenchmarkLog({
      stage: "renderer_loaded"
    });
  });

  mainWindow.on("close", () => {
    mainWindow = null;
  });
}

ApplicationMenu.setApplicationMenu([
  {
    submenu: [{ label: "Quit", role: "quit" }]
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" }
    ]
  }
]);

await appendBenchmarkLog({
  stage: "main_started"
});

await startLocalMockApi();
await createMainWindow();

process.on("beforeExit", () => {
  void closeMockServer?.();
});
