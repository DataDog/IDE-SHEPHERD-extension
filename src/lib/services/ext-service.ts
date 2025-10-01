/**
 * Extension Service :  responsible for managing extensions, resolving their ids,
 * their file paths, etc.
 */

import { Logger } from '../logger';
import { IDEStatusService } from './ide-status-service';
import { PlatformType } from '../ide-status';

export class ExtensionServices {
  // getCallContext will yield a different result from getExtensionFromParentModule
  // iff there is ANOTHER extension patching Node's require the same way we do.
  // we use the getExtensionFromParentModule, but it is helpful to look at the stack trace to understand the call context.
  static getCallContext() {
    try {
      const stack = new Error().stack;
      if (!stack) {
        return { extension: 'unknown-stack' };
      }
      const lines = stack.split('\n');
      let extension = null;

      for (const line of lines) {
        if (this._shouldSkipStackLine(line)) {
          continue;
        }

        // Look for extension
        if (!extension) {
          const platform = IDEStatusService.getPlatform();
          const extensionPatterns = this.getExtensionPatternsForPlatform(platform);

          for (const pattern of extensionPatterns) {
            const match = line.match(pattern);
            if (match) {
              extension = match[1];
              break;
            }
          }
        }

        if (extension) {
          break;
        }
      }

      return {
        extension: extension || 'caller? who-nose', // since we're using vscode specific static paths, expect this error there
      };
    } catch (error) {
      Logger.error('Failed to get call context', error as Error);
      return { extension: 'stack-error', library: null };
    }
  }

  static _shouldSkipStackLine(line: string) {
    const skipPatterns = ['ide-shepherd', 'node:internal', 'Module._load', 'at Object.Module.', 'at Module.require'];
    return skipPatterns.some((pattern) => line.includes(pattern));
  }

  private static getExtensionPatternsForPlatform(platform: PlatformType): RegExp[] {
    const isWindows = platform === PlatformType.WINDOWS;

    if (isWindows) {
      return [
        new RegExp(`(?:\\.vscode|\\.vscode-insiders)\\extensions\\([^\\]+)`),
        // built-in extensions in Windows can use either / or \, why ? cuz chaos >:3
        new RegExp(`.*[/\\]app[/\\]extensions[/\\]([^/\\]+)`),
      ];
    } else {
      return [new RegExp(`(?:/.vscode(?:-insiders)?)/extensions/([^/]+)`), new RegExp(`.*/app/extensions/([^/]+)`)];
    }
  }

  /**
   * Enhanced path extraction with better patterns, aims to support multiple IDEs
   */
  static _extractExtensionFromPath(filePath: string) {
    if (!filePath) {
      return 'unknown';
    }

    try {
      // Enhanced patterns for different VS Code installation types
      const patterns = [
        // User extensions
        /(?:\.vscode|\.vscode-insiders)[/\\]extensions[/\\]([^/\\]+)/,
        // Built-in extensions
        /\/app[/\\]extensions[/\\]([^/\\]+)/,
        // Windows built-in
        /\\app\\extensions\\([^\\]+)/,
        // Portable installations
        /vscode-portable[/\\]data[/\\]extensions[/\\]([^/\\]+)/,
      ];

      for (const pattern of patterns) {
        const match = filePath.match(pattern);
        if (match) {
          return match[1];
        }
      }

      return 'core-or-unknown';
    } catch (error) {
      Logger.error(`Failed to extract extension from path: ${error}`);
      return 'extraction-error';
    }
  }
}
