/**
 * Main VS Code extension entry point
 * Activates the IDE Shepherd security monitoring system
 */

import * as vscode from 'vscode';
import { Logger } from './lib/logger';
import { moduleLoaderPatcher } from './monitor/index';
import { IDEStatusService } from './lib/services/ide-status-service';
import { SidebarService } from './lib/services/sidebar-service';

export function activate(context: vscode.ExtensionContext) {
  try {
    Logger.init(context);
    Logger.info('IDE Shepherd Extension: Logger initialized');

    const sidebarService = SidebarService.getInstance();
    sidebarService.initialize(context);

    Logger.info('IDE Shepherd Extension: Activating module loader patcher...');
    moduleLoaderPatcher.patch();
    Logger.info('IDE Shepherd Extension: Module loader patcher activated successfully');

    const statusCommand = vscode.commands.registerCommand('ide-shepherd.showStatus', () => {
      IDEStatusService.showStatus();
    });

    const refreshStatusCommand = vscode.commands.registerCommand('ide-shepherd.refreshStatus', () => {
      IDEStatusService.showStatus();
      vscode.window.showInformationMessage('Security status refreshed');
    });

    const scanExtensionsCommand = vscode.commands.registerCommand('ide-shepherd.scanExtensions', () => {
      vscode.window.showInformationMessage('Extension security scan started...');
      // TODO: Integrate with actual extension scanning when available
    });

    context.subscriptions.push(statusCommand, refreshStatusCommand, scanExtensionsCommand);

    context.subscriptions.push(statusCommand, refreshStatusCommand, scanExtensionsCommand);

    setTimeout(() => {
      IDEStatusService.showStatus();
    }, 1000);

    // Register deactivation handler
    const disposable = vscode.Disposable.from({
      dispose: () => {
        Logger.info('IDE Shepherd Extension: Deactivating...');
        moduleLoaderPatcher.unpatch();
        Logger.info('IDE Shepherd Extension: Deactivated');
      },
    });

    context.subscriptions.push(disposable);

    Logger.info('IDE Shepherd Extension: Activation completed successfully');
  } catch (error) {
    Logger.error('IDE Shepherd Extension: Failed to activate', error as Error);
    throw error;
  }
}
