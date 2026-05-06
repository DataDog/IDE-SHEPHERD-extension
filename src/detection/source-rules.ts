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
   * TTP: Download-and-execute — fetch a remote payload then run it.
   * Requires both a network download primitive and a shell execution primitive
   * in the same file. Either alone is common in legitimate code; the combination
   * is the payload-delivery pattern.
   */
  {
    id: 'download_and_execute',
    name: 'Download and Execute',
    description:
      'File contains both a network download primitive (https.get, fetch, XMLHttpRequest) and a shell execution primitive (exec, spawn) — the core download-and-execute payload delivery pattern',
    severity: SeverityLevel.MEDIUM,
    detect: (content) => {
      const hasDownload = /https?\.get\s*\(|fetch\s*\(|new\s+XMLHttpRequest\b/.test(content);
      if (!hasDownload) {
        return false;
      }
      return /\bexec\s*\(|\bspawn\s*\(/.test(content);
    },
  },

  /**
   * TTP: Reverse shell — open a raw TCP connection then attach a shell to it.
   * Requires both a raw socket creation and a shell execution in the same file.
   */
  {
    id: 'reverse_shell',
    name: 'Reverse Shell Pattern',
    description:
      'File opens a raw TCP socket (net.Socket, net.connect) and calls exec/spawn — the standard building blocks of a reverse shell',
    severity: SeverityLevel.HIGH,
    detect: (content) => {
      const hasSocket = /new\s+net\.Socket\b|net\.connect\s*\(|net\.createConnection\s*\(/.test(content);
      if (!hasSocket) {
        return false;
      }
      return /\bexec\s*\(|\bspawn\s*\(/.test(content);
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
