/**
 * Telemetry Builder - Creates structured telemetry payloads
 */

import * as os from 'os';
import { Extension, ExtensionPackageJSON } from '../../extensions';
import { SecurityEvent } from '../../events/sec-events';
import { HeuristicResult } from '../../heuristics';
import { TelemetryLogItem, DatadogTags, DatadogEnvironment, TelemetryEventType, TelemetryMetadata } from './types';

/**
 * Helper to build ddtags string from DatadogTags
 */
function buildTags(tags: DatadogTags): string {
  const tagParts: string[] = [`env:${tags.env}`, `type:${tags.type}`];

  if (tags.severity) {
    tagParts.push(`severity:${tags.severity}`);
  }

  return tagParts.join(',');
}

/**
 * Base telemetry payload
 */
function createBaseTelemetryItem(
  metadata: TelemetryMetadata,
  tags: DatadogTags,
  message: string,
  hostname: string,
): TelemetryLogItem {
  return {
    source: metadata.source,
    tags: buildTags(tags),
    hostname,
    message,
    service: metadata.service,
    event_type: tags.type,
    timestamp: Date.now(),
  };
}

/**
 * Builds telemetry payloads for different data types
 */
export class TelemetryBuilder {
  private metadata: TelemetryMetadata;
  private hostname: string;

  constructor(metadata: TelemetryMetadata, hostname: string) {
    this.metadata = metadata;
    this.hostname = hostname;
  }

  buildConnectionTest(): TelemetryLogItem {
    const tags: DatadogTags = { env: DatadogEnvironment.TEST, type: TelemetryEventType.CONNECTION_TEST };

    return createBaseTelemetryItem(this.metadata, tags, 'Datadog Agent Connection Test', this.hostname);
  }

  /**
   * Extension repository data
   */
  buildExtensionRepositoryData(extensions: Extension[]): TelemetryLogItem {
    const tags: DatadogTags = { env: DatadogEnvironment.PRODUCTION, type: TelemetryEventType.EXTENSION_REPOSITORY };

    return {
      ...createBaseTelemetryItem(this.metadata, tags, 'Extension Repository Data', this.hostname),
      extensions_count: extensions.length,
      extensions: extensions.map((ext) => ({
        id: ext.id,
        displayName: ext.displayName,
        isActive: ext.isActive,
        isBuiltIn: ext.isBuiltIn,
        publisher: ext.packageJSON?.publisher,
        version: ext.packageJSON?.version,
        description: ext.packageJSON?.description,
      })),
      user_extensions_count: extensions.filter((ext) => !ext.isBuiltIn).length,
      active_extensions_count: extensions.filter((ext) => ext.isActive).length,
    };
  }

  /**
   * Security event
   */
  buildSecurityEvent(securityEvent: SecurityEvent): TelemetryLogItem {
    const tags: DatadogTags = {
      env: DatadogEnvironment.PRODUCTION,
      type: TelemetryEventType.SECURITY_EVENT,
      severity: securityEvent.severity,
    };

    return {
      ...createBaseTelemetryItem(
        this.metadata,
        tags,
        `Security Event: ${securityEvent.getPrimaryIoC().rule}`,
        this.hostname,
      ),
      timestamp: securityEvent.timestamp,
      security_event_id: securityEvent.secEventId,
      severity: securityEvent.severity,
      extension_id: securityEvent.extension.id,
      extension_is_patched: securityEvent.extension.isPatched,
      iocs: securityEvent.iocs,
      summary: securityEvent.getSummary(),
    };
  }

  /**
   * Metadata analysis
   */
  buildMetadataAnalysis(results: HeuristicResult[]): TelemetryLogItem {
    const tags: DatadogTags = { env: DatadogEnvironment.PRODUCTION, type: TelemetryEventType.METADATA_ANALYSIS };

    return {
      ...createBaseTelemetryItem(this.metadata, tags, 'Extension Metadata Analysis', this.hostname),
      total_analyzed: results.length,
      results: results.map((result) => ({
        extension_id: result.extensionId,
        risk_score: result.riskScore,
        risk_level: result.overallRisk,
        suspicious_patterns_count: result.suspiciousPatterns.length,
        patterns: result.suspiciousPatterns.map((pattern) => ({
          pattern: pattern.pattern,
          severity: pattern.severity,
          category: pattern.category,
        })),
      })),
      high_risk_count: results.filter((r) => r.overallRisk === 'high').length,
      medium_risk_count: results.filter((r) => r.overallRisk === 'medium').length,
      low_risk_count: results.filter((r) => r.overallRisk === 'low').length,
    };
  }
}
