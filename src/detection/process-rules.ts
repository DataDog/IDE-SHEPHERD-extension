/**
 * Process Rules - Rule definitions for process execution analysis
 */

import { SeverityLevel } from '../lib/events/sec-events';
import { Target } from '../lib/events/ext-events';

export enum ProcessRuleType {
  COMMAND = 'COMMAND',
  SCRIPT = 'SCRIPT',
}

export interface ProcessRule {
  id: string;
  name: string;
  description: string;
  type: ProcessRuleType;
  target: Target;
  severity: SeverityLevel;
  /** Pattern matched against the command string. Optional when optionsMatcher covers the full signal. */
  commandPattern?: RegExp;
  flagPattern?: RegExp;
  /** Matched against exec/spawn options object. When present alongside commandPattern, both must match. */
  optionsMatcher?: (options: Record<string, unknown>) => boolean;
  confidence: number;
}

/**
 * Process rules for command execution analysis
 */
export const PROCESS_RULES: ProcessRule[] = [
  // PowerShell Execution Rules
  {
    id: 'powershell_execution',
    name: 'PowerShell Execution',
    description: 'Detected suspicious PowerShell execution',
    type: ProcessRuleType.SCRIPT,
    target: Target.PROCESS,
    severity: SeverityLevel.HIGH,
    commandPattern: /\b(powershell|pwsh)(\.exe)?\b/i,
    flagPattern:
      /-(?:c(?:ommand)?|enc(?:odedcommand)?|exec(?:utionpolicy)?(?:\s+bypass)?|noprofile|w(?:indowstyle)?(?:\s+hidden)?|noninteractive)/i,
    confidence: 1,
  },

  // Command Injection Rules
  {
    id: 'command_injection',
    name: 'Command Injection',
    description: 'Detected command injection attempt',
    type: ProcessRuleType.COMMAND,
    target: Target.PROCESS,
    severity: SeverityLevel.HIGH,
    commandPattern: /(?:\|\s*(sh|bash|zsh|cmd)\b|\b(curl|wget)\b)/i,
    confidence: 1,
  },

  // Windows Script Host execution — cscript/wscript/mshta are not used by legitimate VS Code extensions
  {
    id: 'windows_script_host',
    name: 'Windows Script Host Execution',
    description:
      'Detected execution via cscript, wscript, or mshta — Windows scripting hosts that legitimate VS Code extensions do not invoke',
    type: ProcessRuleType.COMMAND,
    target: Target.PROCESS,
    severity: SeverityLevel.HIGH,
    commandPattern: /\b(?:cscript|wscript|mshta)(\.exe)?\b/i,
    confidence: 0.95,
  },

  // Detached silent process — payload delivery pattern
  {
    id: 'detached_silent_process',
    name: 'Detached Silent Process',
    description:
      'Process spawned detached with stdio ignored — common pattern for delivering and running a payload independently of the extension host',
    type: ProcessRuleType.COMMAND,
    target: Target.PROCESS,
    severity: SeverityLevel.HIGH,
    optionsMatcher: (opts) => opts['detached'] === true && opts['stdio'] === 'ignore',
    confidence: 0.9,
  },
];

export function getRuleById(id: string): ProcessRule | undefined {
  return PROCESS_RULES.find((rule) => rule.id === id);
}

export function getRulesByType(type: ProcessRuleType): ProcessRule[] {
  return PROCESS_RULES.filter((rule) => rule.type === type);
}

export function getRulesBySeverity(severity: SeverityLevel): ProcessRule[] {
  return PROCESS_RULES.filter((rule) => rule.severity === severity);
}

export function getAllRules(): ProcessRule[] {
  return [...PROCESS_RULES];
}
