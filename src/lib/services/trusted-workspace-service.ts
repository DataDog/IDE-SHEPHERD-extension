/**
 * Trusted Workspace Service - Manages allowlist of trusted workspaces for task execution
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';

interface TrustedWorkspaceState {
  trustedWorkspaces: string[];
}

export class TrustedWorkspaceService {
  private static instance: TrustedWorkspaceService;
  private context!: vscode.ExtensionContext;
  private readonly STORAGE_KEY = 'trustedWorkspaces';

  private constructor() {}

  public static getInstance(): TrustedWorkspaceService {
    if (!TrustedWorkspaceService.instance) {
      TrustedWorkspaceService.instance = new TrustedWorkspaceService();
    }
    return TrustedWorkspaceService.instance;
  }

  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    Logger.info('TrustedWorkspaceService initialized');
  }

  /**
   * Get all trusted workspaces
   */
  public getTrustedWorkspaces(): string[] {
    const state = this.context.globalState.get<TrustedWorkspaceState>(this.STORAGE_KEY);
    return state?.trustedWorkspaces || [];
  }

  /**
   * Check if a workspace is trusted
   */
  public isTrusted(workspacePath: string): boolean {
    const trustedWorkspaces = this.getTrustedWorkspaces();
    return trustedWorkspaces.includes(workspacePath);
  }

  /**
   * Add a workspace to the trusted list
   */
  public async addToTrustedWorkspaces(workspacePath: string): Promise<void> {
    try {
      const trustedWorkspaces = this.getTrustedWorkspaces();

      if (trustedWorkspaces.includes(workspacePath)) {
        Logger.info(`Workspace already trusted: ${workspacePath}`);
        return;
      }

      trustedWorkspaces.push(workspacePath);
      await this.context.globalState.update(this.STORAGE_KEY, { trustedWorkspaces });

      Logger.info(`Added workspace to trusted list: ${workspacePath}`);
    } catch (error) {
      Logger.error('Failed to add workspace to trusted list', error as Error);
      throw error;
    }
  }

  /**
   * Remove a workspace from the trusted list
   */
  public async removeFromTrustedWorkspaces(workspacePath: string): Promise<void> {
    try {
      const trustedWorkspaces = this.getTrustedWorkspaces();
      const filtered = trustedWorkspaces.filter((path) => path !== workspacePath);

      await this.context.globalState.update(this.STORAGE_KEY, { trustedWorkspaces: filtered });

      Logger.info(`Removed workspace from trusted list: ${workspacePath}`);
    } catch (error) {
      Logger.error('Failed to remove workspace from trusted list', error as Error);
      throw error;
    }
  }

  /**
   * Clear all trusted workspaces
   */
  public async clearTrustedWorkspaces(): Promise<void> {
    try {
      await this.context.globalState.update(this.STORAGE_KEY, { trustedWorkspaces: [] });
      Logger.info('Cleared all trusted workspaces');
    } catch (error) {
      Logger.error('Failed to clear trusted workspaces', error as Error);
      throw error;
    }
  }

  /**
   * Get the number of trusted workspaces
   */
  public getTrustedWorkspaceCount(): number {
    return this.getTrustedWorkspaces().length;
  }
}
