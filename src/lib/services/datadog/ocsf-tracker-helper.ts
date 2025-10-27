/**
 * Extension State Tracker - Monitors extension lifecycle and sends OCSF events
 * We ignore disabled/enabled states as they don't require firing new events
 */

import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { Extension } from '../../extensions';
import { HeuristicResult, RiskLevel } from '../../heuristics';
import { buildAppSecurityPostureFinding } from './ocsf-builder';
import { OCSFActivityID } from './ocsf-types';

interface ExtensionState {
  displayName: string; // extension.id is versioned hence we use the display names
  version: string;
  riskLevel: RiskLevel;
  riskScore: number;
  patternsCount: number;
  lastAnalyzed: number; // unix timestamp
}

export interface ExtensionChange {
  displayName: string;
  changeType: OCSFActivityID;
  oldVersion?: string;
  newVersion?: string;
  extension?: Extension;
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
      Logger.info(`📖 ExtensionStateTracker.loadStates(): Starting load...`);
      Logger.info(`   Storage type: globalState`);
      Logger.info(`   Storage key: "${ExtensionStateTracker.STORAGE_KEY}"`);

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

  /**
   * Determine the OCSF activity for an extension based on state changes
   */
  determineActivity(extension: Extension, result: HeuristicResult): OCSFActivityID {
    const previousState = this.states.get(extension.displayName);

    if (!previousState) {
      return OCSFActivityID.CREATE;
    }
    // We track updates based on versions and risk assessment
    const currentVersion = extension.packageJSON?.version || 'unknown';
    if (previousState.version !== currentVersion) {
      return OCSFActivityID.UPDATE;
    }
    if (
      // For now, we'll ignore changes in the patterns themselves
      previousState.riskLevel !== result.overallRisk ||
      previousState.patternsCount !== result.suspiciousPatterns.length
    ) {
      return OCSFActivityID.UPDATE;
    }

    return OCSFActivityID.CREATE;
  }

  async updateState(extension: Extension, result: HeuristicResult, activity: OCSFActivityID): Promise<void> {
    const state: ExtensionState = {
      displayName: extension.displayName,
      version: extension.packageJSON?.version || 'unknown',
      riskLevel: result.overallRisk,
      riskScore: result.riskScore,
      patternsCount: result.suspiciousPatterns.length,
      lastAnalyzed: Date.now(),
    };

    this.states.set(extension.displayName, state);
    await this.saveStates();

    Logger.debug(
      `ExtensionStateTracker: Updated state for ${extension.displayName} v${state.version} (activity: ${OCSFActivityID[activity]})`,
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
          changeType: OCSFActivityID.CREATE,
          newVersion: currentVersion,
          extension: ext,
        });
      } else if (previousState.version !== currentVersion) {
        // VERSION CHANGE
        changes.push({
          displayName: ext.displayName,
          changeType: OCSFActivityID.UPDATE,
          oldVersion: previousState.version,
          newVersion: currentVersion,
          extension: ext,
        });
      }
    }

    // Check for CLOSE (uninstalled)
    for (const [displayName, state] of this.states.entries()) {
      if (!currentDisplayNames.has(displayName)) {
        changes.push({ displayName, changeType: OCSFActivityID.CLOSE, oldVersion: state.version });
      }
    }

    return changes;
  }

  getState(displayName: string): ExtensionState | undefined {
    return this.states.get(displayName);
  }

  /**
   * Build and return an OCSF event for an extension with appropriate activity
   */
  buildOCSFEvent(extension: Extension, result: HeuristicResult) {
    const activity = this.determineActivity(extension, result);
    return { event: buildAppSecurityPostureFinding(result, extension, activity), activity };
  }

  async clearStates(): Promise<void> {
    this.states.clear();
    await this.saveStates();
    Logger.info('ExtensionStateTracker: All states cleared');
  }

  // TODO: handle metadata analysis changes
}
