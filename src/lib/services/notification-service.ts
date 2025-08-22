/**
 * Simple notification service for showing VS Code warnings
 */

import * as vscode from 'vscode';
import { SecurityEvent } from '../events/sec-events';

export class NotificationService {

    static showSecurityEventNotification(securityEvent: SecurityEvent): void {
        const message = JSON.stringify(securityEvent.getSecurityEventData(), null, 2);
        vscode.window.showWarningMessage(message);
    }

    static showInfo(message: string): void {
        vscode.window.showInformationMessage(message);
    }

    static async showSecurityBlockingInfo(
        url: string, 
        securityEvent: SecurityEvent, 
        type: 'request' | 'response' = 'request'
    ): Promise<void> {
        const title = `!!! Security Policy: ${type === 'request' ? 'Request' : 'Response'} Blocked`;
        
        let content = `A ${type} has been blocked by IDE Shepherd's security policy.\n`;
        content += `URL: ${url}\n\n`;
        content += `Summary:\n${securityEvent.getSummary()}\n\n`;
        content += `Action: The ${type} was automatically blocked to protect your workspace.`;

        // Use the same pattern as IDE status show command
        await vscode.window.showInformationMessage(
            title,
            { modal: true, detail: content },
            'Close'
        );
    }
}