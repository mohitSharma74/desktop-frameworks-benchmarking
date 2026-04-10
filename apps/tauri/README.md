# Tauri App

This directory hosts the Tauri implementation of the benchmark app.

## Stack

- Tauri
- Rust
- React
- TypeScript
- Vite

## What Is Implemented

- Use the shared dataset in `packages/dataset`
- Use the shared workload logic in `packages/workload`
- Emit shared benchmark events from `packages/benchmark-core`
- Start a local HTTP mock API server from the Rust runtime
- Persist renderer state through native filesystem writes
- Expose native file picker and secondary window actions through Tauri commands
