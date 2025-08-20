/**
 * Logger module : provides a centralized logging mechanism for extension and security events
 */

import * as vscode from 'vscode';
import { CONFIG } from './config';
import { IDEStatusService } from './services/ide-status-service';

const loggerLevels = CONFIG.LOGGER.LEVELS;

export class Logger {
	static init(context: vscode.ExtensionContext) {
		if (!IDEStatusService._outputChannel) {
			IDEStatusService._outputChannel = vscode.window.createOutputChannel(
				CONFIG.EXTENSION.OUTPUT_CHANNEL_NAME, 
				{ log: true }
			);
			context.subscriptions.push(IDEStatusService._outputChannel);
		}
		return IDEStatusService._outputChannel;
	}


	static info(message: string) {
		if (IDEStatusService._outputChannel) {
			IDEStatusService._outputChannel.appendLine(`[${loggerLevels.INFO}] ${message}`);
		}
	}

	static warn(message: string) {
		if (IDEStatusService._outputChannel) {
			IDEStatusService._outputChannel.appendLine(`[${loggerLevels.WARN}] ${message}`);
		}
	}

	static error(message: string, error?: Error) {
		if (IDEStatusService._outputChannel) {
			IDEStatusService._outputChannel.appendLine(`[${loggerLevels.ERROR}] ${message}`);
			if (error) {
				IDEStatusService._outputChannel.appendLine(`[${loggerLevels.ERROR}] ${error.stack || error.message}`);
			}
		}
	}

	static debug(message: string) {
		if (IDEStatusService._outputChannel) {
			IDEStatusService._outputChannel.appendLine(`[${loggerLevels.DEBUG}] ${message}`);
		}
	}

	// For network request/response body
	static truncate(text: any, maxLength = CONFIG.LOGGER.MAX_TRUNCATE_LENGTH): string {
		if (!text) return '';
		const str = text.toString();
		return str.length > maxLength 
			? `${str.substring(0, maxLength)}...(truncated)`
			: str;
	}
}