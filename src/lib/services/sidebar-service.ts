/**
 * Sidebar Service - Manages VS Code sidebar views and content display
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { IDEStatusData } from '../ide-status';
import { SecurityEvent } from '../events/sec-events';

export class SidebarService {
  private static _instance: SidebarService;
  private _statusProvider: SecurityStatusViewProvider;
  private _eventsProvider: SecurityEventsViewProvider;
  private _extensionsProvider: ExtensionsAnalysisViewProvider;
  private _settingsProvider: SettingsViewProvider;
  private _currentStatusData: IDEStatusData | null = null;

  private constructor() {
    this._statusProvider = new SecurityStatusViewProvider();
    this._eventsProvider = new SecurityEventsViewProvider();
    this._extensionsProvider = new ExtensionsAnalysisViewProvider();
    this._settingsProvider = new SettingsViewProvider();
  }

  static getInstance(): SidebarService {
    if (!SidebarService._instance) {
      SidebarService._instance = new SidebarService();
    }
    return SidebarService._instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    vscode.window.registerTreeDataProvider('ide-shepherd-status', this._statusProvider);
    vscode.window.registerTreeDataProvider('ide-shepherd-events', this._eventsProvider);
    vscode.window.registerTreeDataProvider('ide-shepherd-extensions', this._extensionsProvider);
    vscode.window.registerTreeDataProvider('ide-shepherd-settings', this._settingsProvider);
  }

  updateStatusView(data: IDEStatusData): void {
    this._currentStatusData = data;
    this._statusProvider.updateData(data);
    this._eventsProvider.updateData(data.securityEvents.recentEvents);
  }

  addSecurityEvent(event: any): void {
    // TODO
  }

  updateExtensionAnalysis(analysisResults: any[]): void {
    // TODO
  }
}

/**
 * Tree data provider for security status view
 */
class SecurityStatusViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;
  private _statusData: IDEStatusData | null = null;

  updateData(data: IDEStatusData): void {
    this._statusData = data;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!this._statusData) {
      return Promise.resolve([new SidebarTreeItem('No status data available', vscode.TreeItemCollapsibleState.None)]);
    }

    if (!element) {
      return Promise.resolve([
        this.createMonitoringStatusItem(),
        this.createSystemInfoItem(),
        this.createExtensionsItem(),
        this.createSecurityEventsItem(),
        this.createPerformanceItem(),
      ]);
    }

    const children = this.getChildrenForItem(element);
    return Promise.resolve(children);
  }

  private createMonitoringStatusItem(): SidebarTreeItem {
    const item = new SidebarTreeItem('Monitoring Status', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = this._statusData!.isMonitoringActive
      ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
      : new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
    item.contextValue = 'monitoring';
    return item;
  }

  private createSystemInfoItem(): SidebarTreeItem {
    const item = new SidebarTreeItem('System Information', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'system';
    return item;
  }

  private createExtensionsItem(): SidebarTreeItem {
    const item = new SidebarTreeItem(
      `Extensions Monitored (${this._statusData!.extensionsMonitored.total})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.iconPath = new vscode.ThemeIcon('extensions');
    item.contextValue = 'extensions';
    return item;
  }

  private createSecurityEventsItem(): SidebarTreeItem {
    const item = new SidebarTreeItem(
      `Security Events (${this._statusData!.securityEvents.total})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.iconPath = new vscode.ThemeIcon('eye');
    item.contextValue = 'events';
    return item;
  }

  private createPerformanceItem(): SidebarTreeItem {
    const item = new SidebarTreeItem('Performance Metrics', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon('pulse');
    item.contextValue = 'performance';
    return item;
  }

  private getChildrenForItem(element: SidebarTreeItem): SidebarTreeItem[] {
    const children: SidebarTreeItem[] = [];

    // Monitoring activity status
    switch (element.contextValue) {
      case 'monitoring':
        children.push(
          new SidebarTreeItem(
            `Status: ${this._statusData!.isMonitoringActive ? '✅ Active' : '❌ Inactive'}`,
            vscode.TreeItemCollapsibleState.None,
          ),
        );
        break;

      case 'system':
        children.push(
          new SidebarTreeItem(`Uptime: ${this._statusData!.uptime}`, vscode.TreeItemCollapsibleState.None),
          new SidebarTreeItem(`Last Update: ${this._statusData!.lastUpdate}`, vscode.TreeItemCollapsibleState.None),
        );
        break;

      case 'extensions':
        this._statusData!.extensionsMonitored.extensions.forEach((ext) => {
          const item = new SidebarTreeItem(ext.id, vscode.TreeItemCollapsibleState.None);
          item.iconPath = new vscode.ThemeIcon('symbol-module');
          children.push(item);
        });
        if (children.length === 0) {
          children.push(new SidebarTreeItem('No extensions monitored', vscode.TreeItemCollapsibleState.None));
        }
        break;

      case 'events':
        children.push(
          new SidebarTreeItem(
            `Network: ${this._statusData!.securityEvents.network}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new SidebarTreeItem(
            `Filesystem: ${this._statusData!.securityEvents.filesystem}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new SidebarTreeItem(
            `Workspace: ${this._statusData!.securityEvents.workspace}`,
            vscode.TreeItemCollapsibleState.None,
          ),
        );
        break;

      case 'performance':
        children.push(
          new SidebarTreeItem(
            `Avg Processing Time: ${this._statusData!.performance.avgProcessingTime}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new SidebarTreeItem(
            `Events Processed: ${this._statusData!.performance.eventsProcessed}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new SidebarTreeItem(
            `Total Processing Time: ${this._statusData!.performance.totalProcessingTime} ms`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new SidebarTreeItem(
            `Memory Usage: ${this._statusData!.performance.memoryUsage}`,
            vscode.TreeItemCollapsibleState.None,
          ),
        );
        break;
    }

    return children;
  }
}

/**
 * Tree data provider for security events view
 */
class SecurityEventsViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;
  private _securityEvents: SecurityEvent[] = [];

  updateData(events: SecurityEvent[]): void {
    this._securityEvents = events || [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!element) {
      if (this._securityEvents.length === 0) {
        return Promise.resolve([
          new SidebarTreeItem('No recent security events', vscode.TreeItemCollapsibleState.None),
        ]);
      }

      const eventItems = this._securityEvents.slice(0, 10).map((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const item = new SidebarTreeItem(
          `[${timestamp}] ${event.eventTarget.eventType.toUpperCase()} - ${event.extension.id}`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );

        // Set icon based on event severity or type
        item.iconPath = this.getEventIcon(event);
        item.contextValue = `event-${index}`;

        return item;
      });

      return Promise.resolve(eventItems);
    } else {
      const eventIndex = this.getEventIndexFromContext(element.contextValue);
      if (eventIndex !== -1 && this._securityEvents[eventIndex]) {
        const event = this._securityEvents[eventIndex];
        const details: SidebarTreeItem[] = [];

        if (event.iocs && Array.isArray(event.iocs) && event.iocs.length > 0) {
          const primaryIoC = event.getPrimaryIoC ? event.getPrimaryIoC() : event.iocs[0];
          if (primaryIoC) {
            details.push(new SidebarTreeItem(`Rule: ${primaryIoC.rule}`, vscode.TreeItemCollapsibleState.None));
            details.push(new SidebarTreeItem(`Finding: ${primaryIoC.finding}`, vscode.TreeItemCollapsibleState.None));
            details.push(
              new SidebarTreeItem(`Description: ${primaryIoC.description}`, vscode.TreeItemCollapsibleState.None),
            );
          }
        }

        return Promise.resolve(details);
      }
    }

    return Promise.resolve([]);
  }

  private getEventIcon(event: any): vscode.ThemeIcon {
    // Determine icon based on event type or severity
    if (event.severity) {
      switch (event.severity.toLowerCase()) {
        case 'critical':
          return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        case 'high':
          return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
        case 'medium':
          return new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground'));
        case 'low':
          return new vscode.ThemeIcon('circle-outline');
      }
    }

    // Default based on event type
    if (event.type) {
      const type = event.type.toLowerCase();
      if (type.includes('network') || type.includes('http')) {
        return new vscode.ThemeIcon('globe');
      } else if (type.includes('process') || type.includes('exec')) {
        return new vscode.ThemeIcon('terminal');
      } else if (type.includes('file') || type.includes('filesystem')) {
        return new vscode.ThemeIcon('file');
      }
    }

    return new vscode.ThemeIcon('shield');
  }

  private getSeverityIcon(severity: string): vscode.ThemeIcon {
    switch (severity.toLowerCase()) {
      case 'critical':
        return new vscode.ThemeIcon('error');
      case 'high':
        return new vscode.ThemeIcon('warning');
      case 'medium':
        return new vscode.ThemeIcon('info');
      case 'low':
        return new vscode.ThemeIcon('circle-outline');
      default:
        return new vscode.ThemeIcon('question');
    }
  }

  private getEventIndexFromContext(contextValue?: string): number {
    if (!contextValue || !contextValue.startsWith('event-')) {
      return -1;
    }
    const indexStr = contextValue.replace('event-', '');
    const index = parseInt(indexStr, 10);
    return isNaN(index) ? -1 : index;
  }
}

/**
 * Tree data provider for extensions analysis view
 */
class ExtensionsAnalysisViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    // TODO
    return Promise.resolve([new SidebarTreeItem('No analysis data', vscode.TreeItemCollapsibleState.None)]);
  }
}

/**
 * Tree data provider for settings view
 */
class SettingsViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    const settings = [
      new SidebarTreeItem('Enable Monitoring', vscode.TreeItemCollapsibleState.None),
      new SidebarTreeItem('Auto Scan Extensions', vscode.TreeItemCollapsibleState.None),
      new SidebarTreeItem('Notification Level', vscode.TreeItemCollapsibleState.None),
    ];
    return Promise.resolve(settings);
  }
}

// Single generic tree item class
class SidebarTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }
}
