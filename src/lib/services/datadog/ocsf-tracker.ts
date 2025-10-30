/**
 * OCSF Tracker - Handles OCSF event creation and telemetry sending for extension changes
 * The tracker has two triggers:
 * 1. Extensions' changes (onDidChange event)
 * 2. Metadata analysis changes (updated rule set)
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { Extension, ExtensionsRepository } from '../../extensions';
import { HeuristicResult, RiskLevel } from '../../heuristics';
import { ExtensionChangeListener } from '../extension-lifecycle-service';
import { ExtensionStateTracker, ExtensionChange, ExtensionActivityID } from '../extension-state-tracker';
import { ExtensionChangeProcessorService, ProcessedChange } from '../extension-change-processor';
import { buildAppSecurityPostureFinding, buildDetectionFinding } from './ocsf-builder';
import { DatadogTransport } from './datadog-transport';
import { SecurityEvent } from '../../events/sec-events';
import { RequiresTelemetry } from './telemetry-decorators';
import { CatchErrors } from '../../decorators';

/**
 * Tracks extension changes and sends OCSF events to datadog agent
 */
export class OCSFTracker implements ExtensionChangeListener {
  private stateTracker: ExtensionStateTracker;
  private transport: DatadogTransport;
  private context: vscode.ExtensionContext;
  private processor: ExtensionChangeProcessorService;

  constructor(context: vscode.ExtensionContext, transport: DatadogTransport) {
    this.context = context;
    this.transport = transport;
    this.stateTracker = new ExtensionStateTracker(context);
    this.processor = ExtensionChangeProcessorService.getInstance();

    // Perform initial comparison to detect changes that happened while offline (mainly uninstallation)
    this.performInitialComparison();
  }

  /**
   * Compare persisted state with current extensions on startup
   * This detects uninstalls/installs that happened during extension host restart
   */
  @CatchErrors('OCSFTracker')
  private async performInitialComparison(): Promise<void> {
    const currentExtensions = ExtensionsRepository.getInstance().getUserExtensions();
    const changes = this.stateTracker.detectChanges(currentExtensions);
    if (changes.length > 0) {
      await this.processChanges(changes);
    }
  }

  // First case: update OCSF logs on extensions' changes
  @CatchErrors('OCSFTracker')
  async onExtensionChange(): Promise<void> {
    const currentExtensions = ExtensionsRepository.getInstance().getUserExtensions();
    const changes = this.stateTracker.detectChanges(currentExtensions);

    if (changes.length > 0) {
      for (const change of changes) {
        Logger.info(
          `\t\t${ExtensionActivityID[change.changeType]}: ${change.displayName}${change.oldVersion ? ` (${change.oldVersion} → ${change.newVersion})` : ` v${change.newVersion}`}`,
        );
      }

      await this.processChanges(changes);
    } else {
      Logger.info('OCSFTracker: No changes detected');
    }
  }

  /**
   * Process detected changes and send OCSF events
   */
  private async processChanges(changes: ExtensionChange[]): Promise<void> {
    const processedChanges = await this.processor.processChanges(changes, this.stateTracker);
    for (const processed of processedChanges) {
      try {
        await this.sendAppSecurityPostureEvent(processed);
      } catch (error) {
        Logger.error(`OCSFTracker: Failed to send OCSF event for ${processed.change.displayName}`, error as Error);
      }
    }
  }

  /**
   * Send OCSF event to Datadog agent
   */
  @RequiresTelemetry()
  private async sendAppSecurityPostureEvent(processed: ProcessedChange): Promise<void> {
    const change = processed.change;
    const activity = processed.activity;

    if (activity === ExtensionActivityID.CLOSE) {
      await this.sendCloseEvent(change);
      return;
    }
    if (!processed.result || !change.extension) {
      Logger.warn(`OCSFTracker: Cannot send OCSF event for ${change.displayName} - missing data`);
      return;
    }
    const ocsfEvent = this.buildOCSFEvent(change.extension, processed.result, activity);

    Logger.info(
      `OCSFTracker: Sending ${ExtensionActivityID[activity]} OCSF event for ${change.displayName} (Risk: ${processed.result.overallRisk})`,
    );
    await this.transport.send([ocsfEvent]);
  }

  /**
   * Send CLOSE event for uninstalled extension
   * Uses the extension data and heuristic result from the saved state
   */
  private async sendCloseEvent(change: ExtensionChange): Promise<void> {
    const extension = change.extension;
    const heuristicResult = change.heuristicResult;

    if (!extension || !heuristicResult) {
      Logger.warn(
        `OCSFTracker: Cannot send CLOSE event for ${change.displayName} - missing extension or heuristic data`,
      );
      return;
    }
    Logger.info(
      `OCSFTracker: Sending CLOSE event for ${change.displayName} (Risk: ${heuristicResult.overallRisk}, Patterns: ${heuristicResult.suspiciousPatterns.length})`,
    );

    const ocsfEvent = this.buildOCSFEvent(extension, heuristicResult, ExtensionActivityID.CLOSE);
    await this.transport.send([ocsfEvent]);
  }

  buildOCSFEvent(extension: Extension, result: HeuristicResult, activity: ExtensionActivityID) {
    return buildAppSecurityPostureFinding(result, extension, activity);
  }

  /**
   * Handle security event and send OCSF Detection Finding to Datadog
   */
  @RequiresTelemetry()
  @CatchErrors('OCSFTracker')
  async onSecurityEvent(securityEvent: SecurityEvent): Promise<void> {
    Logger.info(
      `OCSFTracker: Sending Detection Finding for security event ${securityEvent.secEventId} (Extension: ${securityEvent.extension.id}, Severity: ${securityEvent.severity})`,
    );

    const ocsfEvent = buildDetectionFinding(securityEvent, ExtensionActivityID.CREATE);
    await this.transport.send([ocsfEvent]);
  }
}
