/**
 * Extension State Tracker - Monitors extension lifecycle and sends OCSF events
 * We ignore disabled/enabled states as they don't require firing new events
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { Extension } from '../extensions';
import { HeuristicResult, RiskLevel } from '../heuristics';

export enum ExtensionActivityID {
  CREATE = 1,
  UPDATE = 2,
  CLOSE = 3,
}

interface ExtensionState {
  displayName: string; // extension.id is versioned hence we use the display names
  version: string;
  riskLevel: RiskLevel;
  riskScore: number;
  patternsCount: number;
  lastAnalyzed: number; // unix timestamp
  extension: Extension; // store the full extension for CLOSE event reconstruction
  heuristicResult: HeuristicResult;
}

export interface ExtensionChange {
  displayName: string;
  changeType: ExtensionActivityID;
  oldVersion?: string;
  newVersion?: string;
  extension?: Extension;
  heuristicResult?: HeuristicResult;
}

/**
 * Tracks extension states and determines when to send CREATE/UPDATE/CLOSE OCSF events
 */
export class ExtensionStateTracker {
  private static readonly STORAGE_KEY = 'ide-shepherd.extensionStates';
  private states: Map<string, ExtensionState>;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.states = new Map();
    this.loadStates();
  }

  public loadStates(): void {
    try {
      const stored = this.context.globalState.get<Record<string, ExtensionState>>(
        ExtensionStateTracker.STORAGE_KEY,
        {},
      );
      this.states = new Map(Object.entries(stored));
      Logger.debug(`ExtensionStateTracker: Loaded ${this.states.size} extension states`);
    } catch (error) {
      Logger.error('ExtensionStateTracker: Failed to load states', error as Error);
    }
  }

  private async saveStates(): Promise<void> {
    try {
      const statesObj = Object.fromEntries(this.states);

      await this.context.globalState.update(ExtensionStateTracker.STORAGE_KEY, statesObj);
    } catch (error) {
      Logger.error('ExtensionStateTracker: Failed to save states', error as Error);
    }
  }

  async updateState(extension: Extension, result: HeuristicResult, activity: ExtensionActivityID): Promise<void> {
    const state: ExtensionState = {
      displayName: extension.displayName,
      version: extension.packageJSON?.version || 'unknown',
      riskLevel: result.overallRisk,
      riskScore: result.riskScore,
      patternsCount: result.suspiciousPatterns.length,
      lastAnalyzed: Date.now(),
      extension,
      heuristicResult: result,
    };

    this.states.set(extension.displayName, state);
    await this.saveStates();

    Logger.debug(
      `ExtensionStateTracker: Updated state for ${extension.displayName} v${state.version} (activity: ${ExtensionActivityID[activity]})`,
    );
  }

  async markAsClosed(displayName: string): Promise<void> {
    this.states.delete(displayName);
    await this.saveStates();
    Logger.debug(`ExtensionStateTracker: Marked ${displayName} as closed`);
  }

  /**
   * Detect all changes (CREATE/UPDATE/CLOSE) by comparing current vs tracked state
   */
  detectChanges(currentExtensions: Extension[]): ExtensionChange[] {
    const changes: ExtensionChange[] = [];
    const currentDisplayNames = new Set<string>();

    for (const ext of currentExtensions) {
      currentDisplayNames.add(ext.displayName);
    }

    // Check for CREATE and UPDATE
    for (const ext of currentExtensions) {
      const previousState = this.states.get(ext.displayName);
      const currentVersion = ext.packageJSON?.version || 'unknown';

      if (!previousState) {
        // NEW extension
        changes.push({
          displayName: ext.displayName,
          changeType: ExtensionActivityID.CREATE,
          newVersion: currentVersion,
          extension: ext,
        });
      } else if (previousState.version !== currentVersion) {
        // VERSION CHANGE
        changes.push({
          displayName: ext.displayName,
          changeType: ExtensionActivityID.UPDATE,
          oldVersion: previousState.version,
          newVersion: currentVersion,
          extension: ext,
        });
      }
    }

    // Check for CLOSE (uninstalled)
    for (const [displayName, state] of this.states.entries()) {
      if (!currentDisplayNames.has(displayName)) {
        changes.push({
          displayName,
          changeType: ExtensionActivityID.CLOSE,
          oldVersion: state.version,
          extension: state.extension,
          heuristicResult: state.heuristicResult,
        });
      }
    }

    return changes;
  }

  getState(displayName: string): ExtensionState | undefined {
    return this.states.get(displayName);
  }

  async clearStates(): Promise<void> {
    this.states.clear();
    await this.saveStates();
    Logger.info('ExtensionStateTracker: All states cleared');
  }
}
