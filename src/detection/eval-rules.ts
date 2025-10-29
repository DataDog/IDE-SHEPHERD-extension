/**
 * Eval Rules - Rule definitions for eval/Function execution analysis
 */

import { BaseRule, createRuleHelpers } from './rules';
import { Target } from '../lib/events/ext-events';
import { SeverityLevel } from '../lib/events/sec-events';

export enum EvalRuleType {
  CODE_LENGTH = 'CODE_LENGTH',
  SUSPICIOUS_PATTERN = 'SUSPICIOUS_PATTERN',
}

export interface EvalRule extends BaseRule<EvalRuleType> {
  maxLength?: number;
  pattern?: RegExp;
}

/**
 * Eval rules for dynamic code execution analysis
 */
export const EVAL_RULES: EvalRule[] = [
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

const helpers = createRuleHelpers(EVAL_RULES);

export const getRuleById = helpers.getRuleById;
export const getRulesByType = helpers.getRulesByType;
export const getRulesBySeverity = helpers.getRulesBySeverity;
export const getAllRules = helpers.getAllRules;
