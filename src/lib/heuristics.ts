/**
 * Heuristics - Interfaces and rule definitions for extension security analysis
 */

export type MetadataSeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type PatternCategory = 'metadata' | 'permissions' | 'activation' | 'commands';  // add advisories for dependencies
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SuspiciousPattern {
  pattern: string;
  severity: MetadataSeverityLevel;
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
  severity: MetadataSeverityLevel;
  check: (packageJSON: any) => boolean;
  getDetails?: (packageJSON: any) => string;
}

export interface BatchAnalysisResult {
  results: HeuristicResult[];
  summary: {
    total: number;
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

/**
 * Risk scoring configuration - centralize the scoring and move it to config
 */
export class RiskScoring {
  static readonly SEVERITY_WEIGHTS: Record<MetadataSeverityLevel, number> = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 100
  };

  static readonly RISK_THRESHOLDS = {
    low: 0,
    medium: 25,
    high: 50,
    critical: 80
  };

  static calculateScore(patterns: SuspiciousPattern[]): number {
    let totalScore = 0;
    for (const pattern of patterns) {
      totalScore += this.SEVERITY_WEIGHTS[pattern.severity];
    }
    return Math.min(totalScore, 100);
  }

  static determineRiskLevel(riskScore: number): RiskLevel {
    if (riskScore >= this.RISK_THRESHOLDS.critical) return 'critical';
    if (riskScore >= this.RISK_THRESHOLDS.high) return 'high';
    if (riskScore >= this.RISK_THRESHOLDS.medium) return 'medium';
    return 'low';
  }
}

