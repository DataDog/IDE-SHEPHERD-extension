/**
 * Centralizes extension lifecycle detection and coordination.
 * It listens to vscode.extensions.onDidChange and coordinates:
 * - ExtensionsRepository updates
 * - OCSF telemetry tracking
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { ExtensionsRepository } from '../extensions';

export interface ExtensionChangeListener {
  onExtensionChange(): Promise<void>;
}

/**
 * Central service that listens to VS Code extension changes and notifies all registered listeners
 */
export class ExtensionChangeService {
  private static _instance: ExtensionChangeService;
  private disposables: vscode.Disposable[] = [];
  private listeners: ExtensionChangeListener[] = [];
  private isProcessing = false;

  private constructor() {
    this.setupChangeListener();
  }

  static getInstance(): ExtensionChangeService {
    if (!ExtensionChangeService._instance) {
      ExtensionChangeService._instance = new ExtensionChangeService();
    }
    return ExtensionChangeService._instance;
  }

  private setupChangeListener(): void {
    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        Logger.debug(`ExtensionChangeService: vscode.extensions.onDidChange fired\n (${vscode.extensions.all} )`);
        this.handleExtensionChange();
      }),
    );
  }

  private async handleExtensionChange(): Promise<void> {
    if (this.isProcessing) {
      Logger.debug('ExtensionChangeService: Already processing a change, skipping');
      return;
    }

    this.isProcessing = true;
    Logger.info('ExtensionChangeService: Processing change...');

    try {
      // Update repository with current extension state
      // extensions.all is immediately updated when onDidChange fires
      ExtensionsRepository.getInstance().buildRepository();

      // Notify all registered listeners
      Logger.debug(`ExtensionChangeService: Notifying ${this.listeners.length} listener(s)`);
      for (const listener of this.listeners) {
        try {
          await listener.onExtensionChange();
        } catch (error) {
          Logger.error('ExtensionChangeService: Listener failed to process change', error as Error);
        }
      }
    } catch (error) {
      Logger.error('ExtensionChangeService: Failed to handle extension change', error as Error);
    } finally {
      this.isProcessing = false;
    }
  }

  registerListener(listener: ExtensionChangeListener): void {
    this.listeners.push(listener);
    Logger.debug(`ExtensionChangeService: Registered listener (total: ${this.listeners.length})`);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.listeners = [];
  }
}
