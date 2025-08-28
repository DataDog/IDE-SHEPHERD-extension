/**
 * IDE Status Management : keeps track of the status of the IDE monitoring, security events, and performance metrics
 */

import { TargetEvent, Timestamp, ExtensionInfo, Target } from './events/ext-events';
import { SecurityEvent, SeverityLevel } from './events/sec-events';

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
    
    // Performance metrics
    totalEventProcessingTime?: number;
    nbrOfEventsProcessed?: number;
    memoryUsage?: number;
}