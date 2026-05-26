# Changelog

## [3.1.1] - 2026-05-26

### Features

- **`vscode.tasks.executeTask` instrumentation** — patches `executeTask` on the shared `vscode` module object so extension-initiated tasks are blocked before VS Code queues them, closing the gap left by `onDidStartTask` which fires only after execution begins
- **What's New page** — opens on first install and on each version update, pulling release notes from the bundled `CHANGELOG.md`; shown at most once per install via a marker file in the extension directory

### Detection

- **`task_npx_auto_approve_remote`** (High) — `npx` with `-y`/`--yes` and a `github:` package specifier
- **`stealth_task_remote_install`** (High) — hidden task (`presentationOptions.focus = false`) combined with auto-confirmed remote npx install; requires both signals to fire

### Bug Fixes

- **Oversized bundle tail scan** — files between 1 MB and 25 MB now have their last 100 KB scanned; the previous 1 MB hard cap silently skipped these files entirely
- **Source rule false positives** — `download_and_execute` now requires a temp-directory reference as a third signal; `reverse_shell` now requires a shell binary literal (`/bin/sh`, `cmd.exe`, etc.) rather than any exec/spawn call
- **What's New page not shown after Cursor auto-update** — Cursor updates extensions in-place, preserving existing files in the extension directory. The previous marker-based check (file presence only) meant the page was silently skipped after every Cursor update. The marker file now stores the version string; the page shows whenever the stored version differs from the current one.
- **Telemetry disabled and agent "Pending Restart" after update**

---

## [3.1.0] - 2026-05-26

### Features

- **`vscode.tasks.executeTask` instrumentation** — patches `executeTask` on the shared `vscode` module object so extension-initiated tasks are blocked before VS Code queues them, closing the gap left by `onDidStartTask` which fires only after execution begins
- **What's New page** — opens on first install and on each version update, pulling release notes from the bundled `CHANGELOG.md`; shown at most once per install via a marker file in the extension directory

### Detection

- **`task_npx_auto_approve_remote`** (High) — `npx` with `-y`/`--yes` and a `github:` package specifier
- **`stealth_task_remote_install`** (High) — hidden task (`presentationOptions.focus = false`) combined with auto-confirmed remote npx install; requires both signals to fire

### Bug Fixes

- **Oversized bundle tail scan** — files between 1 MB and 25 MB now have their last 100 KB scanned; the previous 1 MB hard cap silently skipped these files entirely
- **Source rule false positives** — `download_and_execute` now requires a temp-directory reference as a third signal; `reverse_shell` now requires a shell binary literal (`/bin/sh`, `cmd.exe`, etc.) rather than any exec/spawn call

---

## [3.0.0] - 2026-05-07

### Feature Release

- **File system monitoring** — Patches `fs.readFile`, `fs.writeFile`, `fs.appendFile` (sync, callback, and promise variants) to detect and block access to sensitive files. Adds 15 detection rules across read/write targets covering SSH keys, cloud credentials, shell history, persistence locations (cron, launchd, authorized_keys, hosts file, shell profiles), with cross-platform Windows path support

### New Features

- **Static source analysis (beta)** — IDE Shepherd now scans every `.js` file inside an extension's directory (including `node_modules`) for known attack primitives at the TTP level. Four rules are included in the initial release:
  - `download_and_execute` (Medium) — detects co-occurrence of HTTP fetch primitives and process execution calls
  - `reverse_shell` (High) — detects TCP socket creation combined with process execution, a signature of reverse shell setup
  - `eval_dynamic_payload` (High) — detects `eval` or `new Function` applied to a base64/encoded payload
  - `detached_unref_pattern` (Medium) — detects `detached: true` with `.unref()` used to launch a persistent background process

- **Retroactive module patching** — the module loader hook is now installed as the very first operation during extension activation, before any service initialization, minimizing the window in which another extension's early `require()` can bypass instrumentation. Cached modules are also patched in-place at startup.

- **New process monitoring rules** — two additional rules added to the child process interceptor:
  - `windows_script_host` (High) — flags execution via `cscript`, `wscript`, or `mshta`, which are never used by legitimate VS Code extensions
  - `detached_silent_process` (High) — flags processes spawned with `detached: true` and `stdio: 'ignore'`, a common payload-delivery pattern

## [2.1.0] - 2026-04-14

### Bug Fixes

- **Telemetry stability** — agent monitor now requires 3 consecutive failed health checks (~90s) before disabling telemetry, preventing false positives during IDE restarts or Cursor updates
- **Deadlock prevention** — replaced busy-wait spin-lock in `IDEStatusService` with a proper FIFO async mutex
- **Queue data loss** — fixed race condition in `OCSFTracker.flushQueuedEvents()` where events arriving during a flush could be silently dropped
- **Interval leak** — added `deactivate()` hook to stop the auto-refresh interval on extension teardown
- **Task rule misses** — normalize shell line-continuations and newlines in task commands before pattern matching
- **Risk score inflation** — scoring model now uses weighted-max with diminishing returns; multiple low-severity patterns no longer incorrectly escalate to high risk
