/**
 * OCSF Tracker - Handles OCSF event creation and telemetry sending for extension changes
 * The tracker has two triggers:
 * 1. Extensions' changes (onDidChange event)
 * 2. Metadata analysis changes (updated rule set)
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { Extension, ExtensionsRepository } from '../../extensions';
import { HeuristicResult } from '../../heuristics';
import { ExtensionChangeListener } from '../extension-lifecycle-service';
import { ExtensionStateTracker, ExtensionChange, ExtensionActivityID } from '../extension-state-tracker';
import { buildAppSecurityPostureFinding } from './ocsf-builder';
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
            `\t\t${ExtensionActivityID[change.changeType]}: ${change.displayName}${change.oldVersion ? ` (${change.oldVersion} → ${change.newVersion})` : ` v${change.newVersion}`}`,
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
        if (change.changeType === ExtensionActivityID.CLOSE) {
          await this.handleClose(change);
        } else if (
          change.extension &&
          (change.changeType === ExtensionActivityID.CREATE || change.changeType === ExtensionActivityID.UPDATE)
        ) {
          // TODO: For CREATE and UPDATE, we need to re-analyze the extension first
          // then send the OCSF event and sync with sidebar display
        }
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
      Logger.info(`OCSFTracker: Extension ${change.displayName} uninstalled, sending CLOSE event`);

      // TODO: Build and send OCSF CLOSE event with proper resource data
      // For now, just mark as closed in state
      await this.stateTracker.markAsClosed(change.displayName);
    }
  }

  getStateTracker(): ExtensionStateTracker {
    return this.stateTracker;
  }

  /**
   * Build and return an OCSF event for an extension with appropriate activity
   */
  buildOCSFEvent(extension: Extension, result: HeuristicResult, activity: ExtensionActivityID) {
    return buildAppSecurityPostureFinding(result, extension, activity);
  }
}
