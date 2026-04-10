import { createRoot } from "react-dom/client";

import { BenchmarkDesktopApp } from "@benchmark/app-shell";
import type { AppShellHost, PersistedAppState } from "@benchmark/app-shell/types";

import { Electroview } from "electrobun/view";

import type { ElectrobunBenchmarkRpc } from "../shared/rpc";

const rpc = Electroview.defineRPC<ElectrobunBenchmarkRpc>({
  handlers: {
    requests: {},
    messages: {}
  }
});

const electrobun = new Electroview({ rpc });
const electrobunRpc = electrobun.rpc!;

const host: AppShellHost = {
  framework: "electrobun",
  getMockApiBaseUrl: () => electrobunRpc.request.getMockApiBaseUrl({}),
  loadDatasetText: () => electrobunRpc.request.loadDatasetText({}),
  readPersistedState: () =>
    electrobunRpc.request.readPersistedState({}) as Promise<PersistedAppState | null>,
  writePersistedState: async (state) => {
    await electrobunRpc.request.writePersistedState(state);
  },
  openNativeFilePicker: () => electrobunRpc.request.openNativeFilePicker({}),
  openSecondaryWindow: async () => {
    await electrobunRpc.request.openSecondaryWindow({});
  },
  emitBenchmarkEvent: (eventName, payload) => {
    electrobunRpc.send.emitBenchmarkEvent({
      eventName,
      payload
    });
  }
};

createRoot(document.getElementById("root")!).render(<BenchmarkDesktopApp host={host} />);
