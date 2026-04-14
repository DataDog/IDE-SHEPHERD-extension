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
import { TrustedWorkspaceService } from './lib/services/trusted-workspace-service';
import { DatadogTelemetryService } from './lib/services/datadog/datadog-service';
import { ExtensionChangeService } from './lib/services/extension-lifecycle-service';
import { TaskScanner } from './monitor/analysis/task-analyzer';

export function activate(context: vscode.ExtensionContext) {
  try {
    Logger.init(context);
    Logger.info('IDE Shepherd Extension: Logger initialized');

    // Initialize Allow List Service
    const allowListService = AllowListService.getInstance();
    allowListService.initialize(context).then(() => {
      Logger.info('IDE Shepherd Extension: Allow List Service initialized');
    });

    // Initialize Trusted Workspace Service
    const trustedWorkspaceService = TrustedWorkspaceService.getInstance();
    trustedWorkspaceService.initialize(context).then(() => {
      Logger.info('IDE Shepherd Extension: Trusted Workspace Service initialized');
    });

    // Initialize Datadog Telemetry Service
    const datadogService = DatadogTelemetryService.getInstance();
    datadogService.initialize(context).then(() => {
      Logger.info('IDE Shepherd Extension: Datadog Telemetry Service initialized');
      const extensionChangeService = ExtensionChangeService.getInstance();
      const ocsfTracker = datadogService.getOCSFTracker();

      if (ocsfTracker) {
        extensionChangeService.registerListener(ocsfTracker);
      } else {
        Logger.error('OCSF tracker is undefined! Cannot register.');
      }
    });

    const sidebarService = SidebarService.getInstance();
    sidebarService.initialize();

    // Patch the module loader
    Logger.info('IDE Shepherd Extension: Activating module loader patcher...');
    moduleLoaderPatcher.patch();
    Logger.info('IDE Shepherd Extension: Module loader patcher activated successfully');

    // Activate the Task Scanner with Termination
    Logger.info('IDE Shepherd Extension: Activating Task Scanner ...');
    const taskScanner = new TaskScanner();
    taskScanner.activate(context);
    Logger.info('IDE Shepherd Extension: Task Scanner activated successfully');

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

    const removeTrustedWorkspaceCommand = vscode.commands.registerCommand(
      'ide-shepherd.removeTrustedWorkspace',
      (workspacePath: string) => sidebarService.removeTrustedWorkspace(workspacePath),
    );

    // Settings commands
    const refreshSettingsCommand = vscode.commands.registerCommand('ide-shepherd.settings.refresh', () =>
      sidebarService.refreshSettingsView(),
    );

    const toggleDatadogTelemetryCommand = vscode.commands.registerCommand(
      'ide-shepherd.settings.toggleDatadogTelemetry',
      () => sidebarService.toggleDatadogTelemetry(),
    );

    const clearTaskTimelineCommand = vscode.commands.registerCommand('ide-shepherd.clearTaskTimeline', () => {
      sidebarService.clearTaskTimeline();
      vscode.window.showInformationMessage('Task timeline cleared');
    });

    context.subscriptions.push(
      statusCommand,
      refreshStatusCommand,
      scanExtensionsCommand,
      removeFromAllowListCommand,
      addToAllowListCommand,
      clearAllowListCommand,
      addTrustedPublisherCommand,
      removeTrustedPublisherCommand,
      removeTrustedWorkspaceCommand,
      refreshSettingsCommand,
      toggleDatadogTelemetryCommand,
      clearTaskTimelineCommand,
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

export function deactivate() {
  IDEStatusService.stopAutoRefresh();
  DatadogTelemetryService.getInstance().dispose();
}
