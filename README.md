# Desktop Frameworks Benchmarking

This repository benchmarks the same desktop application across Electron, Electrobun, and Tauri on macOS.

## Goals

- Keep the app behavior identical across frameworks
- Measure runtime performance, developer experience, and packaging output
- Preserve fairness by sharing the same workload, dataset, and instrumentation contract

## Repository Layout

- `apps/electron`: Electron implementation
- `apps/electrobun`: Electrobun implementation
- `apps/tauri`: Tauri implementation
- `packages/benchmark-core`: shared benchmark event names, types, and file contracts
- `packages/dataset`: shared dataset metadata and asset locations
- `packages/workload`: shared search/filter and heavy task logic
- `docs`: benchmark diary, hardware log, environment lock, and schema docs
- `scripts`: deterministic asset generation scripts

## Benchmark Ground Rules

- Same React + TypeScript + Vite UI stack in every app
- Same 10,000-row dataset and same 10 MB JSON asset
- Same heavy workload logic
- No framework-specific optimization in v1
- All benchmark runs happen on the same macOS machine

## Current Status

The repository is scaffolded with the shared benchmark contract, dataset schema, and deterministic asset generation. Framework app implementations are intentionally still placeholders so we can build them against the same shared packages.

