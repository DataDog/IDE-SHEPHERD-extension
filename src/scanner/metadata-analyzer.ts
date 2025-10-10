/**
 * Metadata Analyzer - Applies heuristic rules to analyze extension package.json files
 */

import { Logger } from '../lib/logger';
import {
  HeuristicResult,
  SuspiciousPattern,
  BatchAnalysisResult,
  RiskScoring,
  RiskLevel,
  PatternCategory,
  DependencyVulnerability,
  OSVSeverity,
} from '../lib/heuristics';
import { getAllRules, getRuleById } from '../detection/heuristic-rules';
import { ExtensionPackageJSON } from '../lib/extensions';
import { OSVService } from '../lib/services/osv-service';
import { SeverityLevel } from '../lib/events/sec-events';

export class MetadataAnalyzer {
  /**
   * Analyze an extension's package.json for suspicious patterns
   */
  static analyzeExtension(extensionId: string, packageJSON: ExtensionPackageJSON): HeuristicResult {
    Logger.debug(`MetadataAnalyzer: Analyzing extension ${extensionId}`);

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

    Logger.info(
      `MetadataAnalyzer: Extension ${extensionId} - Risk: ${overallRisk} (${riskScore}), Patterns: ${detectedPatterns.length}`,
    );

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

  /**
   * Check dependencies for known vulnerabilities using OSV database
   * This is an async operation that queries the OSV API
   */
  static async checkDependencyVulnerabilities(
    extensionId: string,
    packageJSON: ExtensionPackageJSON,
  ): Promise<DependencyVulnerability[]> {
    Logger.info(`MetadataAnalyzer: Checking dependencies for vulnerabilities in ${extensionId}`);

    const dependencies = packageJSON.dependencies || {};

    if (Object.keys(dependencies).length === 0) {
      Logger.debug(`MetadataAnalyzer: No dependencies found in ${extensionId}`);
      return [];
    }

    try {
      const vulnerabilities = await OSVService.queryDependencies(dependencies);

      if (vulnerabilities.length > 0) {
        Logger.warn(
          `MetadataAnalyzer: Found ${vulnerabilities.length} dependencies with vulnerabilities in ${extensionId}`,
        );
      } else {
        Logger.info(`MetadataAnalyzer: No vulnerabilities found in dependencies for ${extensionId}`);
      }

      return vulnerabilities;
    } catch (error) {
      Logger.error(`MetadataAnalyzer: Error checking vulnerabilities for ${extensionId}`, error as Error);
      return [];
    }
  }

  /**
   * Analyze extension including OSV vulnerability checks
   * Returns both heuristic analysis and dependency vulnerabilities
   */
  static async analyzeExtensionWithVulnerabilities(
    extensionId: string,
    packageJSON: ExtensionPackageJSON,
  ): Promise<{ heuristicResult: HeuristicResult; vulnerabilities: DependencyVulnerability[] }> {
    Logger.debug(`MetadataAnalyzer: Starting comprehensive analysis for ${extensionId}`);

    const heuristicResult = this.analyzeExtension(extensionId, packageJSON);
    const vulnerabilities = await this.checkDependencyVulnerabilities(extensionId, packageJSON);
    if (vulnerabilities.length > 0) {
      for (const vuln of vulnerabilities) {
        let severity: SeverityLevel;

        // Malicious packages (MAL advisories) are always HIGH severity
        if (vuln.isMalicious) {
          severity = SeverityLevel.HIGH;

          heuristicResult.suspiciousPatterns.push({
            pattern: `MALICIOUS PACKAGE: ${vuln.packageName}`,
            severity,
            description: `${vuln.packageName}@${vuln.version} is flagged as MALICIOUS (${vuln.maliciousAdvisories.length} MAL advisory(ies): ${vuln.maliciousAdvisories.map((m) => m.id).join(', ')})`,
            category: PatternCategory.Dependencies,
          });

          Logger.warn(`MetadataAnalyzer: CRITICAL - Malicious package detected: ${vuln.packageName}@${vuln.version}`);
        }

        if (vuln.vulnerabilities.length > 0) {
          // Map OSV severity to our severity levels
          switch (vuln.highestSeverity) {
            case OSVSeverity.CRITICAL:
            case OSVSeverity.HIGH:
              severity = SeverityLevel.HIGH;
              break;
            case OSVSeverity.MEDIUM:
              severity = SeverityLevel.MEDIUM;
              break;
            case OSVSeverity.LOW:
            default:
              severity = SeverityLevel.LOW;
              break;
          }

          heuristicResult.suspiciousPatterns.push({
            pattern: `Vulnerable Dependency: ${vuln.packageName}`,
            severity,
            description: `${vuln.packageName}@${vuln.version} has ${vuln.vulnerabilities.length} known vulnerability(ies) - Highest: ${vuln.highestSeverity}`,
            category: PatternCategory.Dependencies,
          });
        }
      }

      // Recalculate risk score with vulnerabilities included
      heuristicResult.riskScore = RiskScoring.calculateScore(heuristicResult.suspiciousPatterns);
      heuristicResult.overallRisk = RiskScoring.determineRiskLevel(heuristicResult.riskScore);

      const maliciousCount = vulnerabilities.filter((v) => v.isMalicious).length;
      Logger.info(
        `MetadataAnalyzer: Updated risk for ${extensionId} after vulnerability check - Risk: ${heuristicResult.overallRisk} (${heuristicResult.riskScore}), Malicious: ${maliciousCount}`,
      );
    }

    return { heuristicResult, vulnerabilities };
  }

  /**
   * Batch analyze extensions with vulnerability checking
   */
  static async analyzeBatchWithVulnerabilities(
    extensions: { id: string; packageJSON: ExtensionPackageJSON }[],
  ): Promise<{
    results: Array<{ heuristicResult: HeuristicResult; vulnerabilities: DependencyVulnerability[] }>;
    summary: { total: number; low: number; medium: number; high: number; withVulnerabilities: number };
  }> {
    Logger.info(`MetadataAnalyzer: Starting batch analysis with vulnerabilities for ${extensions.length} extensions`);

    const results = [];
    for (const ext of extensions) {
      const result = await this.analyzeExtensionWithVulnerabilities(ext.id, ext.packageJSON);
      results.push(result);
    }

    const summary = {
      total: results.length,
      low: results.filter((r) => r.heuristicResult.overallRisk === RiskLevel.Low).length,
      medium: results.filter((r) => r.heuristicResult.overallRisk === RiskLevel.Medium).length,
      high: results.filter((r) => r.heuristicResult.overallRisk === RiskLevel.High).length,
      withVulnerabilities: results.filter((r) => r.vulnerabilities.length > 0).length,
    };

    Logger.info(
      `MetadataAnalyzer: Batch analysis with vulnerabilities complete - ${summary.high} high, ${summary.medium} medium, ${summary.low} low risk extensions, ${summary.withVulnerabilities} with vulnerabilities`,
    );

    return { results, summary };
  }
}
