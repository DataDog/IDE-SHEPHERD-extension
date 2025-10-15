/**
 * Datadog Telemetry Types and Enums
 */

import { SeverityLevel } from '../../events/sec-events';

export enum DatadogEnvironment {
  PRODUCTION = 'prod',
  TEST = 'test',
  DEVELOPMENT = 'dev',
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
  source: string;
  tags: string;
  hostname: string;
  message: string;
  service: string;
  event_type: TelemetryEventType;
  timestamp: number;
  [key: string]: any;
}

export interface TelemetryMetadata {
  source: string;
  service: string;
}
