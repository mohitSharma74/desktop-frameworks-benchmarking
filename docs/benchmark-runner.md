# Benchmark Runner

The benchmark runner launches packaged macOS app executables, writes JSONL event logs through the shared `BENCH_OUTPUT_FILE` contract, samples the full process tree through `ps` for RSS and CPU, and stores per-run results under `benchmarks/results`.

## Supported Scenarios

- `startup`: captures startup timings through `main_started`, `window_created`, `renderer_loaded`, `bench:first-paint`, and `bench:interactive`
- `idle-memory`: waits for interactive, stabilizes, then samples RSS five times
- `heavy-task`: launches the app in automation mode, waits for `bench:task:start`, samples CPU and RSS across the app process tree, and stops after `bench:task:end`
- `artifacts`: measures packaged `.app` and distributable sizes without launching the app

## Commands

```bash
npm run benchmark:run -- --framework electron --scenario startup --runs 3
npm run benchmark:run -- --framework electrobun --scenario heavy-task --runs 3 --launch warm
npm run benchmark:run -- --framework electron --scenario heavy-task --runs 5 --sample-interval-ms 50 --heavy-task-iterations 600
npm run benchmark:run -- --framework all --scenario artifacts
npm run benchmark:report
```

## Notes

- The runner currently targets packaged macOS app executables for fairness.
- `--heavy-task-iterations` lets you stretch the shared workload long enough to capture stable CPU and RSS peaks on fast hosts.
- Electron and Electrobun can be exercised now if their packaged artifacts exist.
- Tauri runtime packaging is still blocked on this machine until the Xcode license is accepted with `sudo xcodebuild -license accept`.
- Hot reload automation, install timing, and manual DX tracking still belong in separate follow-up tooling and `docs/diary.md`.
