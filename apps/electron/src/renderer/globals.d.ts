import type { AppShellHost } from "@benchmark/app-shell/src/types";

declare global {
  interface Window {
    benchmarkHost: AppShellHost;
  }
}

export {};
