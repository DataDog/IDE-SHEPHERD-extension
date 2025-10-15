/**
 * Settings View Provider - Displays and manages IDE Shepherd settings
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';

type SidebarTreeItem = vscode.TreeItem;

/**
 * Tree data provider for settings view
 */
export class SettingsViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('ide-shepherd')) {
        this._onDidChangeTreeData.fire();
      }
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SidebarTreeItem): Promise<SidebarTreeItem[]> {
    if (!element) {
      return [this.createCategoryItem('Datadog Telemetry', 'datadog', vscode.TreeItemCollapsibleState.Expanded)];
    }

    if (element.id === 'datadog') {
      return this.getDatadogSettings();
    }
    // TODO: Add general settings

    return [];
  }

  private createCategoryItem(label: string, id: string, state: vscode.TreeItemCollapsibleState): SidebarTreeItem {
    const item = new vscode.TreeItem(label, state);
    item.id = id;
    item.iconPath = new vscode.ThemeIcon('settings-gear');
    item.contextValue = 'category';
    return item;
  }

  private async getDatadogSettings(): Promise<SidebarTreeItem[]> {
    const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');
    const items: SidebarTreeItem[] = [];

    // Enabled status
    const enabled = config.get<boolean>('enabled', false);
    const enabledItem = new vscode.TreeItem(
      `Telemetry: ${enabled ? 'Enabled' : 'Disabled'}`,
      vscode.TreeItemCollapsibleState.None,
    );
    enabledItem.id = 'datadog.enabled';
    enabledItem.iconPath = new vscode.ThemeIcon(enabled ? 'check' : 'x');
    enabledItem.command = {
      command: 'ide-shepherd.settings.toggleDatadogTelemetry',
      title: 'Toggle Datadog Telemetry',
    };
    enabledItem.tooltip = 'Click to toggle Datadog telemetry';
    enabledItem.contextValue = 'toggleable';
    items.push(enabledItem);

    // Agent port
    const port = config.get<number>('agentPort', 10518);
    const portItem = new vscode.TreeItem(`Agent Port: ${port}`, vscode.TreeItemCollapsibleState.None);
    portItem.id = 'datadog.agentPort';
    portItem.iconPath = new vscode.ThemeIcon('plug');
    portItem.tooltip = 'Datadog Agent TCP port';
    portItem.contextValue = 'setting';
    items.push(portItem);

    // Connection status (if enabled)
    if (enabled) {
      const statusItem = new vscode.TreeItem('Connection Status', vscode.TreeItemCollapsibleState.None);
      statusItem.id = 'datadog.status';
      statusItem.iconPath = new vscode.ThemeIcon('pulse');
      statusItem.command = { command: 'ide-shepherd.datadog.testConnection', title: 'Test Connection' };
      statusItem.tooltip = 'Click to test Datadog Agent connection';
      statusItem.contextValue = 'action';
      items.push(statusItem);

      // Send telemetry action
      const sendItem = new vscode.TreeItem('Send Telemetry Data', vscode.TreeItemCollapsibleState.None);
      sendItem.id = 'datadog.send';
      sendItem.iconPath = new vscode.ThemeIcon('cloud-upload');
      sendItem.command = { command: 'ide-shepherd.datadog.sendTelemetry', title: 'Send Telemetry' };
      sendItem.tooltip = 'Send all telemetry data to Datadog';
      sendItem.contextValue = 'action';
      items.push(sendItem);
    }

    return items;
  }

  /**
   * Toggle Datadog telemetry enabled/disabled
   */
  async toggleDatadogTelemetry(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');
      const currentValue = config.get<boolean>('enabled', false);

      await config.update('enabled', !currentValue, vscode.ConfigurationTarget.Global);

      const newState = !currentValue ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Datadog telemetry ${newState}`);

      Logger.info(`SettingsViewProvider: Datadog telemetry ${newState}`);

      // Refresh the view
      this._onDidChangeTreeData.fire();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to toggle Datadog telemetry: ${error}`);
      Logger.error('SettingsViewProvider: Failed to toggle Datadog telemetry', error as Error);
    }
  }

  /**
   * Update agent port
   */
  async updateAgentPort(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');
      const currentPort = config.get<number>('agentPort', 10518);

      const newPort = await vscode.window.showInputBox({
        prompt: 'Enter Datadog Agent TCP port',
        value: currentPort.toString(),
        validateInput: (value) => {
          const port = parseInt(value, 10);
          if (isNaN(port) || port < 1024 || port > 65535) {
            return 'Port must be between 1024 and 65535';
          }
          return null;
        },
      });

      if (newPort) {
        await config.update('agentPort', parseInt(newPort, 10), vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Agent port updated to ${newPort}`);
        this._onDidChangeTreeData.fire();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update agent port: ${error}`);
      Logger.error('SettingsViewProvider: Failed to update agent port', error as Error);
    }
  }
}
