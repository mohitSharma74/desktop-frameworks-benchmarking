# Electrobun App

This directory hosts the Electrobun implementation of the benchmark app.

## Stack

- Electrobun
- Bun
- React
- TypeScript

## What Is Implemented

- Use the shared dataset in `packages/dataset`
- Use the shared workload logic in `packages/workload`
- Emit shared benchmark events from `packages/benchmark-core`
- Start a local HTTP mock API server from the Bun runtime
- Persist renderer state through native filesystem writes
- Expose native file picker and secondary window actions through typed RPC
- Build and stable package flows verified on macOS
