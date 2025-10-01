/**
 * IDE Status Management : keeps track of the status of the IDE monitoring, security events, and performance metrics
 */

import { Timestamp, ExtensionInfo, Target } from './events/ext-events';
import { SecurityEvent } from './events/sec-events';

export enum PlatformType {
  WINDOWS = 'windows',
  MACOS = 'macos',
  LINUX = 'linux',
  UNKNOWN = 'unknown',
}

/**
 * Structured data interface for sidebar display
 */
export interface IDEStatusData {
  isMonitoringActive: boolean;
  uptime: string;
  lastUpdate: string;
  extensionsMonitored: { total: number; extensions: Array<{ id: string }> };
  securityEvents: { total: number; network: number; process: number; recentEvents: SecurityEvent[] };
  performance: { avgProcessingTime: string; eventsProcessed: number; totalProcessingTime: number };
}

/**
 * Global IDE status tracking
 */
export interface IDEStatus {
  // Extension tracking
  patchedExtensions: ExtensionInfo[];

  // Security monitoring
  totalSecurityEvents: number;
  securityEventsByTarget: Record<Target, number>;
  lastSecurityEvents: SecurityEvent[]; // better to have a queue of 10 events or introduce an interface for event summary

  // System state
  monitoringStartTime: Timestamp;
  lastUpdateTime: Timestamp;
  isMonitoringActive: boolean;
  platform: PlatformType;

  // Performance metrics
  totalEventProcessingTime?: number;
  nbrOfEventsProcessed?: number;
}
