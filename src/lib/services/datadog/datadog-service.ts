/**
 * Datadog Telemetry Service - Orchestrates telemetry collection and submission
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { DatadogTransport } from './datadog-transport';
import { OCSFTracker } from './ocsf-tracker';
import { CatchErrors } from '../../decorators';
import { isAgentRunning, removeAgentLogging } from './agent-config';

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

    if (config.isEnabled && config.agentPort) {
      Logger.info(`DatadogTelemetryService: Initialized with OCSF tracking - enabled on port ${config.agentPort}`);

      // Flush any queued events from previous session
      await this._ocsfTracker.flushQueuedEvents();
    } else {
      Logger.info('DatadogTelemetryService: Initialized (telemetry disabled, state tracking active)');
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
