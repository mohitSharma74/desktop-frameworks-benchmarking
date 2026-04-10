import { createRoot } from "react-dom/client";

import { BenchmarkDesktopApp } from "@benchmark/app-shell/renderer";
import type { AppShellHost, PersistedAppState } from "@benchmark/app-shell/types";

import { invoke } from "@tauri-apps/api/core";

const host: AppShellHost = {
  framework: "tauri",
  getMockApiBaseUrl: () => invoke<string>("get_mock_api_base_url"),
  loadDatasetText: () => invoke<string>("load_dataset_text"),
  readPersistedState: () => invoke<PersistedAppState | null>("read_persisted_state"),
  writePersistedState: async (state) => {
    await invoke("write_persisted_state", { state });
  },
  openNativeFilePicker: () => invoke<string[]>("open_native_file_picker"),
  openSecondaryWindow: async () => {
    await invoke("open_secondary_window");
  },
  emitBenchmarkEvent: (eventName, payload) => {
    void invoke("emit_benchmark_event", {
      eventName,
      payload: payload ?? null
    });
  }
};

createRoot(document.getElementById("root")!).render(<BenchmarkDesktopApp host={host} />);

