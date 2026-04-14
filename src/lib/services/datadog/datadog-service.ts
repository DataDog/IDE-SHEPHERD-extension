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
  getCachedConfigPath,
  setCachedConfigPath,
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
  private _consecutiveAgentFailures: number = 0;
  private static readonly AGENT_DOWN_THRESHOLD = 3; // require 3 consecutive failures (~90s) before disabling

  private constructor() {
    this._transport = new DatadogTransport();
  }

  static getInstance(): DatadogTelemetryService {
    if (!DatadogTelemetryService._instance) {
      DatadogTelemetryService._instance = new DatadogTelemetryService();
    }
    return DatadogTelemetryService._instance;
  }

  private static readonly CACHED_CONFIG_PATH_KEY = 'ide-shepherd.cachedAgentConfigPath';

  @CatchErrors('DatadogTelemetryService')
  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this._context = context;
    const config = this._transport.getConfig();

    // Restore the agent config dir path cached from the previous session so that
    // removeAgentLogging() can still find the config file if the agent is down on startup.
    const savedPath = context.globalState.get<string>(DatadogTelemetryService.CACHED_CONFIG_PATH_KEY);
    if (savedPath) {
      setCachedConfigPath(savedPath);
      Logger.info(`DatadogTelemetryService: Restored cached agent config path: ${savedPath}`);
    }

    this._ocsfTracker = new OCSFTracker(context, this._transport);

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

      const configLoaded = await isShepherdConfigLoaded();

      if (configLoaded) {
        vscode.window.showInformationMessage('✓ Telemetry enabled! Configuration is already active.');
      } else {
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
   * Monitor agent status and auto-disable telemetry if agent goes down.
   * Requires multiple consecutive failures before disabling to avoid false positives
   * during transient events like IDE updates or restarts.
   */
  private startAgentMonitoring(): void {
    // Check agent status every 30 seconds
    this._agentMonitorTimer = setInterval(async () => {
      const config = this._transport.getConfig();
      if (!config.isEnabled) {
        this._consecutiveAgentFailures = 0;
        return; // Telemetry already disabled
      }

      const agentRunning = await isAgentRunning();

      if (agentRunning) {
        this._consecutiveAgentFailures = 0;
      } else {
        this._consecutiveAgentFailures++;
        Logger.warn(
          `DatadogTelemetryService: Agent unreachable (consecutive failures: ${this._consecutiveAgentFailures}/${DatadogTelemetryService.AGENT_DOWN_THRESHOLD})`,
        );
      }

      if (!agentRunning && this._consecutiveAgentFailures >= DatadogTelemetryService.AGENT_DOWN_THRESHOLD) {
        this._consecutiveAgentFailures = 0;
        Logger.warn('DatadogTelemetryService: Agent confirmed stopped, disabling telemetry');

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

  /**
   * Persist the current agent config directory path to globalState so it can be
   * restored after an extension host restart (e.g. IDE update).
   * Call this right after configureAgentLogging() succeeds.
   */
  async persistCachedConfigPath(): Promise<void> {
    if (!this._context) {
      return;
    }
    const path = getCachedConfigPath();
    await this._context.globalState.update(DatadogTelemetryService.CACHED_CONFIG_PATH_KEY, path);
    Logger.info(`DatadogTelemetryService: Persisted agent config path: ${path}`);
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
