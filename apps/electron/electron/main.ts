import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions } from "electron";

import { createServer } from "node:http";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";

import type { BenchmarkAutomationConfig } from "@benchmark/benchmark-core";
import type { MockApiResponse } from "@benchmark/dataset";

const BENCH_AUTOMATION_MODE_ENV = "BENCH_AUTOMATION_MODE";
const BENCH_AUTOMATION_DELAY_MS_ENV = "BENCH_AUTOMATION_DELAY_MS";
const BENCH_OUTPUT_FILE_ENV = "BENCH_OUTPUT_FILE";
const DATASET_FILE_NAME = "benchmark-dataset.json";
const MOCK_API_FILE_NAME = "mock-api-response.json";

const bootStartedAt = performance.now();
const benchmarkOutputFile = process.env[BENCH_OUTPUT_FILE_ENV];

let mainWindow: BrowserWindow | null = null;
let secondaryWindow: BrowserWindow | null = null;
let mockApiBaseUrl = "";
let closeMockApiServer: null | (() => Promise<void>) = null;

function roundDuration(value: number): number {
  return Number(value.toFixed(2));
}

function getRepoAssetPath(fileName: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "dataset", fileName);
  }

  return resolve(app.getAppPath(), "../../packages/dataset/assets", fileName);
}

function getPersistenceFilePath(): string {
  return join(app.getPath("userData"), "benchmark-app-state.json");
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

  return {
    mode,
    delayMs: Number(process.env[BENCH_AUTOMATION_DELAY_MS_ENV] ?? "250")
  };
}

function createSecondaryWindow(): void {
  if (secondaryWindow && !secondaryWindow.isDestroyed()) {
    secondaryWindow.focus();
    return;
  }

  secondaryWindow = new BrowserWindow({
    width: 520,
    height: 320,
    title: "Benchmark Secondary Window",
    resizable: false
  });

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Benchmark Secondary Window</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, #191b24, #101117);
            color: #f2efe8;
            font-family: "Space Grotesk", "Avenir Next", sans-serif;
          }
          main {
            max-width: 28rem;
            padding: 2rem;
            text-align: center;
          }
          p {
            color: rgba(242, 239, 232, 0.74);
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Secondary Window</h1>
          <p>This exists so every framework opens the same extra native window during benchmarking.</p>
        </main>
      </body>
    </html>
  `;

  void secondaryWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function startMockApiServer(): Promise<void> {
  const payloadText = await readFile(getRepoAssetPath(MOCK_API_FILE_NAME), "utf8");
  const payload = JSON.parse(payloadText) as MockApiResponse;

  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === "/api/dashboard") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectStart);
      resolveStart();
    });
  });

  const address = server.address() as AddressInfo;
  mockApiBaseUrl = `http://127.0.0.1:${address.port}`;
  closeMockApiServer = async () =>
    new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }

        resolveClose();
      });
    });
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    backgroundColor: "#0f1014",
    title: "Desktop Framework Benchmark",
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: join(app.getAppPath(), "dist-electron/electron/preload.js")
    }
  });

  await appendBenchmarkLog({
    stage: "window_created"
  });

  mainWindow.webContents.once("did-finish-load", () => {
    void appendBenchmarkLog({
      stage: "renderer_loaded"
    });
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    void appendBenchmarkLog({
      stage: "renderer_console",
      level,
      message,
      line,
      sourceId
    });
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    void appendBenchmarkLog({
      stage: "did_fail_load",
      errorCode,
      errorDescription,
      validatedUrl,
      isMainFrame
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    void appendBenchmarkLog({
      stage: "renderer_process_gone",
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    void appendBenchmarkLog({
      stage: "preload_error",
      preloadPath,
      message: error.message
    });
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(join(app.getAppPath(), "dist/index.html"));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:get-benchmark-config", async () => getBenchmarkConfig());

  ipcMain.handle("app:get-mock-api-base-url", async () => mockApiBaseUrl);

  ipcMain.handle("app:load-dataset-text", async () =>
    readFile(getRepoAssetPath(DATASET_FILE_NAME), "utf8")
  );

  ipcMain.handle("app:read-persisted-state", async () => {
    try {
      return JSON.parse(await readFile(getPersistenceFilePath(), "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  });

  ipcMain.handle("app:write-persisted-state", async (_event, state) => {
    const filePath = getPersistenceFilePath();
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
    return true;
  });

  ipcMain.handle("app:open-native-file-picker", async () => {
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      title: "Select a benchmark file"
    };

    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle("app:open-secondary-window", async () => {
    createSecondaryWindow();
    return true;
  });

  ipcMain.on("app:benchmark-event", (_event, eventPayload) => {
    void appendBenchmarkLog({
      source: "renderer",
      ...eventPayload
    });
  });
}

app.whenReady()
  .then(async () => {
    await appendBenchmarkLog({
      stage: "main_started"
    });

    await startMockApiServer();
    registerIpcHandlers();
    await createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow();
      }
    });
  })
  .catch((error) => {
    void appendBenchmarkLog({
      stage: "startup_error",
      message: error instanceof Error ? error.message : String(error)
    });
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void closeMockApiServer?.();
});
