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
      IDEStatusService._outputChannel = vscode.window.createOutputChannel(CONFIG.EXTENSION.OUTPUT_CHANNEL_NAME, {
        log: true,
      });
      context.subscriptions.push(IDEStatusService._outputChannel);
    }
    return IDEStatusService._outputChannel;
  }

  private static validateOutputChannel(): boolean {
    return IDEStatusService._outputChannel !== null && IDEStatusService._outputChannel !== undefined;
  }

  static log(level: string, message: string): void {
    if (this.validateOutputChannel()) {
      IDEStatusService._outputChannel!.appendLine(`[${level}] ${message}`);
    }
  }

  static info(message: string) {
    this.log(loggerLevels.INFO, message);
  }

  static warn(message: string) {
    this.log(loggerLevels.WARN, message);
  }

  static error(message: string, error?: Error) {
    this.log(loggerLevels.ERROR, message);
    if (error && this.validateOutputChannel()) {
      IDEStatusService._outputChannel!.appendLine(`[${loggerLevels.ERROR}] ${error.stack || error.message}`);
    }
  }

  static debug(message: string) {
    this.log(loggerLevels.DEBUG, message);
  }

  // For network request/response body
  static truncate(text: String, maxLength = CONFIG.LOGGER.MAX_TRUNCATE_LENGTH): string {
    if (!text) {
      return '';
    }
    const str = text.toString();
    return str.length > maxLength ? `${str.substring(0, maxLength)}...(truncated)` : str;
  }
}
