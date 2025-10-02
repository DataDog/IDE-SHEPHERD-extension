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
  id: string;
  isActive: boolean;
  isBuiltIn: boolean;
  extensionPath: string;
  packageJSON?: ExtensionPackageJSON;
}

export class ExtensionsRepository {
  private static _instance: ExtensionsRepository;
  private _extensions: Map<string, Extension> = new Map();
  private _disposables: vscode.Disposable[] = [];

  private constructor() {
    this.setupExtensionListeners(); // update extensions repository upon installation/update/disabling/enabling of extensions
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
  private buildRepository(): void {
    try {
      Logger.debug('ExtensionsRepository: Building extensions repository...');

      const vsCodeExtensions = vscode.extensions.all;
      Logger.debug(`ExtensionsRepository: Found ${vsCodeExtensions.length} total extensions`);

      this._extensions.clear();

      for (const ext of vsCodeExtensions) {
        const extensionInfo: Extension = {
          id: ext.id,
          isActive: ext.isActive,
          isBuiltIn: this.isBuiltInExtension(ext),
          extensionPath: ext.extensionPath,
          packageJSON: ext.packageJSON,
        };

        this._extensions.set(ext.id, extensionInfo);
      }

      Logger.debug(`ExtensionsRepository: Successfully loaded ${this._extensions.size} extensions`);
    } catch (error) {
      Logger.error('ExtensionsRepository: Failed to build repository', error as Error);
    }
  }

  /**
   * Setup event listeners for extension changes
   */
  private setupExtensionListeners(): void {
    this._disposables.push(
      vscode.extensions.onDidChange(() => {
        Logger.debug('ExtensionsRepository: Extension change detected, rebuilding repository...');
        this.buildRepository();
      }),
    );
  }

  dispose(): void {
    this._disposables.forEach((disposable) => disposable.dispose());
    this._disposables = [];
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
    return Array.from(this._extensions.values()).filter((ext) => !ext.isBuiltIn && !ext.id.includes('ide-shepherd')); // TODO: evolve this into an allow list
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

  isExtensionActive(extensionId: string): boolean {
    const extension = this.getExtensionById(extensionId);
    return extension?.isActive ?? false;
  }

  rebuild(): void {
    Logger.info('ExtensionsRepository: Manually rebuilding repository...');
    this.buildRepository();
  }
}
