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
import { ExtensionStateTracker, ExtensionChange } from './ocsf-tracker-helper';
import { OCSFActivityID } from './ocsf-types';
import { DatadogTransport } from './datadog-transport';

/**
 * Tracks extension changes and sends OCSF events to datadog agent
 */
export class OCSFTracker implements ExtensionChangeListener {
  private stateTracker: ExtensionStateTracker;
  private transport: DatadogTransport;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext, transport: DatadogTransport) {
    this.context = context;
    this.transport = transport;
    this.stateTracker = new ExtensionStateTracker(context);

    // Perform initial comparison to detect changes that happened while offline (mainly uninstallation)
    this.performInitialComparison();
  }

  /**
   * Compare persisted state with current extensions on startup
   * This detects uninstalls/installs that happened during extension host restart
   */
  private async performInitialComparison(): Promise<void> {
    try {
      const currentExtensions = ExtensionsRepository.getInstance().getUserExtensions();
      const changes = this.stateTracker.detectChanges(currentExtensions);
      if (changes.length > 0) {
        await this.processChanges(changes);
      }
    } catch (error) {
      Logger.error('OCSFTracker: Failed to perform initial comparison', error as Error);
    }
  }

  // First case: update OCSF logs on extensions' changes
  async onExtensionChange(): Promise<void> {
    try {
      const currentExtensions = ExtensionsRepository.getInstance().getUserExtensions();
      const changes = this.stateTracker.detectChanges(currentExtensions);

      if (changes.length > 0) {
        Logger.info(`OCSFTracker: Processing ${changes.length} change(s):`);
        for (const change of changes) {
          Logger.info(
            `\t\t${OCSFActivityID[change.changeType]}: ${change.displayName}${change.oldVersion ? ` (${change.oldVersion} → ${change.newVersion})` : ` v${change.newVersion}`}`,
          );
        }

        await this.processChanges(changes);
      } else {
        Logger.info('OCSFTracker: No changes detected');
      }
    } catch (error) {
      Logger.error('OCSFTracker: Failed to process extension changes', error as Error);
    }
  }

  /**
   * Process detected changes and send OCSF events
   */
  private async processChanges(changes: ExtensionChange[]): Promise<void> {
    for (const change of changes) {
      try {
        if (change.changeType === OCSFActivityID.CLOSE) {
          await this.handleClose(change);
        } else if (change.changeType === OCSFActivityID.CREATE || change.changeType === OCSFActivityID.UPDATE) {
          // TODO: For CREATE and UPDATE, we need to re-analyze the extension first
          Logger.debug(
            `OCSFTracker: ${OCSFActivityID[change.changeType]} event for ${change.displayName} will be sent during next analysis`,
          );
        }
        // TODO: send OCSF event
      } catch (error) {
        Logger.error(`OCSFTracker: Failed to process change for ${change.displayName}`, error as Error);
      }
    }
  }

  /**
   * Update the extension state to CLOSED
   */
  private async handleClose(change: ExtensionChange): Promise<void> {
    const state = this.stateTracker.getState(change.displayName);
    if (state) {
      Logger.info(`OCSFTracker: Extension ${change.displayName} uninstalled, marking as closed`);
      await this.stateTracker.markAsClosed(change.displayName);
    }
  }

  /**
   * Can also be called externally (e.g., during mass metadata analysis after a rule set update)
   */
  async sendOCSFEvent(result: HeuristicResult, extension: Extension): Promise<void> {
    try {
      const { event, activity } = this.stateTracker.buildOCSFEvent(extension, result);
      await this.transport.send([event]);
      await this.stateTracker.updateState(extension, result, activity);

      Logger.info(
        `OCSFTracker: OCSF App Security Posture Finding sent for ${extension.displayName} (${OCSFActivityID[activity]})`,
      );
    } catch (error) {
      Logger.error(`OCSFTracker: Failed to send OCSF event for ${extension.displayName}`, error as Error);
    }
  }

  getStateTracker(): ExtensionStateTracker {
    return this.stateTracker;
  }
}
