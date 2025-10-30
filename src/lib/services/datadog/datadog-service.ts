/**
 * Datadog Telemetry Service - Orchestrates telemetry collection and submission
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { DatadogTransport } from './datadog-transport';
import { OCSFTracker } from './ocsf-tracker';
import { CatchErrors } from '../../decorators';

/**
 * Main Datadog Telemetry Service
 * Orchestrates configuration, transport, and telemetry building
 */
export class DatadogTelemetryService {
  private static _instance: DatadogTelemetryService;
  private _context?: vscode.ExtensionContext;
  private _transport: DatadogTransport;
  private _ocsfTracker?: OCSFTracker;

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

    if (config.isEnabled && config.agentPort) {
      Logger.info(`DatadogTelemetryService: Initialized with OCSF tracking - enabled on port ${config.agentPort}`);
    } else {
      Logger.info('DatadogTelemetryService: Initialized (telemetry disabled, state tracking active)');
    }
  }

  getOCSFTracker(): OCSFTracker | undefined {
    return this._ocsfTracker;
  }

  isEnabled(): boolean {
    return this._transport.isEnabled();
  }
}
