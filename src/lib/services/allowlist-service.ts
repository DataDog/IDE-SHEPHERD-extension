/**
 * Allow List Service - Manages extension allow lists for IDE Shepherd
 *
 * Two types of allow lists:
 * 1. Built-in/First-party extensions (automatically populated, read-only via API)
 * 2. User-installed extensions (manually managed by users when a false positive is suspected)
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { ExtensionsRepository } from '../extensions';
import { CONFIG } from '../config';

interface AllowListState {
  userExtensions: string[]; // extension IDs manually allowed by user
}

export class AllowListService {
  private static _instance: AllowListService;
  private _context: vscode.ExtensionContext | null = null; // ensures persistence of allow list across sessions
  private _userAllowList: Set<string> = new Set();
  private _builtInAllowList: Set<string> = new Set();
  private _trustedPublisherAllowList: Set<string> = new Set();
  private _extensionsRepo: ExtensionsRepository;

  private static readonly STORAGE_KEY = 'ide-shepherd.allowlist';

  private constructor() {
    this._extensionsRepo = ExtensionsRepository.getInstance();
    this.initializeBuiltInAllowList();
  }

  static getInstance(): AllowListService {
    if (!AllowListService._instance) {
      AllowListService._instance = new AllowListService();
    }
    return AllowListService._instance;
  }

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this._context = context;
    await this.loadState();
    Logger.info('AllowListService: Initialized');
  }

  /**
   * Initialize built-in allow list with first-party extensions
   */
  private initializeBuiltInAllowList(): void {
    this._builtInAllowList.clear();
    this._trustedPublisherAllowList.clear();

    const builtInExtensions = this._extensionsRepo.getBuiltInExtensions();
    builtInExtensions.forEach((ext) => {
      this._builtInAllowList.add(ext.id);
    });

    CONFIG.ALLOWLIST.DEFAULT_TRUSTED_PUBLISHERS.forEach((publisher) => {
      const publisherExtensions = this._extensionsRepo.getExtensionsByPublisher(publisher);
      publisherExtensions.forEach((ext) => {
        if (!this._builtInAllowList.has(ext.id)) {
          this._trustedPublisherAllowList.add(ext.id);
        }
      });
    });

    Logger.debug(
      `AllowListService: Built-in allow list contains ${this._builtInAllowList.size} extensions, ` +
        `Trusted publisher allow list contains ${this._trustedPublisherAllowList.size} extensions`,
    );
  }

  isAllowed(extensionId: string): boolean {
    return (
      this._builtInAllowList.has(extensionId) ||
      this._trustedPublisherAllowList.has(extensionId) ||
      this._userAllowList.has(extensionId)
    );
  }

  async addToUserAllowList(extensionId: string): Promise<void> {
    if (this.isAllowed(extensionId)) {
      Logger.debug(`AllowListService: Extension ${extensionId} is already allowed`);
      return;
    }

    this._userAllowList.add(extensionId);
    await this.saveState();
    Logger.info(`AllowListService: Added ${extensionId} to user allow list`);
  }

  async removeFromUserAllowList(extensionId: string): Promise<void> {
    if (!this._userAllowList.has(extensionId)) {
      Logger.debug(`AllowListService: Extension ${extensionId} not in user allow list`);
      return;
    }

    this._userAllowList.delete(extensionId);
    await this.saveState();
    Logger.info(`AllowListService: Removed ${extensionId} from user allow list`);
  }

  getUserAllowList(): string[] {
    return Array.from(this._userAllowList);
  }

  getBuiltInAllowList(): string[] {
    return Array.from(this._builtInAllowList);
  }

  getTrustedPublisherAllowList(): string[] {
    return Array.from(this._trustedPublisherAllowList);
  }

  getStatistics(): { builtInCount: number; trustedPublisherCount: number; userCount: number; totalCount: number } {
    return {
      builtInCount: this._builtInAllowList.size,
      trustedPublisherCount: this._trustedPublisherAllowList.size,
      userCount: this._userAllowList.size,
      totalCount: this._builtInAllowList.size + this._trustedPublisherAllowList.size + this._userAllowList.size,
    };
  }

  /**
   * Rebuild the built-in allow list (useful when extensions are installed/uninstalled)
   */
  rebuildBuiltInAllowList(): void {
    Logger.info('AllowListService: Rebuilding built-in allow list...');
    this.initializeBuiltInAllowList();
  }

  /**
   * Load saved state from VS Code storage
   */
  private async loadState(): Promise<void> {
    if (!this._context) {
      Logger.warn('AllowListService: Cannot load state - context not initialized');
      return;
    }

    try {
      const savedState = this._context.globalState.get<AllowListState>(AllowListService.STORAGE_KEY);

      if (savedState?.userExtensions) {
        this._userAllowList = new Set(savedState.userExtensions);
        Logger.info(`AllowListService: Loaded ${this._userAllowList.size} user-allowed extensions`);
      } else {
        Logger.info('AllowListService: No saved state found, starting fresh');
      }
    } catch (error) {
      Logger.error('AllowListService: Failed to load state', error as Error);
    }
  }

  private async saveState(): Promise<void> {
    if (!this._context) {
      Logger.warn('AllowListService: Cannot save state - context not initialized');
      return;
    }

    try {
      const state: AllowListState = { userExtensions: Array.from(this._userAllowList) };

      await this._context.globalState.update(AllowListService.STORAGE_KEY, state);
      Logger.debug('AllowListService: State saved successfully');
    } catch (error) {
      Logger.error('AllowListService: Failed to save state', error as Error);
    }
  }

  /**
   * Clear all user allow list entries (for testing or reset purposes)
   */
  async clearUserAllowList(): Promise<void> {
    this._userAllowList.clear();
    await this.saveState();
    Logger.info('AllowListService: User allow list cleared');
  }
}
