export const BENCHMARK_EVENTS = [
  "bench:ready",
  "bench:first-paint",
  "bench:interactive",
  "bench:task:start",
  "bench:task:end"
] as const;

export type BenchmarkEventName = (typeof BENCHMARK_EVENTS)[number];

export type BenchmarkFramework = "electron" | "electrobun" | "tauri";
export type BenchmarkAutomationMode = "startup" | "heavy-task";

export interface StartupMetrics {
  mainStarted?: number;
  windowCreated?: number;
  rendererLoaded?: number;
  firstPaint?: number;
  interactiveReady?: number;
}

export interface MemoryMetrics {
  idleMb?: number;
  peakMb?: number;
}

export interface CpuMetrics {
  averagePercent?: number;
  peakPercent?: number;
}

export interface TaskMetrics {
  durationMs?: number;
  iterations: number;
  itemCount: number;
}

export interface BenchmarkResult {
  framework: BenchmarkFramework;
  runLabel: string;
  startup: StartupMetrics;
  memory: MemoryMetrics;
  cpu: CpuMetrics;
  task: TaskMetrics;
  notes?: string[];
}

export const BENCH_OUTPUT_FILE_ENV = "BENCH_OUTPUT_FILE";
export const BENCH_AUTOMATION_MODE_ENV = "BENCH_AUTOMATION_MODE";
export const BENCH_AUTOMATION_DELAY_MS_ENV = "BENCH_AUTOMATION_DELAY_MS";
export const BENCH_HEAVY_TASK_ITERATIONS_ENV = "BENCH_HEAVY_TASK_ITERATIONS";
export const DEFAULT_HEAVY_TASK_ITERATIONS = 30;

export interface BenchmarkAutomationConfig {
  mode: BenchmarkAutomationMode;
  delayMs: number;
  heavyTaskIterations?: number;
}
