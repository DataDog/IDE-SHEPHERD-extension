/**
 * Sidebar Service - Manages VS Code sidebar views and content display
 */

import * as vscode from 'vscode';
import { IDEStatusData } from '../ide-status';
import { BatchAnalysisResult } from '../heuristics';
import { SecurityStatusViewProvider } from './providers/security-status-provider';
import { SecurityEventsViewProvider } from './providers/security-events-provider';
import { ExtensionsAnalysisViewProvider } from './providers/extensions-analysis-provider';
import { AllowListViewProvider } from './providers/allowlist-view-provider';
import { SettingsViewProvider } from './providers/settings-provider';

export class SidebarService {
  private static _instance: SidebarService;
  private _statusProvider: SecurityStatusViewProvider;
  private _eventsProvider: SecurityEventsViewProvider;
  private _extensionsProvider: ExtensionsAnalysisViewProvider;
  private _allowListProvider: AllowListViewProvider;
  private _settingsProvider: SettingsViewProvider;

  private constructor() {
    this._statusProvider = new SecurityStatusViewProvider();
    this._eventsProvider = new SecurityEventsViewProvider();
    this._extensionsProvider = new ExtensionsAnalysisViewProvider();
    this._allowListProvider = new AllowListViewProvider();
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
    vscode.window.registerTreeDataProvider('ide-shepherd-allowlist', this._allowListProvider);
    vscode.window.registerTreeDataProvider('ide-shepherd-settings', this._settingsProvider);
  }

  updateStatusView(data: IDEStatusData): void {
    this._statusProvider.updateData(data);
    this._eventsProvider.updateData(data.securityEvents.recentEvents);
  }

  triggerExtensionAnalysis(): void {
    this._extensionsProvider.runAnalysis();
  }

  getExtensionAnalysisData(): { results: BatchAnalysisResult; totalExtensions: number; analyzedExtensions: number } {
    return this._extensionsProvider.getAnalysisData();
  }

  refreshAllowListView(): void {
    this._allowListProvider.refresh();
  }

  async addToAllowList(): Promise<void> {
    await this._allowListProvider.handleAddToAllowList();
  }

  async removeFromAllowList(extensionId: string): Promise<void> {
    await this._allowListProvider.handleRemoveFromAllowList(extensionId);
  }

  async clearAllowList(): Promise<void> {
    await this._allowListProvider.handleClearAllowList();
  }

  async addTrustedPublisher(): Promise<void> {
    await this._allowListProvider.handleAddTrustedPublisher();
  }

  async removeTrustedPublisher(publisher: string): Promise<void> {
    await this._allowListProvider.handleRemoveTrustedPublisher(publisher);
  }

  refreshSettingsView(): void {
    this._settingsProvider.refresh();
  }

  async toggleDatadogTelemetry(): Promise<void> {
    await this._settingsProvider.toggleDatadogTelemetry();
  }
}
