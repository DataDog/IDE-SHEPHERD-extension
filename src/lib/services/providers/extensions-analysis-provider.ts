/**
 * Extensions Analysis View Provider - Displays risk analysis of installed extensions
 */

import * as vscode from 'vscode';
import { MetadataAnalyzer } from '../../../scanner/metadata-analyzer';
import { ExtensionPackageJSON, ExtensionsRepository } from '../../extensions';
import { BatchAnalysisResult, RiskLevel } from '../../heuristics';
import { SeverityLevel } from '../../events/sec-events';

type SidebarTreeItem = vscode.TreeItem;

/**
 * Tree data provider for extensions analysis view
 */
export class ExtensionsAnalysisViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
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
        .map((ext) => ({ id: ext.id, packageJSON: ext.packageJSON as ExtensionPackageJSON }));

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

    const results = this._analysisResults || { results: [], summary: { total: 0, low: 0, medium: 0, high: 0 } };

    return { results, totalExtensions: userExtensions.length, analyzedExtensions: extensionsWithPackageJSON.length };
  }
}
