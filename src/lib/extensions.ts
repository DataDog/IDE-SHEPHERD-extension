/**
 * Extensions Repository - manages VS Code extensions using the VS Code API
 */

import * as vscode from 'vscode';
import { Logger } from './logger';

export interface ExtensionPackageJSON {
  name?: string;
  description?: string;
  publisher?: string;
  version?: string;
  category?: string;
  repository?: string | { url?: string };
  homepage?: string;
  activationEvents?: string[];
  contributes?: { commands?: { command: string; title?: string; when?: string }[] };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
export interface Extension {
  id: string; // Versioned ID: "publisher.name-1.0.0"
  displayName: string; // Non-versioned: "publisher.name"
  isActive: boolean;
  isBuiltIn: boolean;
  extensionPath: string;
  packageJSON?: ExtensionPackageJSON;
  extensionKind?: vscode.ExtensionKind; // Where the extension runs
}

export class ExtensionsRepository {
  private static _instance: ExtensionsRepository;
  private _extensions: Map<string, Extension> = new Map();

  private constructor() {
    // Note: Extension change listening is now handled by ExtensionChangeService
    this.buildRepository();
  }

  static getInstance(): ExtensionsRepository {
    if (!ExtensionsRepository._instance) {
      ExtensionsRepository._instance = new ExtensionsRepository();
    }
    return ExtensionsRepository._instance;
  }

  /**
   * Build the extensions repository by querying the VS Code API
   */
  buildRepository(): void {
    try {
      Logger.debug('ExtensionsRepository: Building extensions repository...');

      const vsCodeExtensions = vscode.extensions.all;

      this._extensions.clear();

      for (const ext of vsCodeExtensions) {
        const version = ext.packageJSON?.version || '0.0.0';
        const versionedId = `${ext.id}-${version}`;

        const extensionInfo: Extension = {
          id: versionedId, // Store versioned ID
          displayName: ext.id, // Store original ID for display
          isActive: ext.isActive,
          isBuiltIn: this.isBuiltInExtension(ext),
          extensionPath: ext.extensionPath,
          packageJSON: ext.packageJSON,
          extensionKind: ext.extensionKind,
        };

        this._extensions.set(versionedId, extensionInfo);
      }
    } catch (error) {
      Logger.error('ExtensionsRepository: Failed to build repository', error as Error);
    }
  }

  getAllExtensions(): Extension[] {
    return Array.from(this._extensions.values());
  }

  getExtensionById(id: string): Extension | undefined {
    return this._extensions.get(id);
  }

  getActiveExtensions(): Extension[] {
    return Array.from(this._extensions.values()).filter((ext) => ext.isActive);
  }

  getBuiltInExtensions(): Extension[] {
    return Array.from(this._extensions.values()).filter((ext) => ext.isBuiltIn);
  }

  getUserExtensions(): Extension[] {
    return Array.from(this._extensions.values()).filter(
      (ext) => !ext.isBuiltIn && !ext.id.includes('ide-shepherd-extension'),
    );
  }

  getExtensionsByPublisher(publisher: string): Extension[] {
    return Array.from(this._extensions.values()).filter(
      (ext) => ext.packageJSON?.publisher?.toLowerCase() === publisher.toLowerCase(),
    );
  }

  getStatistics(): { total: number; active: number; builtIn: number; userInstalled: number } {
    const extensions = Array.from(this._extensions.values());

    return {
      total: extensions.length,
      active: extensions.filter((ext) => ext.isActive).length,
      builtIn: extensions.filter((ext) => ext.isBuiltIn).length,
      userInstalled: extensions.filter((ext) => !ext.isBuiltIn).length,
    };
  }

  /**
   * Determine if an extension is built-in based on its file path
   */
  private isBuiltInExtension(extension: vscode.Extension<any>): boolean {
    const path = extension.extensionPath.toLowerCase();

    // These patterns match both VS Code and Cursor native extensions:
    // VS Code: /Applications/Visual Studio Code.app/Contents/Resources/app/extensions/
    // Cursor: /Applications/Cursor.app/Contents/Resources/app/extensions/
    const builtInPatterns = ['/resources/app/extensions/', '\\resources\\app\\extensions\\'];

    return builtInPatterns.some((pattern) => path.includes(pattern.toLowerCase()));
  }

  getExtensionFromPath(filePath: string): Extension | undefined {
    for (const extension of this._extensions.values()) {
      if (filePath.startsWith(extension.extensionPath)) {
        return extension;
      }
    }
    return undefined;
  }

  /**
   * Get extension by display name (non-versioned ID)
   */
  getExtensionByDisplayName(displayName: string): Extension | undefined {
    for (const extension of this._extensions.values()) {
      if (extension.displayName === displayName) {
        return extension;
      }
    }
    return undefined;
  }

  isExtensionActive(extensionId: string): boolean {
    const extension = this.getExtensionById(extensionId);
    return extension?.isActive ?? false;
  }
}
