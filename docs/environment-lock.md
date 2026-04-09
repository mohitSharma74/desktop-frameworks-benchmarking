# Environment Lock

This benchmark must not change tool versions midway through implementation or measurement.

## Benchmark Target Lock

- macOS: Sonoma or Ventura, fixed for all benchmark runs
- Node.js: `24.14.1` LTS
- Bun: `1.3.9` stable
- Rust: `1.92.0` stable

## Local Machine Snapshot

Captured on April 9, 2026:

- Node.js: `24.12.0`
- Bun: `1.3.9`
- Rust: `1.92.0`

## Notes

- Node.js is slightly behind the target lock on this machine, so benchmark execution should wait until the machine matches the pinned Node version.
- Bun does not publish an LTS channel in the same way Node does, so the pinned stable release is used instead.
- Hardware details belong in [hardware.md](/Volumes/T5%20-%20SSD/projects/desktop-frameworks-benchmarking/docs/hardware.md).

