/**
 * Main VS Code extension entry point
 * Activates the IDE Shepherd security monitoring system
 */

import * as vscode from 'vscode';
import { Logger } from './lib/logger';
import { moduleLoaderPatcher } from './monitor/index';
import { NotificationService } from './lib/services/notification-service';
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

    const exportReportCommand = vscode.commands.registerCommand('ide-shepherd.exportReport', () => {
      vscode.window.showInformationMessage('Security report export started...');
      // TODO: Implement report export functionality
    });

    context.subscriptions.push(statusCommand, refreshStatusCommand, scanExtensionsCommand, exportReportCommand);

    // Add a test command to populate sample security events
    const testEventsCommand = vscode.commands.registerCommand('ide-shepherd.testEvents', () => {
      const testData = {
        isMonitoringActive: true,
        uptime: '2h 15m 30s',
        lastUpdate: '30s ago',
        extensionsMonitored: {
          total: 3,
          extensions: [{ id: 'test-extension-1' }, { id: 'test-extension-2' }, { id: 'ms-python.python' }],
        },
        securityEvents: {
          total: 5,
          network: 3,
          filesystem: 1,
          workspace: 1,
          recentEvents: [
            {
              timestamp: Date.now() - 300000, // 5 minutes ago
              type: 'Suspicious Network Request',
              severity: 'high',
              description: 'Attempted connection to suspicious domain',
              target: 'network',
              extensionInfo: { id: 'suspicious-extension' },
              data: 'https://malicious-domain.com/api/data',
            },
            {
              timestamp: Date.now() - 600000, // 10 minutes ago
              type: 'Process Execution Blocked',
              severity: 'critical',
              description: 'Blocked execution of potentially dangerous command',
              target: 'process',
              extensionInfo: { id: 'risky-tool' },
              data: 'powershell.exe -ExecutionPolicy Bypass -Command "..."',
            },
            {
              timestamp: Date.now() - 900000, // 15 minutes ago
              type: 'File System Access',
              severity: 'medium',
              description: 'Extension accessed sensitive file',
              target: 'filesystem',
              extensionInfo: { id: 'file-manager' },
              data: '/home/user/.ssh/id_rsa',
            },
            {
              timestamp: Date.now() - 1200000, // 20 minutes ago
              type: 'HTTP Request Intercepted',
              severity: 'low',
              description: 'Extension made HTTP request',
              target: 'network',
              extensionInfo: { id: 'http-client' },
              data: 'GET https://api.github.com/user',
            },
          ],
        },
        performance: {
          avgProcessingTime: '2.45 ms',
          eventsProcessed: 156,
          totalProcessingTime: 382,
          memoryUsage: '12.4 MB',
        },
      };

      sidebarService.updateStatusView(testData);
      vscode.window.showInformationMessage('Test security events loaded into sidebar!');
    });

    context.subscriptions.push(
      statusCommand,
      refreshStatusCommand,
      scanExtensionsCommand,
      exportReportCommand,
      testEventsCommand,
    );

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

export function deactivate() {
  Logger.info('IDE Shepherd Extension: Deactivation called');
  moduleLoaderPatcher.unpatch();
}
