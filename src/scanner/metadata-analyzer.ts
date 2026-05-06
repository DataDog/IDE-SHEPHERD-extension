/**
 * Metadata Analyzer - Applies heuristic rules to analyze extension package.json files
 */

import { Logger } from '../lib/logger';
import { HeuristicResult, SuspiciousPattern, BatchAnalysisResult, RiskScoring, RiskLevel } from '../lib/heuristics';
import { getAllRules, getRuleById } from '../detection/heuristic-rules';
import { Extension, ExtensionPackageJSON } from '../lib/extensions';
import { SourceAnalyzer } from './source-analyzer';

export class MetadataAnalyzer {
  /**
   * Analyze an extension's package.json for suspicious metadata patterns.
   * Source-code scanning is not included here — use analyzeExtensionCombined for that.
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
   * Run both metadata and source-code analysis for a single extension,
   * merging all findings into one HeuristicResult.
   */
  static async analyzeExtensionCombined(extension: Extension): Promise<HeuristicResult> {
    const metadataResult = this.analyzeExtension(extension.id, extension.packageJSON ?? {});
    const sourcePatterns = await SourceAnalyzer.analyzeExtension(extension.id, extension.extensionPath);

    const allPatterns = [...metadataResult.suspiciousPatterns, ...sourcePatterns];
    const riskScore = RiskScoring.calculateScore(allPatterns);
    const overallRisk = RiskScoring.determineRiskLevel(riskScore);

    return { extensionId: extension.id, suspiciousPatterns: allPatterns, riskScore, overallRisk };
  }

  /**
   * Analyze multiple extensions (metadata + source) and return a summary.
   */
  static async analyzeBatch(extensions: Extension[]): Promise<BatchAnalysisResult> {
    Logger.info(`MetadataAnalyzer: Starting batch analysis of ${extensions.length} extensions`);

    const results = await Promise.all(extensions.map((ext) => this.analyzeExtensionCombined(ext)));

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
