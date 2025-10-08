/**
 * Sidebar Service - Manages VS Code sidebar views and content display
 */

import * as vscode from 'vscode';
import { IDEStatusData } from '../ide-status';
import { SecurityEvent } from '../events/sec-events';
import { BatchAnalysisResult } from '../heuristics';
import { AllowListService } from './allowlist-service';
import { SecurityStatusViewProvider } from './providers/security-status-provider';
import { SecurityEventsViewProvider } from './providers/security-events-provider';
import { ExtensionsAnalysisViewProvider } from './providers/extensions-analysis-provider';
import { AllowListViewProvider } from './providers/allowlist-view-provider';

export class SidebarService {
  private static _instance: SidebarService;
  private _statusProvider: SecurityStatusViewProvider;
  private _eventsProvider: SecurityEventsViewProvider;
  private _extensionsProvider: ExtensionsAnalysisViewProvider;
  private _allowListProvider: AllowListViewProvider;
  private _currentStatusData: IDEStatusData | null = null;

  private constructor() {
    this._statusProvider = new SecurityStatusViewProvider();
    this._eventsProvider = new SecurityEventsViewProvider();
    this._extensionsProvider = new ExtensionsAnalysisViewProvider();
    this._allowListProvider = new AllowListViewProvider();
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
}
