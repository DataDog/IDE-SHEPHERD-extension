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
    if (patterns.length === 0) {
      return 0;
    }

    // Sort weights descending so the most severe finding anchors the score.
    const weights = patterns.map((p) => this.SEVERITY_WEIGHTS[p.severity]).sort((a, b) => b - a);

    // Base score = highest single finding.
    // Each additional finding contributes 25% of its own weight so that
    // accumulating many LOW patterns cannot push a score into HIGH territory.
    const base = weights[0];
    const bonus = weights.slice(1).reduce((sum, w) => sum + Math.floor(w * 0.25), 0);
    return base + bonus;
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
