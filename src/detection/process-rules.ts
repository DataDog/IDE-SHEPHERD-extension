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
  commandPattern: RegExp;
  flagPattern?: RegExp; // secondary pattern for command flags
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
