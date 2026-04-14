/**
 * Settings View Provider - Displays and manages IDE Shepherd settings
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import {
  configureAgentLogging,
  removeAgentLogging,
  isAgentRunning,
  restartAgent,
  findAvailablePort,
  isShepherdConfigLoaded,
} from '../datadog/agent-config';
import { DatadogTelemetryService } from '../datadog/datadog-service';

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

    const agentRunning = await isAgentRunning();

    if (!agentRunning) {
      const messageItem = new vscode.TreeItem('Datadog Agent Not Running', vscode.TreeItemCollapsibleState.None);
      messageItem.iconPath = new vscode.ThemeIcon('error');
      messageItem.tooltip = 'Please start the Datadog Agent to enable telemetry';
      messageItem.contextValue = 'info';
      items.push(messageItem);
      return items;
    }

    // Agent is running -> show telemetry controls
    const enabled = config.get<boolean>('isEnabled', false);
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

    // Check if config is loaded in agent status
    const configLoaded = await isShepherdConfigLoaded();

    // Determine if restart is pending
    // 1. If enabled but config not loaded -> pending restart
    // 2. If disabled but config still loaded -> pending restart
    const isPendingRestart = (enabled && !configLoaded) || (!enabled && configLoaded);

    if (enabled || isPendingRestart) {
      // Agent status

      let statusLabel: string;
      let statusIcon: string;
      let statusTooltip: string;

      if (isPendingRestart) {
        statusLabel = 'Agent Status: Pending Restart';
        statusIcon = 'warning';
        statusTooltip = 'Agent needs restart to apply configuration. Click "Refresh Settings" after restarting.';
      } else if (agentRunning) {
        statusLabel = 'Agent Status: Running';
        statusIcon = 'pass';
        statusTooltip = 'Datadog Agent is running';
      } else {
        statusLabel = 'Agent Status: Not Running';
        statusIcon = 'error';
        statusTooltip = 'Datadog Agent is not running or not installed';
      }

      const agentStatusItem = new vscode.TreeItem(statusLabel, vscode.TreeItemCollapsibleState.None);
      agentStatusItem.id = 'datadog.agentStatus';
      agentStatusItem.iconPath = new vscode.ThemeIcon(statusIcon);
      agentStatusItem.tooltip = statusTooltip;
      agentStatusItem.contextValue = 'status';
      items.push(agentStatusItem);
    }

    if (enabled) {
      // Agent port
      const port = config.get<number>('agentPort');
      const portItem = new vscode.TreeItem(
        `Agent Port: ${port !== undefined ? port : 'Not configured'}`,
        vscode.TreeItemCollapsibleState.None,
      );
      portItem.id = 'datadog.agentPort';
      portItem.iconPath = new vscode.ThemeIcon('plug');
      portItem.tooltip = `Datadog Agent listening on port ${port}`;
      portItem.contextValue = 'info';
      items.push(portItem);
    }

    return items;
  }

  /**
   * Toggle Datadog telemetry enabled/disabled
   */
  async toggleDatadogTelemetry(): Promise<void> {
    try {
      // Check if agent is running before allowing toggle
      const agentRunning = await isAgentRunning();
      if (!agentRunning) {
        vscode.window
          .showWarningMessage(
            'Datadog Agent is not running. Please start the agent before enabling telemetry.',
            'Learn More',
          )
          .then((selection) => {
            if (selection === 'Learn More') {
              vscode.env.openExternal(vscode.Uri.parse('https://docs.datadoghq.com/agent/'));
            }
          });
        return;
      }

      const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');
      const currentValue = config.get<boolean>('isEnabled', false);

      if (!currentValue) {
        await this.enableDatadogTelemetry();
      } else {
        await this.disableDatadogTelemetry();
      }

      // Refresh the view - useful when manually restarting the agent
      this._onDidChangeTreeData.fire();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to toggle Datadog telemetry: ${error}`);
      Logger.error('SettingsViewProvider: Failed to toggle Datadog telemetry', error as Error);
    }
  }

  /**
   * Restart the agent UI
   */
  private async restartAgentWithConfirmation(message: string): Promise<void> {
    const restartAction = await vscode.window.showInformationMessage(message, 'Restart Now', 'Skip');

    if (restartAction === 'Restart Now') {
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Restarting Datadog Agent...', cancellable: false },
          async () => {
            await restartAgent();
          },
        );

        const agentRunning = await isAgentRunning();
        if (agentRunning) {
          vscode.window.showInformationMessage('✓ Datadog Agent restarted successfully! Configuration applied.');
        } else {
          vscode.window.showWarningMessage(
            'Agent restart completed but not responding yet. Please wait a moment and refresh the sidebar.',
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to restart agent: ${error instanceof Error ? error.message : error}`);
      }
    } else if (restartAction === 'Skip') {
      vscode.window.showInformationMessage(
        'Agent restart skipped. Configuration will not be applied until you restart manually. Click "Refresh Settings" after restarting.',
      );
    }

    this._onDidChangeTreeData.fire();
  }

  /**
   * Enable Datadog telemetry with automatic agent configuration
   * Assumes agent is already running (checked by caller)
   */
  private async enableDatadogTelemetry(): Promise<void> {
    const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');

    let portToUse: number;
    try {
      portToUse = await findAvailablePort();
      Logger.info(`Automatically selected port ${portToUse} for Datadog Agent`);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to find an available port: ${error instanceof Error ? error.message : error}`,
      );
      return;
    }

    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Configuring Datadog Agent...', cancellable: false },
        async () => {
          await configureAgentLogging(portToUse);
        },
      );

      // Persist the config dir path so it survives an extension host restart.
      await DatadogTelemetryService.getInstance().persistCachedConfigPath();

      await config.update('agentPort', portToUse, vscode.ConfigurationTarget.Global);

      // config file has been updated, agent needs to restart to apply changes
      this._onDidChangeTreeData.fire();

      await this.restartAgentWithConfirmation(`Datadog Agent configured on port ${portToUse}. Restart the agent now?`);
    } catch (error) {
      throw new Error(`Failed to configure Datadog Agent: ${error instanceof Error ? error.message : error}`);
    }

    // Enable telemetry in settings
    await config.update('isEnabled', true, vscode.ConfigurationTarget.Global);

    // Flush any queued events
    const telemetryService = DatadogTelemetryService.getInstance();
    const tracker = telemetryService.getOCSFTracker();
    if (tracker) {
      await tracker.flushQueuedEvents();
    }

    vscode.window.showInformationMessage(`Datadog telemetry enabled on port ${portToUse}`);
    Logger.info(`SettingsViewProvider: Datadog telemetry enabled on port ${portToUse}`);
  }

  /**
   * Disable Datadog telemetry and remove agent configuration
   */
  private async disableDatadogTelemetry(): Promise<void> {
    const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Removing Datadog Agent configuration...',
          cancellable: false,
        },
        async () => {
          await removeAgentLogging();
        },
      );

      // Clear the persisted config path now that the config file is gone.
      await DatadogTelemetryService.getInstance().persistCachedConfigPath();

      // config file has been removed, restart agent
      this._onDidChangeTreeData.fire();

      await this.restartAgentWithConfirmation('Datadog Agent configuration removed. Restart the agent now?');
    } catch (error) {
      Logger.warn(`Failed to remove Datadog Agent configuration: ${error instanceof Error ? error.message : error}`);
      vscode.window.showWarningMessage(
        `Failed to remove agent configuration: ${error instanceof Error ? error.message : error}`,
      );
    }

    // Disable telemetry in settings
    await config.update('isEnabled', false, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage('Datadog telemetry disabled');
    Logger.info('SettingsViewProvider: Datadog telemetry disabled');
  }
}
