/**
 * Main VS Code extension entry point
 * Activates the IDE Shepherd security monitoring system
 */

import * as vscode from 'vscode';
import { Logger } from './lib/logger';
import { moduleLoaderPatcher } from './monitor/index';
import { NotificationService } from './lib/services/notification-service';
import { IDEStatusService } from './lib/services/ide-status-service';

export function activate(context: vscode.ExtensionContext) {
  try {
    Logger.init(context);
    Logger.info('IDE Shepherd Extension: Logger initialized');

    const platform = IDEStatusService.getPlatform();    Logger.info(`IDE Shepherd Extension: Platform detected: ${platform}`);
    Logger.info('IDE Shepherd Extension: Activating module loader patcher...');
    moduleLoaderPatcher.patch();
    Logger.info('IDE Shepherd Extension: Module loader patcher activated successfully');

    const statusCommand = vscode.commands.registerCommand('ide-shepherd.showStatus', () => {
      IDEStatusService.showStatus();
    });
    context.subscriptions.push(statusCommand);

  } catch (error) {
    Logger.error('IDE Shepherd Extension: Failed to activate', error as Error);
    throw error;
  }
}
