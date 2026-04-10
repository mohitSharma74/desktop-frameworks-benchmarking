import { contextBridge, ipcRenderer } from "electron";

import type { AppShellHost } from "@benchmark/app-shell/types";

const benchmarkHost: AppShellHost = {
  framework: "electron",
  getMockApiBaseUrl: () => ipcRenderer.invoke("app:get-mock-api-base-url"),
  loadDatasetText: () => ipcRenderer.invoke("app:load-dataset-text"),
  readPersistedState: () => ipcRenderer.invoke("app:read-persisted-state"),
  writePersistedState: (state) => ipcRenderer.invoke("app:write-persisted-state", state),
  openNativeFilePicker: () => ipcRenderer.invoke("app:open-native-file-picker"),
  openSecondaryWindow: () => ipcRenderer.invoke("app:open-secondary-window"),
  emitBenchmarkEvent: (eventName, payload) => {
    ipcRenderer.send("app:benchmark-event", {
      eventName,
      payload
    });
  }
};

contextBridge.exposeInMainWorld("benchmarkHost", benchmarkHost);
