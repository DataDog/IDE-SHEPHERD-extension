/**
 * Task Rules - Rule definitions for VS Code task execution analysis
 */

import { SeverityLevel } from '../lib/events/sec-events';
import { Target } from '../lib/events/ext-events';

export enum TaskRuleType {
  NETWORK = 'NETWORK',
  REMOTE_SCRIPT = 'REMOTE_SCRIPT',
  DESTRUCTIVE = 'DESTRUCTIVE',
  PRIVILEGE_ESCALATION = 'PRIVILEGE_ESCALATION',
  ENCODED_COMMAND = 'ENCODED_COMMAND',
}

export interface TaskRule {
  id: string;
  name: string;
  description: string;
  type: TaskRuleType;
  target: Target;
  severity: SeverityLevel;
  commandPattern: RegExp;
  confidence: number;
}

/**
 * Task rules for VS Code task execution analysis
 */
export const TASK_RULES: TaskRule[] = [
  // Network Download Rules
  {
    id: 'task_curl_download',
    name: 'Task: Network Download (curl)',
    description: 'Task attempts to download content from the internet using curl',
    type: TaskRuleType.NETWORK,
    target: Target.WORKSPACE,
    severity: SeverityLevel.HIGH,
    commandPattern: /curl.*http/i,
    confidence: 1,
  },
  {
    id: 'task_wget_download',
    name: 'Task: Network Download (wget)',
    description: 'Task attempts to download content from the internet using wget',
    type: TaskRuleType.NETWORK,
    target: Target.WORKSPACE,
    severity: SeverityLevel.HIGH,
    commandPattern: /wget/i,
    confidence: 1,
  },

  // Remote Script Execution Rules
  {
    id: 'task_temp_script',
    name: 'Task: Temporary Script Execution',
    description: 'Task executes a script from the temporary directory',
    type: TaskRuleType.REMOTE_SCRIPT,
    target: Target.WORKSPACE,
    severity: SeverityLevel.MEDIUM,
    commandPattern: /\/tmp\/.*\.sh/i,
    confidence: 1,
  },

  // Encoded Command Rules
  {
    id: 'task_powershell_encoded',
    name: 'Task: PowerShell Encoded Command',
    description: 'Task uses PowerShell with encoded command (common in malware)',
    type: TaskRuleType.ENCODED_COMMAND,
    target: Target.WORKSPACE,
    severity: SeverityLevel.HIGH,
    commandPattern: /powershell.*-enc/i,
    confidence: 1,
  },
  {
    id: 'task_base64_decode',
    name: 'Task: Base64 Decode',
    description: 'Task uses base64 decoding (potential obfuscation)',
    type: TaskRuleType.ENCODED_COMMAND,
    target: Target.WORKSPACE,
    severity: SeverityLevel.MEDIUM,
    commandPattern: /base64.*decode/i,
    confidence: 1,
  },
  {
    id: 'task_eval',
    name: 'Task: Dynamic Code Evaluation',
    description: 'Task uses eval() for dynamic code execution',
    type: TaskRuleType.ENCODED_COMMAND,
    target: Target.WORKSPACE,
    severity: SeverityLevel.HIGH,
    commandPattern: /eval\(/i,
    confidence: 1,
  },

  // Destructive Operation Rules
  {
    id: 'task_rm_rf',
    name: 'Task: Recursive File Deletion',
    description: 'Task attempts to recursively delete files',
    type: TaskRuleType.DESTRUCTIVE,
    target: Target.WORKSPACE,
    severity: SeverityLevel.MEDIUM,
    commandPattern: /rm\s+-rf/i,
    confidence: 1,
  },

  // Privilege Escalation Rules
  {
    id: 'task_chmod_executable',
    name: 'Task: Make File Executable',
    description: 'Task makes a file executable (potential backdoor setup)',
    type: TaskRuleType.PRIVILEGE_ESCALATION,
    target: Target.WORKSPACE,
    severity: SeverityLevel.MEDIUM,
    commandPattern: /chmod\s+\+x/i,
    confidence: 1,
  },
  {
    id: 'task_sudo',
    name: 'Task: Sudo Execution',
    description: 'Task uses sudo for privilege escalation',
    type: TaskRuleType.PRIVILEGE_ESCALATION,
    target: Target.WORKSPACE,
    severity: SeverityLevel.HIGH,
    commandPattern: /sudo/i,
    confidence: 1,
  },
];

export function getRuleById(id: string): TaskRule | undefined {
  return TASK_RULES.find((rule) => rule.id === id);
}

export function getRulesByType(type: TaskRuleType): TaskRule[] {
  return TASK_RULES.filter((rule) => rule.type === type);
}

export function getRulesBySeverity(severity: SeverityLevel): TaskRule[] {
  return TASK_RULES.filter((rule) => rule.severity === severity);
}

export function getAllRules(): TaskRule[] {
  return [...TASK_RULES];
}
