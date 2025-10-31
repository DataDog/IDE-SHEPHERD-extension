/**
 * Extension Change Processor Service handles extension change processing separate from telemetry sending:
 * 1. Runs metadata heuristics analysis
 * 2. Updates extension state tracker
 * 3. Refreshes sidebar display
 */

import { Logger } from '../logger';
import { HeuristicResult } from '../heuristics';
import { MetadataAnalyzer } from '../../scanner/metadata-analyzer';
import { ExtensionStateTracker, ExtensionChange, ExtensionActivityID } from './extension-state-tracker';
import { SidebarService } from './sidebar-service';

export interface ProcessedChange {
  change: ExtensionChange;
  result?: HeuristicResult; // undefined for CLOSE events
  activity: ExtensionActivityID;
}

/**
 * Processes extension changes by running metadata analysis and updating UI
 */
export class ExtensionChangeProcessorService {
  private static _instance: ExtensionChangeProcessorService;

  static getInstance(): ExtensionChangeProcessorService {
    if (!ExtensionChangeProcessorService._instance) {
      ExtensionChangeProcessorService._instance = new ExtensionChangeProcessorService();
    }
    return ExtensionChangeProcessorService._instance;
  }

  /**
   * Process a single extension change:
   * - For CREATE/UPDATE: Run metadata analysis, update state tracker
   * - For CLOSE: Mark as closed in state tracker
   * - Refresh sidebar after processing
   */
  async processChange(change: ExtensionChange, stateTracker: ExtensionStateTracker): Promise<ProcessedChange | null> {
    try {
      if (change.changeType === ExtensionActivityID.CLOSE) {
        return await this.processCloseChange(change, stateTracker);
      } else if (change.extension) {
        return await this.processCreateOrUpdateChange(change, stateTracker);
      }

      Logger.warn(
        `ExtensionChangeProcessorService: Skipping change for ${change.displayName} - no extension data available`,
      );
      return null;
    } catch (error) {
      Logger.error(
        `ExtensionChangeProcessorService: Failed to process change for ${change.displayName}`,
        error as Error,
      );
      return null;
    }
  }

  async processChanges(changes: ExtensionChange[], stateTracker: ExtensionStateTracker): Promise<ProcessedChange[]> {
    const processedChanges: ProcessedChange[] = [];

    for (const change of changes) {
      const processed = await this.processChange(change, stateTracker);
      if (processed) {
        processedChanges.push(processed);
      }
    }

    // Refresh sidebar after all changes are processed
    if (processedChanges.length > 0) {
      this.refreshSidebar();
    }

    return processedChanges;
  }

  private async processCreateOrUpdateChange(
    change: ExtensionChange,
    stateTracker: ExtensionStateTracker,
  ): Promise<ProcessedChange | null> {
    const extension = change.extension!;

    if (!extension.packageJSON) {
      Logger.warn(`ExtensionChangeProcessorService: Cannot analyze ${change.displayName} - no package.json available`);
      return null;
    }

    const result = MetadataAnalyzer.analyzeExtension(extension.id, extension.packageJSON);
    await stateTracker.updateState(extension, result, change.changeType);

    Logger.info(
      `ExtensionChangeProcessorService: ${change.displayName} analyzed - Risk: ${result.overallRisk} (${result.riskScore}), Patterns: ${result.suspiciousPatterns.length}`,
    );

    return { change, result, activity: change.changeType };
  }

  private async processCloseChange(
    // uninstalls
    change: ExtensionChange,
    stateTracker: ExtensionStateTracker,
  ): Promise<ProcessedChange | null> {
    const state = stateTracker.getState(change.displayName);

    if (!state) {
      Logger.debug(
        `ExtensionChangeProcessorService: No previous state found for ${change.displayName}, skipping CLOSE event`,
      );
      return null;
    }

    Logger.info(`ExtensionChangeProcessorService: Processing CLOSE for ${change.displayName}`);

    await stateTracker.markAsClosed(change.displayName);

    return { change, result: undefined, activity: ExtensionActivityID.CLOSE };
  }

  private refreshSidebar(): void {
    try {
      const sidebarService = SidebarService.getInstance();
      sidebarService.triggerExtensionAnalysis();
      Logger.debug('ExtensionChangeProcessorService: Sidebar refreshed');
    } catch (error) {
      Logger.error('ExtensionChangeProcessorService: Failed to refresh sidebar', error as Error);
    }
  }
}
