/**
 * Base Rule Definitions - Shared interfaces and utilities for all rule types
 */

import { SeverityLevel } from '../lib/events/sec-events';
import { Target } from '../lib/events/ext-events';

export interface BaseRule<T = string> {
  id: string;
  name: string;
  description: string;
  type: T;
  target: Target;
  severity: SeverityLevel;
  confidence: number;
}

export function createRuleHelpers<T extends BaseRule<RuleType>, RuleType = string>(rules: T[]) {
  return {
    getRuleById: (id: string): T | undefined => {
      return rules.find((rule) => rule.id === id);
    },

    getRulesByType: (type: RuleType): T[] => {
      return rules.filter((rule) => rule.type === type);
    },

    getRulesBySeverity: (severity: SeverityLevel): T[] => {
      return rules.filter((rule) => rule.severity === severity);
    },

    getAllRules: (): T[] => {
      return [...rules];
    },
  };
}
