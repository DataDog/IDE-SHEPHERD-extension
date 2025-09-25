/**
 * Simple notification service for showing VS Code warnings
 */

import * as vscode from 'vscode';
import { SecurityEvent } from '../events/sec-events';

type BlockedOperationType = 'request' | 'response' | 'exec' | 'spawn' | 'execSync';

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
    type: BlockedOperationType = 'request',
  ): Promise<void> {
    const getOperationTitle = (operationType: BlockedOperationType): string => {
      switch (operationType) {
        case 'request':
          return 'Request';
        case 'response':
          return 'Response';
        case 'exec':
          return 'Process Execution';
        case 'spawn':
          return 'Process Spawn';
        case 'execSync':
          return 'Synchronous Process Execution';
        default:
          return 'Operation';
      }
    };

    const title = `!!! Security Policy: ${getOperationTitle(type)} Blocked`;

    let content = `A ${type} operation has been blocked by IDE Shepherd's security policy.\n`;

    if (['request', 'response'].includes(type)) {
      content += `URL: ${target}\n\n`;
    } else {
      content += `Command: ${target}\n\n`;
    }

    content += `Summary:\n${securityEvent.getSummary()}\n\n`;
    content += `Action: The ${type} was automatically blocked to protect your workspace.`;

    // Create custom modal-like webview
    await this.showCustomModal(title, content);
  }

  private static async showCustomModal(title: string, content: string): Promise<void> {
    return new Promise((resolve) => {
      const panel = vscode.window.createWebviewPanel('securityAlert', title, vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });

      // HTML content for the modal-like display
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
                        .button-container {
                            display: flex;
                            justify-content: center;
                        }
                        .ok-button {
                            background: var(--vscode-button-background);
                            color: var(--vscode-button-foreground);
                            border: none;
                            padding: 8px 16px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                            min-width: 80px;
                        }
                        .ok-button:hover {
                            background: var(--vscode-button-hoverBackground);
                        }
                        .ok-button:focus {
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
                        </div>
                    </div>
                    <script>
                        function dismissModal() {
                            vscode.postMessage({ command: 'dismiss' });
                        }
                        
                        // Handle Escape key
                        document.addEventListener('keydown', function(event) {
                            if (event.key === 'Escape') {
                                dismissModal();
                            }
                        });
                        
                        // Focus the button for keyboard navigation
                        document.querySelector('.ok-button').focus();
                        
                        const vscode = acquireVsCodeApi();
                    </script>
                </body>
                </html>
            `;

      // Handle messages from webview
      panel.webview.onDidReceiveMessage((message) => {
        if (message.command === 'dismiss') {
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
