/**
 * Process Rules - Rule definitions for process execution analysis
 */

import { BaseRule, createRuleHelpers } from './rules';
import { Target } from '../lib/events/ext-events';
import { SeverityLevel } from '../lib/events/sec-events';

export enum ProcessRuleType {
  COMMAND = 'COMMAND',
  SCRIPT = 'SCRIPT',
}

export interface ProcessRule extends BaseRule<ProcessRuleType> {
  commandPattern: RegExp;
  flagPattern?: RegExp; // secondary pattern for command flags
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
    flagPattern: /-(?:enc|encodedcommand|exec|executionpolicy\s+bypass|noprofile|windowstyle\s+hidden|noninteractive)/i,
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
    commandPattern: /\b(sh|bash|zsh|curl|wget)\b/i,
    confidence: 1,
  },
];

const helpers = createRuleHelpers(PROCESS_RULES);

export const getRuleById = helpers.getRuleById;
export const getRulesByType = helpers.getRulesByType;
export const getRulesBySeverity = helpers.getRulesBySeverity;
export const getAllRules = helpers.getAllRules;
