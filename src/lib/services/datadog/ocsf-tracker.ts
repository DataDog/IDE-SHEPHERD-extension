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
import { CatchErrors } from '../../decorators';
import type { OCSFDetectionFinding, OCSFAppSecurityPostureFinding } from './ocsf-types';

const MAX_QUEUE_SIZE = 100;
const QUEUE_STORAGE_KEY = 'ide-shepherd.ocsfEventQueue';

/**
 * Tracks extension changes and sends OCSF events to datadog agent
 */
export class OCSFTracker implements ExtensionChangeListener {
  private stateTracker: ExtensionStateTracker;
  private transport: DatadogTransport;
  private context: vscode.ExtensionContext;
  private processor: ExtensionChangeProcessorService;
  private eventQueue: Array<OCSFDetectionFinding | OCSFAppSecurityPostureFinding> = [];

  constructor(context: vscode.ExtensionContext, transport: DatadogTransport) {
    this.context = context;
    this.transport = transport;
    this.stateTracker = new ExtensionStateTracker(context);
    this.processor = ExtensionChangeProcessorService.getInstance();

    this.loadQueue();

    // Perform initial comparison to detect changes that happened while offline (mainly uninstallation)
    this.performInitialComparison();
  }

  private loadQueue(): void {
    try {
      const stored = this.context.globalState.get<Array<OCSFDetectionFinding | OCSFAppSecurityPostureFinding>>(
        QUEUE_STORAGE_KEY,
        [],
      );

      if (stored.length > 0) {
        this.eventQueue = stored;
        Logger.info(`OCSFTracker: Loaded ${stored.length} queued events from previous session`);
      }
    } catch (error) {
      Logger.error('OCSFTracker: Failed to load queued events from storage', error as Error);
      this.eventQueue = [];
    }
  }

  /**
   * Save queued events to persistent storage
   */
  private async saveQueue(): Promise<void> {
    try {
      await this.context.globalState.update(QUEUE_STORAGE_KEY, this.eventQueue);
      Logger.debug(`OCSFTracker: Saved ${this.eventQueue.length} events to persistent storage`);
    } catch (error) {
      Logger.error('OCSFTracker: Failed to save queued events to storage', error as Error);
    }
  }

  /**
   * Flush all queued events to Datadog agent
   */
  async flushQueuedEvents(): Promise<void> {
    this.loadQueue();

    if (this.eventQueue.length === 0) {
      return;
    }

    Logger.info(`OCSFTracker: Flushing ${this.eventQueue.length} queued events`);

    try {
      await this.transport.send(this.eventQueue);
      Logger.info(`OCSFTracker: Successfully sent ${this.eventQueue.length} queued events`);
      this.eventQueue = [];

      await this.saveQueue();
    } catch (error) {
      Logger.error('OCSFTracker: Failed to flush queued events', error as Error);
    }
  }

  /**
   * Add event to queue (FIFO) if telemetry is disabled
   * Returns true if event was queued, false if sent immediately
   */
  private async sendOrQueueOCSFEvent(event: OCSFDetectionFinding | OCSFAppSecurityPostureFinding): Promise<boolean> {
    if (!this.transport.isEnabled()) {
      this.loadQueue();

      // Telemetry disabled -> queue the event
      if (this.eventQueue.length >= MAX_QUEUE_SIZE) {
        this.eventQueue.shift();
        Logger.warn(`OCSFTracker: Queue full, dropping oldest event (queue size: ${MAX_QUEUE_SIZE})`);
      }

      this.eventQueue.push(event);
      Logger.debug(`OCSFTracker: Event queued (queue size: ${this.eventQueue.length}/${MAX_QUEUE_SIZE})`);

      await this.saveQueue();
      return true;
    }

    // Telemetry enabled -> send immediately
    await this.transport.send([event]);
    return false;
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
   * Send or queue OCSF event for Datadog agent
   */
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

    const queued = await this.sendOrQueueOCSFEvent(ocsfEvent);
    if (!queued) {
      Logger.info(
        `OCSFTracker: Sent ${ExtensionActivityID[activity]} OCSF event for ${change.displayName} (Risk: ${processed.result.overallRisk})`,
      );
    } else {
      Logger.info(
        `OCSFTracker: Queued ${ExtensionActivityID[activity]} OCSF event for ${change.displayName} (Risk: ${processed.result.overallRisk})`,
      );
    }
  }

  /**
   * Send or queue CLOSE event for uninstalled extension
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

    const ocsfEvent = this.buildOCSFEvent(extension, heuristicResult, ExtensionActivityID.CLOSE);
    const queued = await this.sendOrQueueOCSFEvent(ocsfEvent);

    if (!queued) {
      Logger.info(
        `OCSFTracker: Sent CLOSE event for ${change.displayName} (Risk: ${heuristicResult.overallRisk}, Patterns: ${heuristicResult.suspiciousPatterns.length})`,
      );
    } else {
      Logger.info(
        `OCSFTracker: Queued CLOSE event for ${change.displayName} (Risk: ${heuristicResult.overallRisk}, Patterns: ${heuristicResult.suspiciousPatterns.length})`,
      );
    }
  }

  buildOCSFEvent(extension: Extension, result: HeuristicResult, activity: ExtensionActivityID) {
    return buildAppSecurityPostureFinding(result, extension, activity);
  }

  /**
   * Handle security event and send or queue OCSF Detection Finding to Datadog
   */
  @CatchErrors('OCSFTracker')
  async onSecurityEvent(securityEvent: SecurityEvent): Promise<void> {
    const ocsfEvent = buildDetectionFinding(securityEvent, ExtensionActivityID.CREATE);
    const queued = await this.sendOrQueueOCSFEvent(ocsfEvent);

    if (!queued) {
      Logger.info(
        `OCSFTracker: Sent Detection Finding for security event ${securityEvent.secEventId} (Extension: ${securityEvent.extension.id}, Severity: ${securityEvent.severity})`,
      );
    } else {
      Logger.info(
        `OCSFTracker: Queued Detection Finding for security event ${securityEvent.secEventId} (Extension: ${securityEvent.extension.id}, Severity: ${securityEvent.severity})`,
      );
    }
  }
}
