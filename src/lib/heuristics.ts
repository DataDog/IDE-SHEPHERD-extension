/**
 * Heuristics - Interfaces and rule definitions for extension security analysis
 */
import { SeverityLevel } from './events/sec-events';
import type { ExtensionPackageJSON } from './extensions';

export enum PatternCategory {
  Metadata = 'metadata',
  Activation = 'activation',
  Commands = 'commands', // add advisories for dependencies
}

export enum RiskLevel {
  None = 'none',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export interface SuspiciousPattern {
  pattern: string;
  severity: SeverityLevel;
  description: string;
  category: PatternCategory;
}

export interface HeuristicResult {
  extensionId: string;
  suspiciousPatterns: SuspiciousPattern[];
  riskScore: number; // 0-100
  overallRisk: RiskLevel;
}

export interface HeuristicRule {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  severity: SeverityLevel;
  check: (packageJSON: ExtensionPackageJSON) => boolean;
  getDetails?: (packageJSON: ExtensionPackageJSON) => string;
}

export interface BatchAnalysisResult {
  results: HeuristicResult[];
  summary: { total: number; low: number; medium: number; high: number };
}

/**
 * Risk scoring configuration - centralize the scoring and move it to config
 */
export class RiskScoring {
  static readonly SEVERITY_WEIGHTS: Record<SeverityLevel, number> = {
    [SeverityLevel.LOW]: 20,
    [SeverityLevel.MEDIUM]: 50,
    [SeverityLevel.HIGH]: 80,
  };

  static readonly RISK_THRESHOLDS = { low: 20, medium: 40, high: 80 };

  static calculateScore(patterns: SuspiciousPattern[]): number {
    let totalScore = 0;
    for (const pattern of patterns) {
      totalScore += this.SEVERITY_WEIGHTS[pattern.severity];
    }
    return totalScore;
  }

  static determineRiskLevel(riskScore: number): RiskLevel {
    if (riskScore >= this.RISK_THRESHOLDS.high) {
      return RiskLevel.High;
    }
    if (riskScore >= this.RISK_THRESHOLDS.medium) {
      return RiskLevel.Medium;
    }
    if (riskScore >= this.RISK_THRESHOLDS.low) {
      return RiskLevel.Low;
    }
    return RiskLevel.None;
  }
}
