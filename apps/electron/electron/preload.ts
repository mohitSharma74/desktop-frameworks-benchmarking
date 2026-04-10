import { contextBridge, ipcRenderer } from "electron";

import type { AppShellHost, PersistedAppState } from "@benchmark/app-shell/src/types";

const benchmarkHost: AppShellHost = {
  framework: "electron",
  getBenchmarkConfig: () => ipcRenderer.invoke("app:get-benchmark-config"),
  getMockApiBaseUrl: () => ipcRenderer.invoke("app:get-mock-api-base-url"),
  loadDatasetText: () => ipcRenderer.invoke("app:load-dataset-text"),
  readPersistedState: () => ipcRenderer.invoke("app:read-persisted-state"),
  writePersistedState: (state: PersistedAppState) =>
    ipcRenderer.invoke("app:write-persisted-state", state),
  openNativeFilePicker: () => ipcRenderer.invoke("app:open-native-file-picker"),
  openSecondaryWindow: () => ipcRenderer.invoke("app:open-secondary-window"),
  emitBenchmarkEvent: (eventName, payload?: Record<string, unknown>) => {
    ipcRenderer.send("app:benchmark-event", {
      eventName,
      payload
    });
  }
};

contextBridge.exposeInMainWorld("benchmarkHost", benchmarkHost);
