/**
 * Datadog Telemetry Service - Orchestrates telemetry collection and submission
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { Logger } from '../../logger';
import { CONFIG } from '../../config';
import { Extension, ExtensionsRepository, ExtensionPackageJSON } from '../../extensions';
import { SecurityEvent } from '../../events/sec-events';
import { HeuristicResult } from '../../heuristics';
import { MetadataAnalyzer } from '../../../scanner/metadata-analyzer';
import { IDEStatusService } from '../ide-status-service';
import { DatadogTransport } from './datadog-transport';
import { TelemetryBuilder } from './telemetry-builder';
import { TelemetryMetadata, TelemetryLogItem } from './types';

/**
 * Main Datadog Telemetry Service
 * Orchestrates configuration, transport, and telemetry building
 */
export class DatadogTelemetryService {
  private static _instance: DatadogTelemetryService;
  private _context?: vscode.ExtensionContext;
  private _transport: DatadogTransport;
  private _builder: TelemetryBuilder;

  private constructor() {
    this._transport = new DatadogTransport();
    const metadata: TelemetryMetadata = { source: CONFIG.DATADOG.SOURCE, service: CONFIG.DATADOG.SERVICE };
    this._builder = new TelemetryBuilder(metadata, os.hostname());
  }

  static getInstance(): DatadogTelemetryService {
    if (!DatadogTelemetryService._instance) {
      DatadogTelemetryService._instance = new DatadogTelemetryService();
    }
    return DatadogTelemetryService._instance;
  }

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    try {
      this._context = context;
      const config = this._transport.getConfig();

      if (config.isEnabled && config.agentPort) {
        Logger.info(`DatadogTelemetryService: Initialized - enabled on port ${config.agentPort}`);
      }
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to initialize', error as Error);
    }
  }

  isEnabled(): boolean {
    return this._transport.isEnabled();
  }

  /**
   * Send extension repository data
   */
  async sendExtensionRepositoryData(extensions: Extension[]): Promise<void> {
    try {
      const payload = this._builder.buildExtensionRepositoryData(extensions);
      await this._transport.send([payload]);
      Logger.info('DatadogTelemetryService: Extension repository data sent successfully');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to send extension repository data', error as Error);
    }
  }

  /**
   * Send security event
   */
  async sendSecurityEvent(securityEvent: SecurityEvent): Promise<void> {
    try {
      const payload = this._builder.buildSecurityEvent(securityEvent);
      await this._transport.send([payload]);
      Logger.info(`DatadogTelemetryService: Security event sent (ID: ${securityEvent.secEventId})`);
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to send security event', error as Error);
    }
  }

  /**
   * Send metadata analysis
   */
  async sendMetadataAnalysis(results: HeuristicResult[]): Promise<void> {
    try {
      const payload = this._builder.buildMetadataAnalysis(results);
      await this._transport.send([payload]);
      Logger.info('DatadogTelemetryService: Metadata analysis sent successfully');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to send metadata analysis', error as Error);
    }
  }

  /**
   * Send all available telemetry data
   */
  async sendAllTelemetryData(): Promise<{
    isSuccessful: boolean;
    message: string;
    details: { extensions: number; analysis: number; events: number };
  }> {
    // In case the user calls the command from the command palette instead of the UI
    if (!this.isEnabled()) {
      return {
        isSuccessful: false,
        message: 'Telemetry is disabled. Enable it in settings first.',
        details: { extensions: 0, analysis: 0, events: 0 },
      };
    }

    try {
      const extensionsRepo = ExtensionsRepository.getInstance();

      const userExtensions = extensionsRepo.getUserExtensions();
      await this.sendExtensionRepositoryData(userExtensions);

      const extensionsForAnalysis = userExtensions
        .filter((ext: Extension) => ext.packageJSON)
        .map((ext: Extension) => ({ id: ext.id, packageJSON: ext.packageJSON as ExtensionPackageJSON }));

      let analysisCount = 0;
      if (extensionsForAnalysis.length > 0) {
        const analysisResults = MetadataAnalyzer.analyzeBatch(extensionsForAnalysis);
        await this.sendMetadataAnalysis(analysisResults.results);
        analysisCount = analysisResults.results.length;
      }

      const status = await IDEStatusService.getStatus();
      const securityEvents = status.lastSecurityEvents || [];
      for (const event of securityEvents) {
        await this.sendSecurityEvent(event);
      }

      return {
        isSuccessful: true,
        message: `Telemetry data sent successfully! Extensions: ${userExtensions.length}, Analysis: ${analysisCount}, Security Events: ${securityEvents.length}`,
        details: { extensions: userExtensions.length, analysis: analysisCount, events: securityEvents.length },
      };
    } catch (error) {
      return {
        isSuccessful: false,
        message: `Failed to send telemetry data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { extensions: 0, analysis: 0, events: 0 },
      };
    }
  }

  async handleSendTelemetryCommand(): Promise<void> {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Sending telemetry data to Datadog...',
        cancellable: false,
      },
      async () => {
        return await this.sendAllTelemetryData();
      },
    );

    if (result.isSuccessful) {
      vscode.window.showInformationMessage(result.message);
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }
}
