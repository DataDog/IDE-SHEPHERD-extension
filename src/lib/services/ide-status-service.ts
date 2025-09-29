/**
 * Unified IDE Status Service - manages and displays IDE security monitoring status
 */

import * as vscode from 'vscode';
import { ExtensionInfo, Target, Timestamp } from '../events/ext-events';
import { SecurityEvent } from '../events/sec-events';
import { IDEStatus } from '../ide-status';
import { NotificationService } from './notification-service';

export class IDEStatusService {
  private static _status: IDEStatus;
  private static _lock = false;
  private static readonly MAX_RECENT_EVENTS = 10;

  // Logger output channel (moved from old IDEStatusManager)
  public static _outputChannel: any = null;

  // Initialize the status on first access
  private static ensureInitialized(): void {
    if (!this._status) {
      this._status = this.createInitialStatus();
    }
  }

  private static createInitialStatus(): IDEStatus {
    return {
      patchedExtensions: [],
      totalSecurityEvents: 0,
      securityEventsByTarget: { [Target.NETWORK]: 0, [Target.FILESYSTEM]: 0, [Target.WORKSPACE]: 0 },
      lastSecurityEvents: [],
      monitoringStartTime: Date.now(),
      lastUpdateTime: Date.now(),
      isMonitoringActive: true,
      totalEventProcessingTime: 0,
      nbrOfEventsProcessed: 0,
      memoryUsage: 0,
    };
  }

  /**
   * Simple spinlock for thread safety
   */
  private static async acquireLock(): Promise<void> {
    while (this._lock) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    this._lock = true;
  }

  private static releaseLock(): void {
    this._lock = false;
  }

  // === Core Status Management Methods ===

  static async getStatus(): Promise<IDEStatus> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      return JSON.parse(JSON.stringify(this._status)); // deep copy
    } finally {
      this.releaseLock();
    }
  }

  static async updatePatchedExtension(extension: ExtensionInfo): Promise<void> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      // Remove existing entry and add updated one
      this._status.patchedExtensions = this._status.patchedExtensions.filter((ext) => ext.id !== extension.id);
      if (extension.isPatched) {
        this._status.patchedExtensions.push(extension);
      }
      this._status.lastUpdateTime = Date.now();
    } finally {
      this.releaseLock();
    }
  }

  static async updatePatchedExtensions(extensions: ExtensionInfo[]): Promise<void> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      // Clear existing and populate with new data
      this._status.patchedExtensions = [];
      for (const extension of extensions) {
        if (extension.isPatched) {
          this._status.patchedExtensions.push(extension);
        }
      }
      this._status.lastUpdateTime = Date.now();
    } finally {
      this.releaseLock();
    }
  }

  static async emitSecurityEvent(event: SecurityEvent): Promise<void> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      this._status.totalSecurityEvents++;

      // Update per-target counters
      const target = event.eventTarget.eventType;
      this._status.securityEventsByTarget[target]++;

      // Add to recent events queue
      this._status.lastSecurityEvents.unshift(event);
      if (this._status.lastSecurityEvents.length > this.MAX_RECENT_EVENTS) {
        this._status.lastSecurityEvents = this._status.lastSecurityEvents.slice(0, this.MAX_RECENT_EVENTS);
      }

      this._status.lastUpdateTime = Date.now();
    } finally {
      this.releaseLock();
    }
  }

  static async updatePerformanceMetrics(processingTime?: number, memoryUsage?: number): Promise<void> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      if (
        processingTime !== undefined &&
        this._status.totalEventProcessingTime !== undefined &&
        this._status.nbrOfEventsProcessed !== undefined
      ) {
        this._status.totalEventProcessingTime += processingTime; // in ms
        this._status.nbrOfEventsProcessed++;
      }

      if (memoryUsage !== undefined) {
        this._status.memoryUsage = memoryUsage;
      }

      this._status.lastUpdateTime = Date.now();
    } finally {
      this.releaseLock();
    }
  }

  static async setMonitoringStatus(isActive: boolean): Promise<void> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      this._status.isMonitoringActive = isActive;
      this._status.lastUpdateTime = Date.now();
    } finally {
      this.releaseLock();
    }
  }

  static async reset(): Promise<void> {
    await this.acquireLock();
    try {
      this._status = this.createInitialStatus();
    } finally {
      this.releaseLock();
    }
  }

  // === Display Methods ===

  static async showStatus(): Promise<void> {
    const status = await this.getStatus();
    const content = this.formatStatusForDisplay(status);

    await NotificationService.showCustomModal('IDE Shepherd Security Status', content, 'Close');
  }

  private static formatStatusForDisplay(status: IDEStatus): string {
    const uptime = this.formatUptime(Date.now() - status.monitoringStartTime);
    const lastUpdate = this.formatUptime(Date.now() - status.lastUpdateTime);
    const avgProcessingTime =
      status.totalEventProcessingTime && status.nbrOfEventsProcessed && status.nbrOfEventsProcessed > 0
        ? status.totalEventProcessingTime / status.nbrOfEventsProcessed
        : 'N/A';

    return [
      `IDE Shepherd Security Status`,
      `- Monitoring Status: ${status.isMonitoringActive ? '[x] Active' : '[ ] Inactive'}`,
      `- Uptime: ${uptime}`,
      `- Last Update: ${lastUpdate} ago`,
      `- Extensions Monitored:`,
      `\t* Total Patched: ${status.patchedExtensions.length}`,
      ...status.patchedExtensions.map((ext) => `\t\t-> ${ext.id}`),
      `- Security Events:`,
      `\t* Total: ${status.totalSecurityEvents}`,
      `\t* Network: ${status.securityEventsByTarget.network || 0}`,
      `\t* Filesystem: ${status.securityEventsByTarget.filesystem || 0}`,
      `\t* Workspace: ${status.securityEventsByTarget.workspace || 0}`,
      `- Performance:`,
      `\t* Avg Processing Time: ${avgProcessingTime} ms`,
      `\t\t* Events Processed: ${status.nbrOfEventsProcessed} | Total Processing Time: ${status.totalEventProcessingTime} ms`,
      `\t* Memory Usage: ${status.memoryUsage ? `${(status.memoryUsage / 1024 / 1024).toFixed(2)} MB` : 'N/A'}`,
    ].join('\n');
  }

  private static formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

}
