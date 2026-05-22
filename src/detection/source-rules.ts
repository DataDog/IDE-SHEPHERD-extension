/**
 * Source Rules - File-content patterns for detecting malicious TTPs inside
 * extension directories (own source + node_modules).
 *
 * Design constraints:
 *  - Rules are TTP-based, not sample-based. Each rule targets an attack
 *    primitive (download-and-execute, reverse shell, etc.) rather than a
 *    specific implementation detail seen in a known sample.
 *  - Dual-signal design: rules require two independent signals in the same
 *    file so that either signal alone (legitimate download OR legitimate exec)
 *    does not fire.
 *  - A single HIGH firing crosses the high-risk threshold. Two or more
 *    findings pin the score at 100.
 */

import { SeverityLevel } from '../lib/events/sec-events';

export interface SourceRule {
  id: string;
  name: string;
  description: string;
  severity: SeverityLevel;
  /** Returns true if the file content matches this rule. */
  detect: (content: string) => boolean;
}

export const SOURCE_RULES: SourceRule[] = [
  /**
   * TTP: Download-and-execute — fetch a remote payload, stage it in a temp
   * directory, then run it.
   *
   * Three signals required: (1) network download primitive, (2) temp-directory
   * involvement (/tmp/, os.tmpdir(), TMPDIR), (3) process execution primitive.
   *
   * The original two-signal design (network + exec/spawn) caused widespread false
   * positives: extensions that make HTTP requests for unrelated reasons (telemetry,
   * update checks, API calls) and also spawn their own tooling would always fire.
   * Adding a temp-directory staging signal targets the actual payload delivery
   * pattern — fetch, write to disk, execute — without matching that common
   * legitimate combination.
   */
  {
    id: 'download_and_execute',
    name: 'Download and Execute',
    description:
      'File fetches remote content (https.get, fetch, XMLHttpRequest), references a temp directory, and calls exec/spawn — the three-stage download-stage-execute payload delivery pattern',
    severity: SeverityLevel.MEDIUM,
    detect: (content) => {
      const hasDownload = /https?\.get\s*\(|fetch\s*\(|new\s+XMLHttpRequest\b/.test(content);
      if (!hasDownload) {
        return false;
      }
      const hasTempPath = /\/tmp\/|os\.tmpdir\s*\(|process\.env\.TMPDIR\b/.test(content);
      if (!hasTempPath) {
        return false;
      }
      return /\bexec\s*\(|\bspawn\s*\(/.test(content);
    },
  },

  /**
   * TTP: Reverse shell — open a raw TCP connection then attach a shell to it.
   * Signal 1: raw TCP socket (net.Socket / net.connect / net.createConnection).
   * Signal 2: a shell binary string literal (/bin/sh, cmd.exe, powershell, etc.).
   *
   * Using a generic exec/spawn as the second signal caused false positives on
   * legitimate extensions (LSP servers, debug adapters) that open a TCP connection
   * to their language server AND spawn it with exec/spawn. Requiring a shell binary
   * string literal rules those out — a language server is invoked as 'node' or
   * 'python', never as '/bin/sh'.
   */
  {
    id: 'reverse_shell',
    name: 'Reverse Shell Pattern',
    description:
      'File opens a raw TCP socket (net.Socket, net.connect) and contains a shell binary string literal (/bin/sh, cmd.exe, etc.) — the fingerprint of a reverse shell that rules out legitimate LSP/debug-adapter extensions',
    severity: SeverityLevel.HIGH,
    detect: (content) => {
      const hasSocket = /new\s+net\.Socket\b|net\.connect\s*\(|net\.createConnection\s*\(/.test(content);
      if (!hasSocket) {
        return false;
      }
      return /['"`]\/bin\/(?:sh|bash|dash|zsh|ash|fish)['"`]|['"`](?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh)['"`]/i.test(
        content,
      );
    },
  },

  /**
   * TTP: Dynamic eval payload — decode an encoded blob at runtime then evaluate
   * it as code, bypassing static analysis entirely.
   * Covers base64 (atob, Buffer.from+base64), percent-encoding (decodeURIComponent),
   * and Function constructor with a dynamic argument.
   */
  {
    id: 'eval_dynamic_payload',
    name: 'Dynamic Eval Payload',
    description:
      'File evaluates encoded or dynamically constructed code (eval(atob(...)), eval(Buffer.from(...)), new Function(variable)) — obfuscation-agnostic payload execution pattern',
    severity: SeverityLevel.HIGH,
    detect: (content) => {
      return (
        /eval\s*\(\s*(?:atob|Buffer\.from|decodeURIComponent|unescape)\s*\(/.test(content) ||
        /new\s+Function\s*\([^)]*(?:atob|Buffer\.from|decodeURIComponent)\s*\(/.test(content)
      );
    },
  },

  /**
   * TTP: Stealthy background task delivering a remote payload — the extension
   * creates a VS Code task hidden from the user (presentationOptions.focus = false)
   * that auto-confirms and executes a GitHub package via npx, triggered silently at
   * workspace activation.
   *
   * Signal 1: presentationOptions.focus suppressed (task hidden from terminal panel).
   * Signal 2: npx invoked with -y/--yes and a github: specifier (remote, no user consent).
   *
   * Seen in nrwl.angular-console 18.95.0 (compromised nx-console, 2025).
   */
  {
    id: 'stealth_task_remote_install',
    name: 'Hidden Task — Auto-confirmed Remote Install',
    description:
      'File hides a VS Code task from the user (presentationOptions.focus = false/!1) and auto-confirms a remote GitHub package install via npx — supply-chain payload delivery TTP used in compromised VS Code extensions',
    severity: SeverityLevel.HIGH,
    detect: (content) => {
      const hasHiddenTask = /\.presentationOptions\.focus\s*=\s*(?:false|!1)\b/.test(content);
      if (!hasHiddenTask) {
        return false;
      }
      const hasNpxGithub = /\bnpx\b[^\n]*\bgithub:/i.test(content);
      if (!hasNpxGithub) {
        return false;
      }
      return /(?:--yes|-y)\b/.test(content);
    },
  },

  /**
   * TTP: Process survival after parent exit — spawn a child with detached:true
   * and immediately call .unref() so the payload process keeps running after
   * the extension host terminates. Legitimate extensions have no reason to do this.
   */
  {
    id: 'detached_unref_pattern',
    name: 'Detached Silent Process',
    description:
      'File spawns a process with detached:true and calls .unref() — the standard pattern for launching a payload that outlives the parent process',
    severity: SeverityLevel.MEDIUM,
    detect: (content) => {
      return /detached\s*:\s*true/.test(content) && /\.unref\s*\(\s*\)/.test(content);
    },
  },
];

export function getRuleById(id: string): SourceRule | undefined {
  return SOURCE_RULES.find((r) => r.id === id);
}

export function getAllRules(): SourceRule[] {
  return [...SOURCE_RULES];
}
