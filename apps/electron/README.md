# Electron App

This directory hosts the Electron implementation of the benchmark app.

## Stack

- Electron
- React
- TypeScript
- Vite

## What Is Implemented

- Use the shared dataset in `packages/dataset`
- Use the shared workload logic in `packages/workload`
- Emit shared benchmark events from `packages/benchmark-core`
- Start a local HTTP mock API server
- Persist renderer state through native filesystem writes
- Expose native file picker and secondary window actions through preload IPC
