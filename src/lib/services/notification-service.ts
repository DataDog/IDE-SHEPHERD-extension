/**
 * Simple notification service for showing VS Code warnings
 */

import * as vscode from 'vscode';
import { SecurityEvent } from '../events/sec-events';
import { AllowListService } from './allowlist-service';
import { SidebarService } from './sidebar-service';
import { Logger } from '../logger';

export enum BlockedOperationType {
  REQUEST = 'request',
  RESPONSE = 'response',
  EXEC = 'exec',
  SPAWN = 'spawn',
  EXEC_SYNC = 'execSync',
}

export class NotificationService {
  static showSecurityEventNotification(securityEvent: SecurityEvent): void {
    const message = JSON.stringify(securityEvent.getSecurityEventData(), null, 2);
    vscode.window.showWarningMessage(message);
  }

  static showInfo(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  static async showSecurityBlockingInfo(
    target: string,
    securityEvent: SecurityEvent,
    type: BlockedOperationType = BlockedOperationType.REQUEST,
  ): Promise<void> {
    const getOperationTitle = (operationType: BlockedOperationType): string => {
      switch (operationType) {
        case BlockedOperationType.REQUEST:
          return 'Request';
        case BlockedOperationType.RESPONSE:
          return 'Response';
        case BlockedOperationType.EXEC:
          return 'Process Execution';
        case BlockedOperationType.SPAWN:
          return 'Process Spawn';
        case BlockedOperationType.EXEC_SYNC:
          return 'Synchronous Process Execution';
        default:
          return 'Operation';
      }
    };

    const title = `!!! Security Policy: ${getOperationTitle(type)} Blocked`;

    let content = `A(n) <bold>${type}</bold> operation has been <bold>BLOCKED</bold> by IDE Shepherd's security policy.<br><br>`;
    content += `<strong>EXTENSION:</strong> <bold>${securityEvent.extension.id}</bold><br>`;

    if ([BlockedOperationType.REQUEST, BlockedOperationType.RESPONSE].includes(type)) {
      content += `<strong>URL:</strong> ${target}<br><br>`;
    } else {
      content += `<strong>COMMAND:</strong><br><code>${target}</code><br><br>`;
    }

    content += `<strong>SUMMARY:</strong><br>${securityEvent.getSummary().replace(/\n/g, '<br>')}<br><br>`;
    content += `<strong>ACTION:</strong> The ${getOperationTitle(type).toLowerCase()} was automatically blocked to protect your workspace.`;

    await this.showCustomModal(title, content, securityEvent.extension.id);
  }

  private static async showCustomModal(title: string, content: string, extensionId?: string): Promise<void> {
    return new Promise((resolve) => {
      const panel = vscode.window.createWebviewPanel('customModal', title, vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });

      // HTML content for the modal display
      panel.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${title}</title>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            font-size: var(--vscode-font-size);
                            color: var(--vscode-foreground);
                            background: var(--vscode-editor-background);
                            margin: 0;
                            padding: 20px;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                        }
                        .modal-container {
                            background: var(--vscode-notifications-background);
                            border: 2px solid var(--vscode-notifications-border);
                            border-radius: 8px;
                            padding: 24px;
                            max-width: 500px;
                            width: 100%;
                            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        }
                        .title {
                            font-size: 16px;
                            font-weight: bold;
                            color: var(--vscode-notificationsWarningIcon-foreground);
                            margin-bottom: 16px;
                            text-align: center;
                        }
                        .content {
                            white-space: pre-line;
                            line-height: 1.5;
                            margin-bottom: 20px;
                            color: var(--vscode-notifications-foreground);
                        }
                        code {
                            background: var(--vscode-textCodeBlock-background);
                            color: var(--vscode-textPreformat-foreground);
                            padding: 2px 6px;
                            border-radius: 3px;
                            font-family: var(--vscode-editor-font-family);
                            font-size: 0.9em;
                        }
                        strong {
                            color: var(--vscode-textLink-foreground);
                            font-weight: bold;
                        }
                        em {
                            color: var(--vscode-descriptionForeground);
                            font-style: italic;
                        }
                        .button-container {
                            display: flex;
                            gap: 12px;
                            justify-content: center;
                        }
                        .ok-button, .ignore-button {
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            min-width: 80px;
                        }
                        .ok-button {
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                        }
                        .ok-button:hover {
                            background: var(--vscode-button-hoverBackground);
                        }
                        .ignore-button {
                            background: var(--vscode-button-secondaryBackground);
                            color: var(--vscode-button-secondaryForeground);
                        }
                        .ignore-button:hover {
                            background: var(--vscode-button-secondaryHoverBackground);
                        }
                        .ok-button:focus, .ignore-button:focus {
                            outline: 2px solid var(--vscode-focusBorder);
                        }
                    </style>
                </head>
                <body>
                    <div class="modal-container">
                        <div class="title">${title}</div>
                        <div class="content">${content.replace(/\n/g, '<br>')}</div>
                        <div class="button-container">
                            <button class="ok-button" onclick="dismissModal()">Acknowledge</button>
                            ${extensionId ? '<button class="ignore-button" onclick="ignoreExtension()">Ignore & Allow</button>' : ''}
                        </div>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        
                        function dismissModal() {
                            vscode.postMessage({ command: 'dismiss' });
                        }
                        
                        function ignoreExtension() {
                            vscode.postMessage({ command: 'ignore' });
                        }
                        
                        // Handle Escape key
                        document.addEventListener('keydown', function(event) {
                            if (event.key === 'Escape') {
                                dismissModal();
                            }
                        });
                        
                        // Focus the button for keyboard navigation
                        document.querySelector('.ok-button').focus();
                    </script>
                </body>
                </html>
            `;

      // Handle messages from webview
      panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'dismiss') {
          panel.dispose();
          resolve();
        } else if (message.command === 'ignore' && extensionId) {
          try {
            const allowListService = AllowListService.getInstance();
            await allowListService.addToUserAllowList(extensionId);
            Logger.info(`NotificationService: Added ${extensionId} to allow list`);

            const sidebarService = SidebarService.getInstance();
            sidebarService.refreshAllowListView();

            vscode.window.showInformationMessage(
              `Extension ${extensionId} has been added to the allow list. Future operations will be allowed.`,
            );
          } catch (error) {
            Logger.error(`NotificationService: Failed to add extension to allow list`, error as Error);
            vscode.window.showErrorMessage(`Failed to add extension to allow list: ${error}`);
          }
          panel.dispose();
          resolve();
        }
      });

      // Handle panel disposal
      panel.onDidDispose(() => {
        resolve();
      });
    });
  }
}
