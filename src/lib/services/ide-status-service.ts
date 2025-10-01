/**
 * Unified IDE Status Service - manages and displays IDE security monitoring status
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { ExtensionInfo, Target, Timestamp } from '../events/ext-events';
import { SecurityEvent } from '../events/sec-events';
import { IDEStatus, IDEStatusData, PlatformType } from '../ide-status';
import { SidebarService } from './sidebar-service';

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
      securityEventsByTarget: { [Target.NETWORK]: 0, [Target.PROCESS]: 0 },
      lastSecurityEvents: [],
      monitoringStartTime: Date.now(),
      lastUpdateTime: Date.now(),
      isMonitoringActive: true,
      platform: this.detectPlatform(),
      totalEventProcessingTime: 0,
      nbrOfEventsProcessed: 0,
      memoryUsage: 0,
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

    // Try to update sidebar with structured data
    try {
      const sidebarService = SidebarService.getInstance();
      const structuredData = this.formatStatusForSidebar(status);
      sidebarService.updateStatusView(structuredData);
      vscode.window.showInformationMessage('Security status updated in sidebar');
    } catch (error) {
      // Fallback to modal if sidebar fails
      console.error('Failed to update sidebar, falling back to modal:', error);
      const content = this.formatStatusForDisplay(status);
      await this.showCustomStatusModal('IDE Shepherd Security Status', content);
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
        network: status.securityEventsByTarget.network || 0,
        process: status.securityEventsByTarget.process || 0,
        recentEvents: status.lastSecurityEvents || [],
      },
      performance: {
        avgProcessingTime: avgProcessingTime,
        eventsProcessed: status.nbrOfEventsProcessed || 0,
        totalProcessingTime: status.totalEventProcessingTime || 0,
        memoryUsage: status.memoryUsage ? `${(status.memoryUsage / 1024 / 1024).toFixed(2)} MB` : 'N/A',
      },
    };
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
      `- Platform: ${status.platform}`,
      `- Monitoring Status: ${status.isMonitoringActive ? '[x] Active' : '[ ] Inactive'}`,
      `- Uptime: ${uptime}`,
      `- Last Update: ${lastUpdate} ago`,
      `- Extensions Monitored:`,
      `\t* Total Patched: ${status.patchedExtensions.length}`,
      ...status.patchedExtensions.map((ext) => `\t\t-> ${ext.id}`),
      `- Security Events:`,
      `\t* Total: ${status.totalSecurityEvents}`,
      `\t* Network: ${status.securityEventsByTarget.network || 0}`,
      `\t* Process: ${status.securityEventsByTarget.process || 0}`,
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

  private static async showCustomStatusModal(title: string, content: string): Promise<void> {
    return new Promise((resolve) => {
      const panel = vscode.window.createWebviewPanel('ideStatus', title, vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });

      // HTML content for the status modal display
      panel.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${title}</title>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            font-size: var(--vscode-font-size);
                            color: var(--vscode-foreground);
                            background: var(--vscode-editor-background);
                            margin: 0;
                            padding: 20px;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                        }
                        .modal-container {
                            background: var(--vscode-notifications-background);
                            border: 2px solid var(--vscode-notifications-border);
                            border-radius: 8px;
                            padding: 24px;
                            max-width: 600px;
                            width: 100%;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        }
                        .title {
                            font-size: 18px;
                            font-weight: bold;
                            color: var(--vscode-notificationsInfoIcon-foreground);
                            margin-bottom: 16px;
                            text-align: center;
                        }
                        .content {
                            font-family: var(--vscode-editor-font-family);
                            white-space: pre-line;
                            line-height: 1.4;
                            margin-bottom: 20px;
                            color: var(--vscode-notifications-foreground);
                            background: var(--vscode-editor-background);
                            padding: 16px;
                            border-radius: 4px;
                            border: 1px solid var(--vscode-panel-border);
                            overflow-x: auto;
                        }
                        .button-container {
                            display: flex;
                            justify-content: center;
                        }
                        .ok-button {
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            min-width: 80px;
                        }
                        .ok-button:hover {
                            background: var(--vscode-button-hoverBackground);
                        }
                        .ok-button:focus {
                            outline: 2px solid var(--vscode-focusBorder);
                        }
                    </style>
                </head>
                <body>
                    <div class="modal-container">
                        <div class="title">${title}</div>
                        <div class="content">${content.replace(/\n/g, '<br>').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')}</div>
                        <div class="button-container">
                            <button class="ok-button" onclick="dismissModal()">Close</button>
                        </div>
                    </div>
                    <script>
                        function dismissModal() {
                            vscode.postMessage({ command: 'dismiss' });
                        }
                        
                        // Handle Escape key
                        document.addEventListener('keydown', function(event) {
                            if (event.key === 'Escape') {
                                dismissModal();
                            }
                        });
                        
                        // Focus the button for keyboard navigation
                        document.querySelector('.ok-button').focus();
                        
                        const vscode = acquireVsCodeApi();
                    </script>
                </body>
                </html>
            `;

      // Handle messages from webview
      panel.webview.onDidReceiveMessage((message) => {
        if (message.command === 'dismiss') {
          panel.dispose();
          resolve();
        }
      });

      // Handle panel disposal
      panel.onDidDispose(() => {
        resolve();
      });
    });
  }
}
