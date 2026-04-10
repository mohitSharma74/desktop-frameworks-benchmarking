import type { AppShellHost } from "@benchmark/app-shell/types";

declare global {
  interface Window {
    benchmarkHost: AppShellHost;
  }
}

export {};
