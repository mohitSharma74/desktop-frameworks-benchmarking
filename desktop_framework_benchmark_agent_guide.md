# Desktop Framework Benchmark Agent Guide

> Purpose: This document is optimized for an AI agent (or engineer) to **build identical desktop apps** across Electron, Electrobun, and Tauri, and **benchmark them consistently on macOS**.

---

# 0. Environment (LOCKED)

## System Requirements
- OS: macOS (Sonoma/Ventura — must be consistent)
- CPU: (log exact model in hardware.md)
- RAM: (log total GB)

## Tooling Versions (MUST be fixed before starting)
- Node: X.X.X
- Bun: X.X.X
- Rust: X.X.X
- Package Manager: npm / bun (consistent per framework)

> Do NOT upgrade versions mid-benchmark.

---

# 1. Scope of the Application

## Objective
Build the **same functional desktop application** in:
- Electron
- Electrobun
- Tauri

The goal is to simulate a **real-world, moderately complex desktop app**, not a toy example.

## Application Features (MUST be identical across frameworks)

### Core Features
- Render a list of **10,000 items** (mock dataset)
- Search/filter functionality (client-side)
- Load and parse a **10MB JSON file**
- Perform HTTP request to mock API
- Write/read from local storage
- Run CPU-heavy transformation task
- Open a secondary window
- Trigger native file picker

### UI Stack (standardized)
- React
- TypeScript
- Vite
- Same component structure and layout

## ⚠️ No Optimization Rule (CRITICAL)
- Implementations must be:
  - straightforward
  - idiomatic
  - not performance-optimized
- No framework-specific tuning in v1

---

# 2. Benchmark Categories

## A. Runtime Performance (User Experience)
- Cold start time
- Warm start time
- First paint
- Time to interactive
- Idle memory usage
- Peak memory usage under load
- CPU usage during heavy task
- Heavy task execution time

## B. Developer Experience (DX)
- Install time
- Time to first successful run
- Hot reload latency
- Production build time
- Packaging time

## C. Shipping Reality
- Unpacked app size
- Installer size
- Time to MVP (manual)
- Time to production-ready build (manual)
- Number of blockers/issues (manual)
- Platform-specific fixes (manual)

---

# 3. Deterministic Workload Definition (MANDATORY)

## Heavy Task Specification
This MUST be identical across frameworks:

1. Load a 10MB JSON file
2. Parse JSON
3. Run transformation loop **30 times**
4. Compute grouped statistics
5. Return summarized output

## Dataset Rules
- Same dataset file across all frameworks
- Stored in repo (not generated dynamically)

---

# 4. Measurement Methodology

## General Rules
- Same machine for all tests
- Close background apps
- Use median (not best run)
- Repeat runs as defined below

---

## A. Startup Timing

### Events to Capture
- main_started
- window_created
- renderer_loaded
- first_paint
- interactive_ready

## Definition: Interactive Ready
> UI rendered + state initialized + user interaction possible

### Implementation
- Use `performance.now()`
- Log events to JSON file

---

## B. Memory Measurement

### Source of Truth
- OS-level measurement ONLY

### macOS Command
```bash
ps -o pid,rss,%cpu,command -p <PID>
```

### Metrics
- Idle memory (after stabilization)
- Peak memory (during heavy task)

---

## C. CPU Measurement

### Approach
- Run heavy task
- Sample CPU every 500ms

---

## D. Hot Reload Benchmark

### Steps
1. Start dev server
2. Modify UI text automatically
3. Measure time until UI reflects change

### Runs
- 10 iterations
- Record median + p95

---

## E. Build & Packaging

### Measure
- Production build time
- Packaging time

### Capture
- Output directory size
- Installer size
- Executable size

---

# 5. Manual Benchmarks (CRITICAL)

Track in `docs/diary.md`

## Time Tracking
- Setup time
- Time to first UI
- Feature completion time
- Packaging time

## Friction Tracking
- Errors
- Toolchain issues
- Debugging complexity
- Documentation gaps

---

# 6. Command Matrix (EXECUTION CONTRACT)

## Electron
- install: npm install
- dev: npm run dev
- build: npm run build
- package: npm run package

## Electrobun
- install: bun install
- dev: bun run dev
- build: bun run build
- package: bun run package

## Tauri
- install: npm install + cargo setup
- dev: npm run tauri dev
- build: npm run build
- package: npm run tauri build

---

# 7. Benchmark Execution Plan

## Run Counts

| Benchmark | Runs |
|----------|------|
| Cold start | 15 |
| Warm start | 15 |
| Idle memory | 5 |
| Heavy task | 10 |
| Hot reload | 10 |
| Build time | 5 |
| Packaging | 5 |

## Reporting
- Median (primary)
- P95 (secondary)

---

# 8. App Instrumentation Contract

Each app MUST:
- emit "bench:ready"
- emit "bench:first-paint"
- emit "bench:interactive"
- emit "bench:task:start"
- emit "bench:task:end"
- write results to BENCH_OUTPUT_FILE

---

# 9. Framework-Specific Notes

## Electron
- Use process.getProcessMemoryInfo()
- Use app.getAppMetrics()

## Tauri
- Rust toolchain required
- Uses system WebView

## Electrobun
- Bun runtime
- Fast dev loop

---

# 10. Data Format

```json
{
  "framework": "electron",
  "startup": {
    "firstPaint": 120,
    "interactive": 240
  },
  "memory": {
    "idle": 110,
    "peak": 180
  },
  "cpu": {
    "avg": 32,
    "peak": 75
  }
}
```

---

# 11. Fairness Rules

- Same stack
- Same dataset
- Same hardware
- Same OS
- No optimizations

---

# 12. Deliverables

Each framework must produce:
- Working app
- Benchmark logs
- Build artifacts
- Diary notes

---

# 13. Success Criteria

Benchmark is valid if:
- All apps are identical in behavior
- Metrics are consistent
- Results are reproducible

---

# End of Guide

