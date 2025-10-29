/**
 * Eval Rules - Rule definitions for eval/Function execution analysis
 */

import { SeverityLevel } from '../lib/events/sec-events';
import { Target } from '../lib/events/ext-events';

export enum EvalRuleType {
  CODE_LENGTH = 'CODE_LENGTH',
  SUSPICIOUS_PATTERN = 'SUSPICIOUS_PATTERN',
}

export interface EvalRule {
  id: string;
  name: string;
  description: string;
  type: EvalRuleType;
  target: Target;
  severity: SeverityLevel;
  maxLength?: number;
  pattern?: RegExp;
  confidence: number;
}

/**
 * Eval rules for dynamic code execution analysis
 */
export const EVAL_RULES: EvalRule[] = [
  // Code length rules
  {
    id: 'eval_code_length',
    name: 'Eval Code Length Exceeded',
    description: 'Detected eval() call with code exceeding 100 characters',
    type: EvalRuleType.CODE_LENGTH,
    target: Target.EVAL,
    severity: SeverityLevel.MEDIUM,
    maxLength: 100,
    confidence: 1,
  },
];

export function getRuleById(id: string): EvalRule | undefined {
  return EVAL_RULES.find((rule) => rule.id === id);
}

export function getRulesByType(type: EvalRuleType): EvalRule[] {
  return EVAL_RULES.filter((rule) => rule.type === type);
}

export function getRulesBySeverity(severity: SeverityLevel): EvalRule[] {
  return EVAL_RULES.filter((rule) => rule.severity === severity);
}

export function getAllRules(): EvalRule[] {
  return [...EVAL_RULES];
}
