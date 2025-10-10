/**
 * OSV Service - Queries Open Source Vulnerabilities (OSV) database
 * Documentation: https://osv.dev/
 */

import { Logger } from '../logger';
import { OSVQueryResponse, DependencyVulnerability, OSVVulnerability, OSVSeverity } from '../heuristics';
import { CONFIG } from '../config';

export class OSVService {
  private static readonly OSV_API_URL = 'https://api.osv.dev/v1';

  // Simple in-memory cache to avoid redundant API calls
  private static cache: Map<string, { data: OSVQueryResponse; timestamp: number }> = new Map();

  /**
   * Query OSV database for vulnerabilities in a specific package
   * Handles pagination to get all results
   */
  static async queryPackage(
    packageName: string,
    version: string,
    ecosystem: string = 'npm',
  ): Promise<OSVQueryResponse> {
    const cacheKey = `${ecosystem}:${packageName}:${version}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONFIG.OSV.CACHE_TTL) {
      Logger.debug(`OSVService: Cache hit for ${cacheKey}`);
      return cached.data;
    }

    try {
      Logger.debug(`OSVService: Querying vulnerabilities for ${packageName}@${version}`);

      const allVulns: OSVVulnerability[] = [];
      let pageToken: string | undefined = undefined;

      do {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.OSV.REQUEST_TIMEOUT);

        const requestBody: any = { package: { name: packageName, ecosystem: ecosystem }, version: version };

        if (pageToken) {
          requestBody.page_token = pageToken;
        }

        const response = await fetch(`${this.OSV_API_URL}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`OSV API returned status ${response.status}`);
        }

        const data = (await response.json()) as OSVQueryResponse;

        if (data.vulns && data.vulns.length > 0) {
          allVulns.push(...data.vulns);
        }

        pageToken = data.next_page_token;
      } while (pageToken);

      const result: OSVQueryResponse = { vulns: allVulns.length > 0 ? allVulns : undefined };

      // Cache the complete result
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });

      Logger.debug(`OSVService: Found ${allVulns.length} vulnerabilities for ${packageName}@${version}`);

      return result;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        Logger.warn(`OSVService: Request timeout for ${packageName}@${version}`);
      } else {
        Logger.error(`OSVService: Error querying ${packageName}@${version}`, error as Error);
      }
      return {};
    }
  }

  /**
   * Batch query multiple dependencies and return vulnerability summary
   */
  static async queryDependencies(
    dependencies: Record<string, string>,
    ecosystem: string = 'npm',
  ): Promise<DependencyVulnerability[]> {
    Logger.info(`OSVService: Querying ${Object.keys(dependencies).length} dependencies for vulnerabilities`);

    const results: DependencyVulnerability[] = [];

    const entries = Object.entries(dependencies);
    const batchSize = CONFIG.OSV.BATCH_SIZE;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const batchPromises = batch.map(async ([packageName, versionRange]) => {
        // Clean version range (remove ^, ~, >=, etc.)
        const cleanVersion = this.cleanVersionRange(versionRange);

        const response = await this.queryPackage(packageName, cleanVersion, ecosystem);

        if (response.vulns && response.vulns.length > 0) {
          const maliciousAdvisories = response.vulns.filter((v) => this.isMaliciousAdvisory(v));
          const regularVulns = response.vulns.filter((v) => !this.isMaliciousAdvisory(v));

          const highestSeverity = this.determineHighestSeverity(response.vulns);

          return {
            packageName,
            version: versionRange,
            vulnerabilities: regularVulns,
            maliciousAdvisories,
            highestSeverity,
            isMalicious: maliciousAdvisories.length > 0,
          };
        }

        return null;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is DependencyVulnerability => r !== null));
    }

    const maliciousCount = results.filter((r) => r.isMalicious).length;
    Logger.info(
      `OSVService: Found ${results.length} dependencies with issues (${maliciousCount} malicious) out of ${entries.length} checked`,
    );

    return results;
  }

  private static isMaliciousAdvisory(vuln: OSVVulnerability): boolean {
    return vuln.id.startsWith('MAL-');
  }

  private static cleanVersionRange(versionRange: string): string {
    // Remove common version range operators
    return versionRange.replace(/^[\^~>=<]+/, '').split(/\s+/)[0] || '0.0.0';
  }

  private static determineHighestSeverity(vulnerabilities: OSVVulnerability[]): OSVSeverity {
    const severityOrder: Record<OSVSeverity, number> = {
      [OSVSeverity.CRITICAL]: 4,
      [OSVSeverity.HIGH]: 3,
      [OSVSeverity.MEDIUM]: 2,
      [OSVSeverity.LOW]: 1,
      [OSVSeverity.UNKNOWN]: 0,
    };
    let highest: OSVSeverity = OSVSeverity.UNKNOWN;

    for (const vuln of vulnerabilities) {
      let severity: OSVSeverity = OSVSeverity.UNKNOWN;

      // MAL advisories are ALWAYS critical - these are known malicious packages
      if (this.isMaliciousAdvisory(vuln)) {
        severity = OSVSeverity.CRITICAL;
      }
      // Try to extract severity from different fields
      else if (vuln.database_specific?.severity) {
        severity = this.normalizeSeverity(vuln.database_specific.severity);
      } else if (vuln.severity && vuln.severity.length > 0) {
        // CVSS score-based severity
        const score = parseFloat(vuln.severity[0].score);
        if (score >= 9.0) {
          severity = OSVSeverity.CRITICAL;
        } else if (score >= 7.0) {
          severity = OSVSeverity.HIGH;
        } else if (score >= 4.0) {
          severity = OSVSeverity.MEDIUM;
        } else {
          severity = OSVSeverity.LOW;
        }
      }

      if (severityOrder[severity] > severityOrder[highest]) {
        highest = severity;
      }
    }

    return highest;
  }

  /**
   * Normalize severity string to standard levels
   */
  private static normalizeSeverity(severity: string): OSVSeverity {
    const normalized = severity.toUpperCase();
    if (normalized.includes('CRITICAL')) {
      return OSVSeverity.CRITICAL;
    }
    if (normalized.includes('HIGH')) {
      return OSVSeverity.HIGH;
    }
    if (normalized.includes('MODERATE') || normalized.includes('MEDIUM')) {
      return OSVSeverity.MEDIUM;
    }
    if (normalized.includes('LOW')) {
      return OSVSeverity.LOW;
    }
    return OSVSeverity.UNKNOWN;
  }

  /**
   * Clear the cache (useful for testing or forced refresh)
   */
  static clearCache(): void {
    this.cache.clear();
    Logger.debug('OSVService: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; entries: string[] } {
    return { size: this.cache.size, entries: Array.from(this.cache.keys()) };
  }
}
