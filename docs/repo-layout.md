# Repo Layout

## Apps

- `apps/electron`: Electron shell plus React renderer
- `apps/electrobun`: Electrobun shell plus React renderer
- `apps/tauri`: Tauri shell plus React renderer

## Shared Packages

- `packages/benchmark-core`: benchmark event names, metrics types, output file contract
- `packages/dataset`: dataset asset paths and data model types
- `packages/mock-api`: local HTTP mock API server shared by framework hosts
- `packages/app-shell`: shared React renderer and feature implementation
- `packages/workload`: pure workload logic shared across all implementations

## Supporting Docs

- `docs/environment-lock.md`: toolchain versions
- `docs/hardware.md`: benchmark machine record
- `docs/diary.md`: manual benchmark notes
- `docs/dataset-schema.md`: shared dataset definition
