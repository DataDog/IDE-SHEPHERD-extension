/**
 * Datadog Telemetry Service - Handles API key management and telemetry data submission to Datadog
 */

import * as vscode from 'vscode';
import * as os from 'os';
import * as net from 'net';
import { Logger } from '../logger';
import { CONFIG } from '../config';
import { Extension, ExtensionsRepository, ExtensionPackageJSON } from '../extensions';
import { SecurityEvent } from '../events/sec-events';
import { HeuristicResult } from '../heuristics';
import { MetadataAnalyzer } from '../../scanner/metadata-analyzer';
import { IDEStatusService } from './ide-status-service';
import {
  TelemetryLogItem,
  DatadogTags,
  DatadogEnvironment,
  TelemetryEventType,
  createBaseTelemetryItem,
} from './datadog-telemetry';

const enabled = CONFIG.DATADOG.DEFAULTS.ENABLED;
const agentPort = CONFIG.DATADOG.DEFAULTS.AGENT_PORT;
const telemetryInterval = CONFIG.DATADOG.DEFAULTS.TELEMETRY_INTERVAL_MS;
const source = CONFIG.DATADOG.SOURCE;
const service = CONFIG.DATADOG.SERVICE;

interface DatadogConfig {
  enabled: boolean;
  agentPort: number;
}

export class DatadogTelemetryService {
  private static _instance: DatadogTelemetryService;
  private _context?: vscode.ExtensionContext;

  private constructor() {}

  static getInstance(): DatadogTelemetryService {
    if (!DatadogTelemetryService._instance) {
      DatadogTelemetryService._instance = new DatadogTelemetryService();
    }
    return DatadogTelemetryService._instance;
  }

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    try {
      this._context = context;

      Logger.info('DatadogTelemetryService: Initializing Agent-based logging');

      const config = this.getConfig();
      if (config.enabled) {
        Logger.info(`DatadogTelemetryService: Agent configured on port ${config.agentPort}`);
      } else {
        Logger.info('DatadogTelemetryService: Telemetry disabled. Enable in settings to start.');
      }

      Logger.info('DatadogTelemetryService: Initialized successfully');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to initialize', error as Error);
    }
  }

  private getConfig(): DatadogConfig {
    const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');
    return { enabled: config.get<boolean>('enabled', enabled), agentPort: config.get<number>('agentPort', agentPort) };
  }

  isEnabled(): boolean {
    const config = this.getConfig();
    return config.enabled;
  }

  getDatadogMetadata(): { source: string; service: string } {
    return { source: source, service: service };
  }

  async sendExtensionRepositoryData(extensions: Extension[]): Promise<void> {
    if (!this.isEnabled()) {
      Logger.debug('DatadogTelemetryService: Telemetry disabled, skipping extension repository data');
      return;
    }

    try {
      const metadata = this.getDatadogMetadata();
      const repositoryTags: DatadogTags = {
        env: DatadogEnvironment.PRODUCTION,
        type: TelemetryEventType.EXTENSION_REPOSITORY,
      };

      const repositoryData = {
        ...createBaseTelemetryItem(
          metadata.source,
          metadata.service,
          repositoryTags,
          'Extension Repository Data',
          os.hostname(),
          vscode.env.machineId,
        ),
        extensions_count: extensions.length,
        extensions: extensions.map((ext) => ({
          id: ext.id,
          displayName: ext.displayName,
          isActive: ext.isActive,
          isBuiltIn: ext.isBuiltIn,
          publisher: ext.packageJSON?.publisher,
          version: ext.packageJSON?.version,
          description: ext.packageJSON?.description,
        })),
        user_extensions_count: extensions.filter((ext) => !ext.isBuiltIn).length,
        active_extensions_count: extensions.filter((ext) => ext.isActive).length,
      } as TelemetryLogItem;

      await this.sendToDatadog([repositoryData]);
      Logger.info('DatadogTelemetryService: Extension repository data sent successfully');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to send extension repository data', error as Error);
    }
  }

  async sendSecurityEvent(securityEvent: SecurityEvent): Promise<void> {
    if (!this.isEnabled()) {
      Logger.debug('DatadogTelemetryService: Telemetry disabled, skipping security event');
      return;
    }

    try {
      const metadata = this.getDatadogMetadata();
      const eventTags: DatadogTags = {
        env: DatadogEnvironment.PRODUCTION,
        type: TelemetryEventType.SECURITY_EVENT,
        severity: securityEvent.severity,
      };

      const telemetryData = {
        ...createBaseTelemetryItem(
          metadata.source,
          metadata.service,
          eventTags,
          `Security Event: ${securityEvent.getPrimaryIoC().rule}`,
          os.hostname(),
          vscode.env.machineId,
        ),
        timestamp: securityEvent.timestamp,
        security_event_id: securityEvent.secEventId,
        severity: securityEvent.severity,
        extension_id: securityEvent.extension.id,
        extension_is_patched: securityEvent.extension.isPatched,
        iocs: securityEvent.iocs,
        summary: securityEvent.getSummary(),
      } as TelemetryLogItem;

      await this.sendToDatadog([telemetryData]);
      Logger.info(`DatadogTelemetryService: Security event sent successfully (ID: ${securityEvent.secEventId})`);
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to send security event', error as Error);
    }
  }

  /**
   * Send extension metadata analysis to Datadog
   */
  async sendMetadataAnalysis(results: HeuristicResult[]): Promise<void> {
    if (!this.isEnabled()) {
      Logger.debug('DatadogTelemetryService: Telemetry disabled, skipping metadata analysis');
      return;
    }

    try {
      const metadata = this.getDatadogMetadata();
      const analysisTags: DatadogTags = {
        env: DatadogEnvironment.PRODUCTION,
        type: TelemetryEventType.METADATA_ANALYSIS,
      };

      const analysisData = {
        ...createBaseTelemetryItem(
          metadata.source,
          metadata.service,
          analysisTags,
          'Extension Metadata Analysis',
          os.hostname(),
          vscode.env.machineId,
        ),
        total_analyzed: results.length,
        results: results.map((result) => ({
          extension_id: result.extensionId,
          risk_score: result.riskScore,
          risk_level: result.overallRisk,
          suspicious_patterns_count: result.suspiciousPatterns.length,
          patterns: result.suspiciousPatterns.map((pattern) => ({
            pattern: pattern.pattern,
            severity: pattern.severity,
            category: pattern.category,
          })),
        })),
        high_risk_count: results.filter((r) => r.overallRisk === 'high').length,
        medium_risk_count: results.filter((r) => r.overallRisk === 'medium').length,
        low_risk_count: results.filter((r) => r.overallRisk === 'low').length,
      } as TelemetryLogItem;

      await this.sendToDatadog([analysisData]);
      Logger.info('DatadogTelemetryService: Metadata analysis sent successfully');
    } catch (error) {
      Logger.error('DatadogTelemetryService: Failed to send metadata analysis', error as Error);
    }
  }

  /**
   * Send data to Datadog Agent via TCP socket
   */
  private async sendToDatadog(logItems: TelemetryLogItem[]): Promise<void> {
    const config = this.getConfig();

    return new Promise((resolve, reject) => {
      try {
        const socket = net.createConnection({ host: 'localhost', port: config.agentPort }, () => {
          Logger.debug(`DatadogTelemetryService: Connected to Datadog Agent on port ${config.agentPort}`);

          // Send each log item as a JSON line
          for (const item of logItems) {
            const logMessage = JSON.stringify(item) + '\n';
            const sent = socket.write(logMessage);

            if (!sent) {
              Logger.warn('DatadogTelemetryService: Socket buffer full, message may be delayed');
            }
          }

          socket.end();
        });

        socket.on('close', () => {
          Logger.debug('DatadogTelemetryService: Successfully sent data to Datadog Agent');
          resolve();
        });

        socket.on('error', (error) => {
          Logger.error('DatadogTelemetryService: Failed to connect to Datadog Agent', error);
          reject(new Error(`Failed to forward logs to Datadog Agent: ${error.message}`));
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Connection to Datadog Agent timed out'));
        });

        // Set timeout to 5 seconds
        socket.setTimeout(5000);
      } catch (error) {
        Logger.error('DatadogTelemetryService: Failed to send data to Agent', error as Error);
        reject(error);
      }
    });
  }

  /**
   * Send all available telemetry data (repository, metadata analysis, security events)
   */
  async sendAllTelemetryData(): Promise<{
    success: boolean;
    message: string;
    details: { extensions: number; analysis: number; events: number };
  }> {
    if (!this.isEnabled()) {
      return {
        success: false,
        message: 'Telemetry is disabled. Enable it in settings first.',
        details: { extensions: 0, analysis: 0, events: 0 },
      };
    }

    try {
      const extensionsRepo = ExtensionsRepository.getInstance();

      const allExtensions = extensionsRepo.getAllExtensions();
      await this.sendExtensionRepositoryData(allExtensions);

      const userExtensions = extensionsRepo.getUserExtensions();
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
        success: true,
        message: `Telemetry data sent successfully! Extensions: ${allExtensions.length}, Analysis: ${analysisCount}, Security Events: ${securityEvents.length}`,
        details: { extensions: allExtensions.length, analysis: analysisCount, events: securityEvents.length },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send telemetry data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { extensions: 0, analysis: 0, events: 0 },
      };
    }
  }

  /**
   * Test connection to Datadog Agent
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const config = this.getConfig();
    if (!config.enabled) {
      return { success: false, message: 'Telemetry is disabled. Enable it in settings first.' };
    }

    try {
      const metadata = this.getDatadogMetadata();
      const tags: DatadogTags = { env: DatadogEnvironment.TEST, type: TelemetryEventType.CONNECTION_TEST };

      const testLog = {
        ...createBaseTelemetryItem(
          metadata.source,
          metadata.service,
          tags,
          'Datadog Agent Connection Test',
          os.hostname(),
          vscode.env.machineId,
        ),
      } as TelemetryLogItem;

      await this.sendToDatadog([testLog]);
      return {
        success: true,
        message: `Connection successful! Test event sent to Datadog Agent on port ${config.agentPort}.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}. Ensure Datadog Agent is running and configured on port ${config.agentPort}.`,
      };
    }
  }
}
