/**
 * Metadata Analyzer - Applies heuristic rules to analyze extension package.json files
 */

import { Logger } from '../lib/logger';
import { HeuristicResult, SuspiciousPattern, BatchAnalysisResult, RiskScoring, RiskLevel } from '../lib/heuristics';
import { HeuristicRules } from '../detection/heuristic-rules';

export class MetadataAnalyzer {
  /**
   * Analyze an extension's package.json for suspicious patterns
   */
  static analyzeExtension(extensionId: string, packageJSON: any): HeuristicResult {
    Logger.debug(`MetadataAnalyzer: Analyzing extension ${extensionId}`);

    const detectedPatterns: SuspiciousPattern[] = [];

    const rules = HeuristicRules.getAllRules();
    for (const rule of rules) {
      try {
        if (rule.check(packageJSON)) {
          detectedPatterns.push({
            pattern: rule.id,
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

    Logger.info(
      `MetadataAnalyzer: Extension ${extensionId} - Risk: ${overallRisk} (${riskScore}), Patterns: ${detectedPatterns.length}`,
    );

    return { extensionId, suspiciousPatterns: detectedPatterns, riskScore, overallRisk };
  }

  /**
   * Analyze multiple extensions and return summary
   */
  static analyzeBatch(extensions: Array<{ id: string; packageJSON: any }>): BatchAnalysisResult {
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
    packageJSON: any,
    ruleId: string,
  ): { matches: boolean; details?: string } {
    const rule = HeuristicRules.getRuleById(ruleId);
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
