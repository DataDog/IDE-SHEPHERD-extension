/**
 * Datadog Telemetry Service - Orchestrates telemetry collection and submission
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { DatadogTransport } from './datadog-transport';
import { OCSFTracker } from './ocsf-tracker';
import { CatchErrors } from '../../decorators';
import {
  isAgentRunning,
  removeAgentLogging,
  doesShepherdConfigExist,
  readPortFromConfig,
  restartAgent,
  isShepherdConfigLoaded,
} from './agent-config';

/**
 * Main Datadog Telemetry Service
 * Orchestrates configuration, transport, and telemetry building
 */
export class DatadogTelemetryService {
  private static _instance: DatadogTelemetryService;
  private _context?: vscode.ExtensionContext;
  private _transport: DatadogTransport;
  private _ocsfTracker?: OCSFTracker;
  private _agentMonitorTimer?: NodeJS.Timeout;
  private _lastAgentStatus: boolean = false;

  private constructor() {
    this._transport = new DatadogTransport();
  }

  static getInstance(): DatadogTelemetryService {
    if (!DatadogTelemetryService._instance) {
      DatadogTelemetryService._instance = new DatadogTelemetryService();
    }
    return DatadogTelemetryService._instance;
  }

  @CatchErrors('DatadogTelemetryService')
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this._context = context;
    const config = this._transport.getConfig();

    this._ocsfTracker = new OCSFTracker(context, this._transport);

    // Start monitoring agent status
    this._lastAgentStatus = await isAgentRunning();
    this.startAgentMonitoring();

    // Check if there's an existing config file when telemetry is not enabled
    if (!config.isEnabled && this._lastAgentStatus) {
      await this.checkForExistingConfig();
    }

    if (config.isEnabled && config.agentPort) {
      Logger.info(`DatadogTelemetryService: Initialized with OCSF tracking - enabled on port ${config.agentPort}`);

      // Flush any queued events from previous session
      await this._ocsfTracker.flushQueuedEvents();
    } else {
      Logger.info('DatadogTelemetryService: Initialized (telemetry disabled, state tracking active)');
    }
  }

  /**
   * Check for existing IDE Shepherd configuration and prompt user to reuse it
   */
  private async checkForExistingConfig(): Promise<void> {
    try {
      const configExists = await doesShepherdConfigExist();

      if (configExists) {
        Logger.info('DatadogTelemetryService: Found existing IDE Shepherd configuration');

        const existingPort = await readPortFromConfig();
        const portInfo = existingPort ? ` on port ${existingPort}` : '';

        const choice = await vscode.window.showInformationMessage(
          `An existing IDE Shepherd configuration was detected${portInfo}. Would you like to reuse this configuration and enable telemetry?`,
          'Yes, Enable Telemetry',
          'No, Keep Disabled',
          'Remove Config',
        );

        if (choice === 'Yes, Enable Telemetry') {
          await this.enableExistingConfig(existingPort);
        } else if (choice === 'Remove Config') {
          await this.removeExistingConfig();
        } else {
          Logger.info('DatadogTelemetryService: User chose to keep telemetry disabled with existing config');
        }
      }
    } catch (error) {
      Logger.warn(
        `DatadogTelemetryService: Error checking for existing config - ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Enable telemetry using existing configuration
   */
  private async enableExistingConfig(port: number | undefined): Promise<void> {
    try {
      if (!port) {
        vscode.window.showWarningMessage(
          'Could not read port from existing configuration. Please enable telemetry manually.',
        );
        return;
      }

      const vsConfig = vscode.workspace.getConfiguration('ide-shepherd.datadog');
      await vsConfig.update('agentPort', port, vscode.ConfigurationTarget.Global);
      await vsConfig.update('isEnabled', true, vscode.ConfigurationTarget.Global);

      Logger.info(`DatadogTelemetryService: Enabled telemetry with existing config on port ${port}`);

      // Check if the config is already loaded in the agent
      const configLoaded = await isShepherdConfigLoaded();

      if (configLoaded) {
        // Config is already loaded, no restart needed
        vscode.window.showInformationMessage('✓ Telemetry enabled! Configuration is already active.');
        Logger.info('DatadogTelemetryService: Config already loaded in agent, no restart needed');
      } else {
        // Config exists but not loaded yet, offer to restart
        const restartChoice = await vscode.window.showInformationMessage(
          `Telemetry enabled! The agent needs to be restarted to load the configuration.`,
          'Restart Now',
          'Skip',
        );

        if (restartChoice === 'Restart Now') {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Restarting Datadog Agent...',
              cancellable: false,
            },
            async () => {
              await restartAgent();
            },
          );

          vscode.window.showInformationMessage('✓ Datadog Agent restarted successfully! Telemetry is now active.');
        } else {
          vscode.window.showInformationMessage(
            'Telemetry enabled. You need to restart the agent manually for it to work.',
          );
        }
      }

      // Flush any queued events
      if (this._ocsfTracker) {
        await this._ocsfTracker.flushQueuedEvents();
      }

      // Refresh the settings view
      vscode.commands.executeCommand('ide-shepherd.settings.refresh');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to enable existing config', error as Error);
      vscode.window.showErrorMessage(
        `Failed to enable telemetry: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Remove existing configuration file
   */
  private async removeExistingConfig(): Promise<void> {
    try {
      await removeAgentLogging();
      Logger.info('DatadogTelemetryService: Removed existing configuration');
      vscode.window.showInformationMessage('IDE Shepherd configuration removed from Datadog Agent.');

      // Refresh the settings view
      vscode.commands.executeCommand('ide-shepherd.settings.refresh');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to remove existing config', error as Error);
      vscode.window.showErrorMessage(
        `Failed to remove configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Monitor agent status and auto-disable telemetry if agent goes down
   */
  private startAgentMonitoring(): void {
    // Check agent status every 30 seconds
    this._agentMonitorTimer = setInterval(async () => {
      const config = this._transport.getConfig();
      if (!config.isEnabled) {
        return; // Telemetry already disabled
      }

      const agentRunning = await isAgentRunning();

      if (this._lastAgentStatus && !agentRunning) {
        Logger.warn('DatadogTelemetryService: Agent stopped, disabling telemetry');

        // Try to remove config file (will use cached path since agent is down)
        try {
          await removeAgentLogging();
          Logger.info('DatadogTelemetryService: Removed agent config file using cached path');
        } catch (error) {
          Logger.warn(
            `DatadogTelemetryService: Could not remove agent config file - ${error instanceof Error ? error.message : error}`,
          );
        }

        // Inform user and disable telemetry
        vscode.window
          .showWarningMessage('Datadog Agent has stopped. Telemetry has been automatically disabled.', 'View Settings')
          .then((selection) => {
            if (selection === 'View Settings') {
              vscode.commands.executeCommand('workbench.view.extension.ide-shepherd-explorer');
            }
          });

        const vsConfig = vscode.workspace.getConfiguration('ide-shepherd.datadog');
        await vsConfig.update('isEnabled', false, vscode.ConfigurationTarget.Global);

        vscode.commands.executeCommand('ide-shepherd.settings.refresh');
      }

      this._lastAgentStatus = agentRunning;
    }, 30000); // check every 30 seconds
  }

  dispose(): void {
    if (this._agentMonitorTimer) {
      clearInterval(this._agentMonitorTimer);
    }
  }

  getOCSFTracker(): OCSFTracker | undefined {
    return this._ocsfTracker;
  }

  isEnabled(): boolean {
    return this._transport.isEnabled();
  }
}
