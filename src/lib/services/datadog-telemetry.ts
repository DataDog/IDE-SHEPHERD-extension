/**
 * Datadog Telemetry Types and Enums
 * Centralized definitions for telemetry events, tags, and metadata
 */
import { SeverityLevel } from '../events/sec-events';

export enum DatadogEnvironment {
  PRODUCTION = 'production',
  TEST = 'test',
  DEVELOPMENT = 'development',
}

export enum TelemetryEventType {
  EXTENSION_REPOSITORY = 'extension_repository',
  SECURITY_EVENT = 'security_event',
  METADATA_ANALYSIS = 'metadata_analysis',
  CONNECTION_TEST = 'connection_test',
}

export interface DatadogTags {
  env: DatadogEnvironment;
  type: TelemetryEventType;
  severity?: SeverityLevel;
}

export interface TelemetryLogItem {
  ddsource: string;
  ddtags: string;
  hostname: string;
  message: string;
  service: string;
  event_type: TelemetryEventType;
  timestamp: number;
  machine_id: string;
  [key: string]: any;
}

export function getTelemetryTags(tags: DatadogTags): string {
  const tagParts: string[] = [`env:${tags.env}`, `type:${tags.type}`];

  if (tags.severity) {
    tagParts.push(`severity:${tags.severity}`);
  }

  return tagParts.join(',');
}

export function createBaseTelemetryItem(
  source: string,
  service: string,
  tags: DatadogTags,
  message: string,
  hostname: string,
  machineId: string,
): TelemetryLogItem {
  return {
    ddsource: source,
    ddtags: getTelemetryTags(tags),
    hostname,
    message,
    service,
    event_type: tags.type,
    timestamp: Date.now(),
    machine_id: machineId,
  };
}
