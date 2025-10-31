/**
 * Metadata Analyzer - Applies heuristic rules to analyze extension package.json files
 */

import { Logger } from '../lib/logger';
import { HeuristicResult, SuspiciousPattern, BatchAnalysisResult, RiskScoring, RiskLevel } from '../lib/heuristics';
import { getAllRules, getRuleById } from '../detection/heuristic-rules';
import { ExtensionPackageJSON } from '../lib/extensions';

export class MetadataAnalyzer {
  /**
   * Analyze an extension's package.json for suspicious patterns
   */
  static analyzeExtension(extensionId: string, packageJSON: ExtensionPackageJSON): HeuristicResult {
    const detectedPatterns: SuspiciousPattern[] = [];

    const rules = getAllRules();
    for (const rule of rules) {
      try {
        if (rule.check(packageJSON)) {
          detectedPatterns.push({
            pattern: rule.name,
            severity: rule.severity,
            description: rule.description,
            category: rule.category,
          });
          Logger.debug(`MetadataAnalyzer: Detected pattern ${rule.id} in ${extensionId}`);
        }
      } catch (error) {
        Logger.warn(`MetadataAnalyzer: Error applying rule ${rule.id} to ${extensionId}: ${error}`);
      }
    }

    const riskScore = RiskScoring.calculateScore(detectedPatterns);
    const overallRisk = RiskScoring.determineRiskLevel(riskScore);

    return { extensionId, suspiciousPatterns: detectedPatterns, riskScore, overallRisk };
  }

  /**
   * Analyze multiple extensions and return summary
   */
  static analyzeBatch(extensions: { id: string; packageJSON: ExtensionPackageJSON }[]): BatchAnalysisResult {
    Logger.info(`MetadataAnalyzer: Starting batch analysis of ${extensions.length} extensions`);

    const results = extensions.map((ext) => this.analyzeExtension(ext.id, ext.packageJSON));

    const summary = {
      total: results.length,
      low: results.filter((r) => r.overallRisk === RiskLevel.Low).length,
      medium: results.filter((r) => r.overallRisk === RiskLevel.Medium).length,
      high: results.filter((r) => r.overallRisk === RiskLevel.High).length,
    };

    Logger.info(
      `MetadataAnalyzer: Batch analysis complete - ${summary.high} high, ${summary.medium} medium, ${summary.low} low risk extensions`,
    );

    return { results, summary };
  }

  /**
   * Get detailed analysis for a specific rule
   */
  static analyzeWithRule(
    extensionId: string,
    packageJSON: ExtensionPackageJSON,
    ruleId: string,
  ): { matches: boolean; details?: string } {
    const rule = getRuleById(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    try {
      const matches = rule.check(packageJSON);
      const details = rule.getDetails ? rule.getDetails(packageJSON) : undefined;

      return { matches, details };
    } catch (error) {
      Logger.warn(`MetadataAnalyzer: Error applying rule ${ruleId} to ${extensionId}: ${error}`);
      return { matches: false };
    }
  }
}
