import type { BenchmarkEventName } from "@benchmark/benchmark-core";
import type { BenchmarkAutomationConfig } from "@benchmark/benchmark-core";
import type { PersistedAppState } from "@benchmark/app-shell/types";

import type { RPCSchema } from "electrobun/bun";

export type ElectrobunBenchmarkRpc = {
  bun: RPCSchema<{
    requests: {
      getBenchmarkConfig: {
        params: {};
        response: BenchmarkAutomationConfig | null;
      };
      getMockApiBaseUrl: {
        params: {};
        response: string;
      };
      loadDatasetText: {
        params: {};
        response: string;
      };
      readPersistedState: {
        params: {};
        response: PersistedAppState | null;
      };
      writePersistedState: {
        params: PersistedAppState;
        response: boolean;
      };
      openNativeFilePicker: {
        params: {};
        response: string[];
      };
      openSecondaryWindow: {
        params: {};
        response: boolean;
      };
    };
    messages: {
      emitBenchmarkEvent: {
        eventName: BenchmarkEventName;
        payload?: Record<string, unknown>;
      };
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};
