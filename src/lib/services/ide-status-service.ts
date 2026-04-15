/**
 * Unified IDE Status Service - manages and displays IDE security monitoring status
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { ExtensionInfo, Target, Timestamp } from '../events/ext-events';
import { SecurityEvent } from '../events/sec-events';
import { IDEStatus, IDEStatusData, PlatformType } from '../ide-status';
import { SidebarService } from './sidebar-service';
import { CONFIG } from '../config';
import { Logger } from '../logger';
import { DatadogTelemetryService } from './datadog/datadog-service';

const AUTO_REFRESH_CONFIG = CONFIG.UI.AUTO_REFRESH;

export class IDEStatusService {
  private static _status: IDEStatus;
  private static _lockQueue: Array<() => void> = [];
  private static _locked = false;
  private static _refreshInterval: NodeJS.Timeout | null = null;

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
      securityEventsByTarget: {
        [Target.NETWORK]: 0,
        [Target.PROCESS]: 0,
        [Target.WORKSPACE]: 0,
        [Target.FILESYSTEM]: 0,
      },
      lastSecurityEvents: [],
      monitoringStartTime: Date.now(),
      lastUpdateTime: Date.now(),
      isMonitoringActive: true,
      platform: this.detectPlatform(),
      totalEventProcessingTime: 0,
      nbrOfEventsProcessed: 0,
    };
  }

  private static detectPlatform(): PlatformType {
    const platform = os.platform();
    switch (platform) {
      case 'win32':
        return PlatformType.WINDOWS;
      case 'darwin':
        return PlatformType.MACOS;
      case 'linux':
        return PlatformType.LINUX;
      default:
        return PlatformType.UNKNOWN;
    }
  }

  /**
   * Async mutex: callers queue up and are resumed in FIFO order.
   */
  private static async acquireLock(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this._lockQueue.push(resolve);
    });
  }

  private static releaseLock(): void {
    const next = this._lockQueue.shift();
    if (next) {
      next(); // hand lock to next waiter
    } else {
      this._locked = false;
    }
  }

  static async getStatus(): Promise<IDEStatus> {
    this.ensureInitialized();
    await this.acquireLock();
    try {
      return {
        ...this._status,
        patchedExtensions: [...this._status.patchedExtensions],
        securityEventsByTarget: { ...this._status.securityEventsByTarget },
        lastSecurityEvents: [...this._status.lastSecurityEvents],
      };
    } finally {
      this.releaseLock();
    }
  }

  static getPlatform(): PlatformType {
    this.ensureInitialized();
    return this._status.platform;
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
      const target = event.originalEvent.eventType;
      this._status.securityEventsByTarget[target]++;

      // Add to recent events queue
      this._status.lastSecurityEvents.unshift(event);
      if (this._status.lastSecurityEvents.length > AUTO_REFRESH_CONFIG.MAX_RECENT_EVENTS) {
        this._status.lastSecurityEvents = this._status.lastSecurityEvents.slice(
          0,
          AUTO_REFRESH_CONFIG.MAX_RECENT_EVENTS,
        );
      }

      this._status.lastUpdateTime = Date.now();
    } finally {
      this.releaseLock();
    }

    // Send OCSF Detection Finding to Datadog
    this.sendSecurityEventToDatadog(event).catch((error) => {
      Logger.error(`Failed to send security event to Datadog: ${error}`);
    });

    this.autoRefreshStatusDisplay().catch((error) => {
      Logger.error(`Failed to refresh after security event: ${error}`);
    });
  }

  static async updatePerformanceMetrics(processingTime?: number): Promise<void> {
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

  /**
   * Start auto-refresh with 10-second interval
   */
  static startAutoRefresh(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
    }

    Logger.info(`[AUTO-REFRESH] Starting auto-refresh interval (${AUTO_REFRESH_CONFIG.INTERVAL_MS}ms)`);
    this._refreshInterval = setInterval(() => {
      this.autoRefreshStatusDisplay();
    }, AUTO_REFRESH_CONFIG.INTERVAL_MS);
  }

  /**
   * Stop auto-refresh interval
   */
  static stopAutoRefresh(): void {
    if (this._refreshInterval) {
      Logger.info('[AUTO-REFRESH] Stopping auto-refresh interval');
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  /**
   * Enable or disable auto-refresh of status display
   */
  static setAutoRefreshEnabled(enabled: boolean): void {
    AUTO_REFRESH_CONFIG.ENABLED = enabled;
    if (enabled) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  }

  static isAutoRefreshEnabled(): boolean {
    return AUTO_REFRESH_CONFIG.ENABLED;
  }

  private static async autoRefreshStatusDisplay(): Promise<void> {
    if (!AUTO_REFRESH_CONFIG.ENABLED) {
      return;
    }

    try {
      await this.showStatus();
    } catch (error) {
      Logger.error(`[AUTO-REFRESH] Error: ${error}`);
    }
  }

  static async showStatus(): Promise<void> {
    const status = await this.getStatus();

    try {
      const sidebarService = SidebarService.getInstance();
      const structuredData = this.formatStatusForSidebar(status);
      sidebarService.updateStatusView(structuredData);
    } catch (error) {
      vscode.window.showErrorMessage(`Error updating security status: ${error}`);
    }
  }

  /**
   * Format status data for structured sidebar display
   */
  private static formatStatusForSidebar(status: IDEStatus): IDEStatusData {
    const uptime = this.formatUptime(Date.now() - status.monitoringStartTime);
    const lastUpdate = this.formatUptime(Date.now() - status.lastUpdateTime);
    const avgProcessingTime =
      status.totalEventProcessingTime && status.nbrOfEventsProcessed && status.nbrOfEventsProcessed > 0
        ? `${(status.totalEventProcessingTime / status.nbrOfEventsProcessed).toFixed(2)} ms`
        : 'N/A';

    return {
      isMonitoringActive: status.isMonitoringActive,
      uptime: uptime,
      lastUpdate: `${lastUpdate} ago`,
      extensionsMonitored: {
        total: status.patchedExtensions.length,
        extensions: status.patchedExtensions.map((ext) => ({ id: ext.id })),
      },
      securityEvents: {
        total: status.totalSecurityEvents,
        network: status.securityEventsByTarget.Network || 0,
        process: status.securityEventsByTarget.Process || 0,
        filesystem: status.securityEventsByTarget.FileSystem || 0,
        recentEvents: status.lastSecurityEvents || [],
      },
      performance: {
        avgProcessingTime: avgProcessingTime,
        eventsProcessed: status.nbrOfEventsProcessed || 0,
        totalProcessingTime: status.totalEventProcessingTime || 0,
      },
    };
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

  /**
   * Send security event to Datadog via OCSFTracker
   */
  private static async sendSecurityEventToDatadog(event: SecurityEvent): Promise<void> {
    try {
      const datadogService = DatadogTelemetryService.getInstance();
      const ocsfTracker = datadogService.getOCSFTracker();

      if (ocsfTracker) {
        await ocsfTracker.onSecurityEvent(event);
      }
    } catch (error) {
      Logger.error('Failed to send security event to Datadog', error as Error);
    }
  }
}
