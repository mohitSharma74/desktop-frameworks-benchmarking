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
- `packages/mock-api`: reusable local mock API server for host runtimes
- `packages/app-shell`: shared React renderer for every desktop framework
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

The repository now includes:

- a deterministic 10 MB-class dataset fixture
- a shared React renderer with all benchmark features
- a local mock API server package
- a working Electron host that builds and packages into `.app` and `.dmg`
- a verified Electrobun host that reuses the same renderer contract

Tauri is still pending, but Electron and Electrobun now both target the same renderer and workload packages with working build/package flows.
