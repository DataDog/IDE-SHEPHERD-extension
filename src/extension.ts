/**
 * Main VS Code extension entry point
 * Activates the IDE Shepherd security monitoring system
 */

import * as vscode from 'vscode';
import { Logger } from './lib/logger';
import { moduleLoaderPatcher } from './monitor/index';
import { IDEStatusService } from './lib/services/ide-status-service';
import { SidebarService } from './lib/services/sidebar-service';
import { AllowListService } from './lib/services/allowlist-service';
import { DatadogTelemetryService } from './lib/services/datadog-telemetry-service';

export function activate(context: vscode.ExtensionContext) {
  try {
    Logger.init(context);
    Logger.info('IDE Shepherd Extension: Logger initialized');

    // Initialize Allow List Service
    const allowListService = AllowListService.getInstance();
    allowListService.initialize(context).then(() => {
      Logger.info('IDE Shepherd Extension: Allow List Service initialized');
    });

    // Initialize Datadog Telemetry Service
    const datadogService = DatadogTelemetryService.getInstance();
    datadogService.initialize(context).then(() => {
      Logger.info('IDE Shepherd Extension: Datadog Telemetry Service initialized');
    });

    const sidebarService = SidebarService.getInstance();
    sidebarService.initialize();

    Logger.info('IDE Shepherd Extension: Activating module loader patcher...');
    moduleLoaderPatcher.patch();
    Logger.info('IDE Shepherd Extension: Module loader patcher activated successfully');

    const statusCommand = vscode.commands.registerCommand('ide-shepherd.showStatus', () => {
      IDEStatusService.showStatus();
    });

    const refreshStatusCommand = vscode.commands.registerCommand('ide-shepherd.refreshStatus', () => {
      IDEStatusService.showStatus();
    });

    const scanExtensionsCommand = vscode.commands.registerCommand('ide-shepherd.scanExtensions', () => {
      sidebarService.triggerExtensionAnalysis();
    });

    const removeFromAllowListCommand = vscode.commands.registerCommand(
      'ide-shepherd.removeFromAllowList',
      (extensionId: string) => sidebarService.removeFromAllowList(extensionId),
    );

    const addToAllowListCommand = vscode.commands.registerCommand('ide-shepherd.addToAllowList', () =>
      sidebarService.addToAllowList(),
    );

    const clearAllowListCommand = vscode.commands.registerCommand('ide-shepherd.clearAllowList', () =>
      sidebarService.clearAllowList(),
    );

    const addTrustedPublisherCommand = vscode.commands.registerCommand('ide-shepherd.addTrustedPublisher', () =>
      sidebarService.addTrustedPublisher(),
    );

    const removeTrustedPublisherCommand = vscode.commands.registerCommand(
      'ide-shepherd.removeTrustedPublisher',
      (publisher: string) => sidebarService.removeTrustedPublisher(publisher),
    );

    // Datadog commands
    const testDatadogConnectionCommand = vscode.commands.registerCommand(
      'ide-shepherd.datadog.testConnection',
      async () => {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Testing Datadog Agent connection...',
            cancellable: false,
          },
          async () => {
            return await datadogService.testConnection();
          },
        );

        if (result.success) {
          vscode.window.showInformationMessage(result.message);
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );

    const sendDatadogTelemetryCommand = vscode.commands.registerCommand(
      'ide-shepherd.datadog.sendTelemetry',
      async () => {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Sending telemetry data to Datadog...',
            cancellable: false,
          },
          async () => {
            return await datadogService.sendAllTelemetryData();
          },
        );

        if (result.success) {
          vscode.window.showInformationMessage(result.message);
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      },
    );

    context.subscriptions.push(
      statusCommand,
      refreshStatusCommand,
      scanExtensionsCommand,
      removeFromAllowListCommand,
      addToAllowListCommand,
      clearAllowListCommand,
      addTrustedPublisherCommand,
      removeTrustedPublisherCommand,
      testDatadogConnectionCommand,
      sendDatadogTelemetryCommand,
    );

    setTimeout(() => {
      IDEStatusService.showStatus();
    }, 1000);

    IDEStatusService.startAutoRefresh();

    Logger.info('IDE Shepherd Extension: Activation completed successfully');
  } catch (error) {
    Logger.error('IDE Shepherd Extension: Failed to activate', error as Error);
    throw error;
  }
}
