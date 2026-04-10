import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const appDir = resolve(repoRoot, "apps/electron");
const mainFile = resolve(appDir, "dist-electron/electron/main.js");
const preloadFile = resolve(appDir, "dist-electron/electron/preload.js");

let shuttingDown = false;
let electronProcess = null;
let lastSignature = "";

const children = [];

function runChild(name, args, extraEnv = {}) {
  const child = spawn("npm", args, {
    cwd: appDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  child.on("exit", (code) => {
    if (name === "electron") {
      electronProcess = null;
      return;
    }

    if (!shuttingDown && code && code !== 0) {
      shutdown(code);
    }
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

function readBuildSignature() {
  if (!existsSync(mainFile) || !existsSync(preloadFile)) {
    return "";
  }

  const mainStats = statSync(mainFile);
  const preloadStats = statSync(preloadFile);
  return `${mainStats.mtimeMs}:${preloadStats.mtimeMs}`;
}

function launchElectron() {
  if (electronProcess || !existsSync(mainFile) || !existsSync(preloadFile)) {
    return;
  }

  electronProcess = runChild("electron", ["exec", "electron", "--", mainFile], {
    VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
  });
}

runChild("typescript", ["exec", "tsc", "--", "-p", "tsconfig.node.json", "--watch", "--preserveWatchOutput"]);
runChild("vite", ["exec", "vite", "--", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", "5173"]);

const interval = setInterval(() => {
  const nextSignature = readBuildSignature();

  if (!nextSignature) {
    return;
  }

  if (!electronProcess) {
    lastSignature = nextSignature;
    launchElectron();
    return;
  }

  if (nextSignature !== lastSignature) {
    lastSignature = nextSignature;
    electronProcess.kill("SIGTERM");
    setTimeout(() => {
      if (!shuttingDown) {
        launchElectron();
      }
    }, 250);
  }
}, 500);

process.on("SIGINT", () => {
  clearInterval(interval);
  shutdown(0);
});

process.on("SIGTERM", () => {
  clearInterval(interval);
  shutdown(0);
});
