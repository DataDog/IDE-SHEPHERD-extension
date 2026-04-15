# Changelog

## [2.1.0] - 2026-04-14

### Bug Fixes

- **Telemetry stability** — agent monitor now requires 3 consecutive failed health checks (~90s) before disabling telemetry, preventing false positives during IDE restarts or Cursor updates
- **Deadlock prevention** — replaced busy-wait spin-lock in `IDEStatusService` with a proper FIFO async mutex
- **Queue data loss** — fixed race condition in `OCSFTracker.flushQueuedEvents()` where events arriving during a flush could be silently dropped
- **Interval leak** — added `deactivate()` hook to stop the auto-refresh interval on extension teardown
- **Task rule misses** — normalize shell line-continuations and newlines in task commands before pattern matching
- **Risk score inflation** — scoring model now uses weighted-max with diminishing returns; multiple low-severity patterns no longer incorrectly escalate to high risk

## [3.0.0] - 2026-04-16

### Feature Release

- **File system monitoring** — Patches `fs.readFile`, `fs.writeFile`, `fs.appendFile` (sync, callback, and promise variants) to detect and block access to sensitive files. Adds 15 detection rules across read/write targets covering SSH keys, cloud credentials, shell history, persistence locations (cron, launchd, authorized_keys, hosts file, shell profiles), with cross-platform Windows path support
