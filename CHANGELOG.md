# Changelog

## [3.1.0] - 2026-05-21

### Features

- **`vscode.tasks.executeTask` instrumentation** — the module loader patcher now wraps `vscode.tasks.executeTask` in addition to `child_process`, `http/https`, and `fs`. Because IDE Shepherd activates with `*` and patches the shared vscode module object in-place, every subsequent `executeTask()` call from any extension is intercepted synchronously before VS Code queues the task. Matching tasks are blocked (rejected promise) and a security event is emitted. This closes the gap where the task event API (`onDidStartTask`) fires only after execution begins. This is the runtime detection path for the supply-chain TTP used in compromised nx-console 18.95.0

- **Welcome and What's New pages** — a welcome webview opens on first install to introduce the extension's protection layers and getting-started steps. On subsequent updates, a What's New page opens instead, pulling its content directly from the bundled `CHANGELOG.md`. Both pages are VS Code theme-aware and shown at most once per install or version bump via `globalState`

### Detection

- **New task rule: `task_npx_auto_approve_remote`** (High) — detects VS Code tasks that run `npx` with `-y`/`--yes` and a `github:` package specifier, auto-executing untrusted code from a GitHub ref without user confirmation

- **New source rule: `stealth_task_remote_install`** (High) — static detection for extensions that hide a VS Code task from the user (`presentationOptions.focus = false`) while auto-confirming a remote GitHub package install via npx. Dual-signal design: focus suppression alone or npx-github alone does not fire; the combination does

### Bug Fixes

- **Source analyzer tail scan for oversized bundles** — files between 1 MB and 50 MB now have their last 64 KB scanned instead of being skipped entirely. Injected payloads are typically appended to the end of a legitimate bundle; the previous 1 MB full-scan cap caused these files to be silently ignored. Files above 50 MB are still skipped to avoid memory pressure

- **Source rule false positives** — tightened `download_and_execute` from two signals to three by adding a temp-directory reference requirement (`/tmp/`, `os.tmpdir()`, `TMPDIR`), targeting the fetch-stage-execute delivery pattern rather than any extension that makes HTTP requests and spawns a process. Tightened `reverse_shell` to require a shell binary string literal (`/bin/sh`, `cmd.exe`, `powershell`, etc.) as the second signal instead of any `exec`/`spawn` call, so language server and debug-adapter extensions no longer trigger the rule

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
