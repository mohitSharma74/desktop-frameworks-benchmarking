import type {
  BenchmarkAutomationConfig,
  BenchmarkEventName,
  BenchmarkFramework
} from "@benchmark/benchmark-core";
import type { FilterOptions } from "@benchmark/workload";

export interface PersistedAppState {
  filters: FilterOptions;
  selectedItemId: number | null;
  notes: string;
  lastOpenedFiles: string[];
}

export interface AppShellHost {
  framework: BenchmarkFramework;
  getBenchmarkConfig(): Promise<BenchmarkAutomationConfig | null>;
  getMockApiBaseUrl(): Promise<string>;
  loadDatasetText(): Promise<string>;
  readPersistedState(): Promise<PersistedAppState | null>;
  writePersistedState(state: PersistedAppState): Promise<void>;
  openNativeFilePicker(): Promise<string[]>;
  openSecondaryWindow(): Promise<void>;
  emitBenchmarkEvent(
    eventName: BenchmarkEventName,
    payload?: Record<string, unknown>
  ): void;
}

export interface AppShellProps {
  host: AppShellHost;
}
