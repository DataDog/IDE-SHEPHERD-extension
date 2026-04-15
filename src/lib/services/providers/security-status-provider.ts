/**
 * Security Status View Provider - Displays monitoring status and system information
 */

import * as vscode from 'vscode';
import { IDEStatusData } from '../../ide-status';
import { Target } from '../../events/ext-events';

type SidebarTreeItem = vscode.TreeItem;

/**
 * Tree data provider for security status view
 */
export class SecurityStatusViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
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
      return Promise.resolve([new vscode.TreeItem('No status data available', vscode.TreeItemCollapsibleState.None)]);
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
    const item = new vscode.TreeItem('Monitoring Status', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = this._statusData!.isMonitoringActive
      ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
      : new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
    item.contextValue = 'monitoring';
    return item;
  }

  private createSystemInfoItem(): SidebarTreeItem {
    const item = new vscode.TreeItem('System Information', vscode.TreeItemCollapsibleState.Expanded);
    item.iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'system';
    return item;
  }

  private createExtensionsItem(): SidebarTreeItem {
    const item = new vscode.TreeItem(
      `Telemetry sources (${this._statusData!.extensionsMonitored.total})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    item.iconPath = new vscode.ThemeIcon('extensions');
    item.contextValue = 'extensions';
    return item;
  }

  private createSecurityEventsItem(): SidebarTreeItem {
    const item = new vscode.TreeItem(
      `Security Events (${this._statusData!.securityEvents.total})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    item.iconPath = new vscode.ThemeIcon('eye');
    item.contextValue = 'events';
    return item;
  }

  private createPerformanceItem(): SidebarTreeItem {
    const item = new vscode.TreeItem('Performance Metrics', vscode.TreeItemCollapsibleState.Expanded);
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
          new vscode.TreeItem(
            `Status: ${this._statusData!.isMonitoringActive ? '✅ Active' : '❌ Inactive'}`,
            vscode.TreeItemCollapsibleState.None,
          ),
        );
        break;

      case 'system':
        children.push(
          new vscode.TreeItem(`Uptime: ${this._statusData!.uptime}`, vscode.TreeItemCollapsibleState.None),
          new vscode.TreeItem(`Last Update: ${this._statusData!.lastUpdate}`, vscode.TreeItemCollapsibleState.None),
        );
        break;

      case 'extensions':
        this._statusData!.extensionsMonitored.extensions.forEach((ext) => {
          const item = new vscode.TreeItem(ext.id, vscode.TreeItemCollapsibleState.None);
          item.iconPath = new vscode.ThemeIcon('symbol-module');
          children.push(item);
        });
        if (children.length === 0) {
          children.push(new vscode.TreeItem('No telemetry sources', vscode.TreeItemCollapsibleState.None));
        }
        break;

      case 'extension-analysis':
        const analysisData = this._statusData!.extensionAnalysis;
        if (analysisData) {
          const { results } = analysisData;
          const { summary } = results;
          children.push(
            new vscode.TreeItem(`Total Extensions: ${summary.total}`, vscode.TreeItemCollapsibleState.None),
            new vscode.TreeItem(`High Risk: ${summary.high}`, vscode.TreeItemCollapsibleState.None),
            new vscode.TreeItem(`Medium Risk: ${summary.medium}`, vscode.TreeItemCollapsibleState.None),
            new vscode.TreeItem(`Low Risk: ${summary.low}`, vscode.TreeItemCollapsibleState.None),
          );
        } else {
          children.push(new vscode.TreeItem('No analysis data available', vscode.TreeItemCollapsibleState.None));
        }
        break;

      case 'events':
        children.push(
          new vscode.TreeItem(
            `${Target.getValue(Target.NETWORK)}: ${this._statusData!.securityEvents.network}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new vscode.TreeItem(
            `${Target.getValue(Target.PROCESS)}: ${this._statusData!.securityEvents.process}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new vscode.TreeItem(
            `${Target.getValue(Target.WORKSPACE)}: ${this._statusData!.securityEvents.workspace}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new vscode.TreeItem(
            `${Target.getValue(Target.FILESYSTEM)}: ${this._statusData!.securityEvents.filesystem}`,
            vscode.TreeItemCollapsibleState.None,
          ),
        );
        break;

      case 'performance':
        children.push(
          new vscode.TreeItem(
            `Avg Processing Time: ${this._statusData!.performance.avgProcessingTime}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new vscode.TreeItem(
            `Events Processed: ${this._statusData!.performance.eventsProcessed}`,
            vscode.TreeItemCollapsibleState.None,
          ),
          new vscode.TreeItem(
            `Total Processing Time: ${this._statusData!.performance.totalProcessingTime} ms`,
            vscode.TreeItemCollapsibleState.None,
          ),
        );
        break;
    }

    return children;
  }
}
