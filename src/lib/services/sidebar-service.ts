/**
 * Sidebar Service - Manages VS Code sidebar views and content display
 */

import * as vscode from 'vscode';
import { IDEStatusData } from '../ide-status';
import { SecurityEvent, SeverityLevel } from '../events/sec-events';
import { Target } from '../events/ext-events';
import { MetadataAnalyzer } from '../../scanner/metadata-analyzer';
import { ExtensionsRepository } from '../extensions';
import { BatchAnalysisResult, RiskLevel } from '../heuristics';

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

  initialize(): void {
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

  triggerExtensionAnalysis(): void {
    this._extensionsProvider.runAnalysis();
  }

  getExtensionAnalysisData(): { results: BatchAnalysisResult; totalExtensions: number; analyzedExtensions: number } {
    return this._extensionsProvider.getAnalysisData();
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
      return Promise.resolve([new vscode.TreeItem('No status data available', vscode.TreeItemCollapsibleState.None)]);
    }

    if (!element) {
      return Promise.resolve([
        this.createMonitoringStatusItem(),
        this.createSystemInfoItem(),
        this.createExtensionsItem(),
        this.createExtensionAnalysisItem(),
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

  private createExtensionAnalysisItem(): SidebarTreeItem {
    const analysisData = this._statusData!.extensionAnalysis;
    let label = 'Extension Analysis';
    let icon = new vscode.ThemeIcon('shield');

    if (analysisData) {
      const { summary } = analysisData.results;
      if (summary.high > 0) {
        label = `Extension Analysis (${summary.high} high risk)`;
        icon = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      } else if (summary.medium > 0) {
        label = `Extension Analysis (${summary.medium} medium risk)`;
        icon = new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
      } else {
        label = `Extension Analysis (${summary.total} analyzed)`;
        icon = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      }
    }

    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    item.iconPath = icon;
    item.contextValue = 'extension-analysis';
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
          new vscode.TreeItem('No recent security events', vscode.TreeItemCollapsibleState.None),
        ]);
      }

      const eventItems = this._securityEvents.slice(0, 10).map((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();

        const item = new vscode.TreeItem(
          `[${timestamp}] ${event.eventTarget.eventType} - ${event.extension.id}`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );

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
            details.push(new vscode.TreeItem(`Rule: ${primaryIoC.rule}`, vscode.TreeItemCollapsibleState.None));
            details.push(new vscode.TreeItem(`Finding: ${primaryIoC.finding}`, vscode.TreeItemCollapsibleState.None));
            details.push(
              new vscode.TreeItem(`Description: ${primaryIoC.description}`, vscode.TreeItemCollapsibleState.None),
            );
          }
        }

        return Promise.resolve(details);
      }
    }

    return Promise.resolve([]);
  }

  private getEventIcon(event: SecurityEvent): vscode.ThemeIcon {
    if (event.severity) {
      switch (event.severity) {
        case SeverityLevel.HIGH:
          return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        case SeverityLevel.MEDIUM:
          return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
        case SeverityLevel.LOW:
          return new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground'));
        default:
          return new vscode.ThemeIcon('circle-outline');
      }
    }

    return new vscode.ThemeIcon('shield');
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

  private _analysisResults: BatchAnalysisResult | null = null;
  private _extensionsRepo: ExtensionsRepository;

  constructor() {
    this._extensionsRepo = ExtensionsRepository.getInstance();
    this.runAnalysis();
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems());
    }

    const children = this.getChildrenForItem(element);
    return Promise.resolve(children);
  }

  private getRootItems(): SidebarTreeItem[] {
    const items: SidebarTreeItem[] = [];

    // Results summary if available
    if (this._analysisResults) {
      const summaryItem = new vscode.TreeItem(
        `Results (${this._analysisResults.summary.total} extensions)`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      summaryItem.iconPath = new vscode.ThemeIcon('list-tree');
      summaryItem.contextValue = 'results-summary';
      items.push(summaryItem);

      // Risk level breakdown
      if (this._analysisResults.summary.high > 0) {
        const highRiskItem = new vscode.TreeItem(
          `High Risk (${this._analysisResults.summary.high})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        highRiskItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        highRiskItem.contextValue = 'high-risk';
        items.push(highRiskItem);
      }

      if (this._analysisResults.summary.medium > 0) {
        const mediumRiskItem = new vscode.TreeItem(
          `Medium Risk (${this._analysisResults.summary.medium})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        mediumRiskItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
        mediumRiskItem.contextValue = 'medium-risk';
        items.push(mediumRiskItem);
      }

      if (this._analysisResults.summary.low > 0) {
        const lowRiskItem = new vscode.TreeItem(
          `Low Risk (${this._analysisResults.summary.low})`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        lowRiskItem.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground'));
        lowRiskItem.contextValue = 'low-risk';
        items.push(lowRiskItem);
      }
    }

    return items;
  }

  private getChildrenForItem(element: SidebarTreeItem): SidebarTreeItem[] {
    const children: SidebarTreeItem[] = [];

    switch (element.contextValue) {
      case 'results-summary':
        if (this._analysisResults) {
          children.push(
            new vscode.TreeItem(
              `Total Extensions: ${this._analysisResults.summary.total}`,
              vscode.TreeItemCollapsibleState.None,
            ),
          );
          children.push(
            new vscode.TreeItem(
              `Risk Distribution: ${this._analysisResults.summary.high}H, ${this._analysisResults.summary.medium}M, ${this._analysisResults.summary.low}L`,
              vscode.TreeItemCollapsibleState.None,
            ),
          );
        }
        break;

      case 'high-risk':
        children.push(...this.getExtensionsByRisk(RiskLevel.High));
        break;

      case 'medium-risk':
        children.push(...this.getExtensionsByRisk(RiskLevel.Medium));
        break;

      case 'low-risk':
        children.push(...this.getExtensionsByRisk(RiskLevel.Low));
        break;

      default:
        if (element.contextValue?.startsWith('extension-')) {
          const extensionId = element.contextValue.replace('extension-', '');
          children.push(...this.getExtensionPatterns(extensionId));
        }
        break;
    }

    return children;
  }

  private getExtensionsByRisk(riskLevel: RiskLevel): SidebarTreeItem[] {
    if (!this._analysisResults) {
      return [];
    }

    return this._analysisResults.results
      .filter((result) => result.overallRisk === riskLevel)
      .map((result) => {
        const item = new vscode.TreeItem(
          `${result.extensionId} (${result.riskScore})`,
          result.suspiciousPatterns.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        );

        item.iconPath = new vscode.ThemeIcon('extensions');
        item.contextValue = `extension-${result.extensionId}`;
        item.tooltip = `Risk Score: ${result.riskScore}\nPatterns: ${result.suspiciousPatterns.length}`;

        return item;
      });
  }

  private getExtensionPatterns(extensionId: string): SidebarTreeItem[] {
    if (!this._analysisResults) {
      return [];
    }

    const result = this._analysisResults.results.find((r) => r.extensionId === extensionId);
    if (!result) {
      return [];
    }

    return result.suspiciousPatterns.map((pattern) => {
      const item = new vscode.TreeItem(
        `${pattern.pattern}: ${pattern.description}`,
        vscode.TreeItemCollapsibleState.None,
      );

      item.iconPath = this.getPatternIcon(pattern.severity);
      item.tooltip = `Category: ${pattern.category}\nSeverity: ${pattern.severity}`;

      return item;
    });
  }

  private getPatternIcon(severity: SeverityLevel): vscode.ThemeIcon {
    switch (severity) {
      case SeverityLevel.HIGH:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case SeverityLevel.MEDIUM:
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
      case SeverityLevel.LOW:
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }

  /**
   * Run extension analysis using MetadataAnalyzer
   */
  runAnalysis(): void {
    try {
      const userExtensions = this._extensionsRepo.getUserExtensions();

      const extensionsForAnalysis = userExtensions
        .filter((ext) => ext.packageJSON)
        .map((ext) => ({ id: ext.id, packageJSON: ext.packageJSON }));

      this._analysisResults = MetadataAnalyzer.analyzeBatch(extensionsForAnalysis);
      this._onDidChangeTreeData.fire();
    } catch (error) {
      vscode.window.showErrorMessage(`Extension analysis failed: ${error}`);
    }
  }

  /**
   * Get current analysis data for status integration
   */
  getAnalysisData(): { results: BatchAnalysisResult; totalExtensions: number; analyzedExtensions: number } {
    const userExtensions = this._extensionsRepo.getUserExtensions();
    const extensionsWithPackageJSON = userExtensions.filter((ext) => ext.packageJSON);

    // Return empty results if no analysis has been performed yet
    const results = this._analysisResults || { results: [], summary: { total: 0, low: 0, medium: 0, high: 0 } };

    return { results, totalExtensions: userExtensions.length, analyzedExtensions: extensionsWithPackageJSON.length };
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
      new vscode.TreeItem('Enable Monitoring', vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem('Auto Scan Extensions', vscode.TreeItemCollapsibleState.None),
      new vscode.TreeItem('Notification Level', vscode.TreeItemCollapsibleState.None),
    ];
    return Promise.resolve(settings);
  }
}

type SidebarTreeItem = vscode.TreeItem;
