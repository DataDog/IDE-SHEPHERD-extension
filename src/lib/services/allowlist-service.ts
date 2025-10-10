/**
 * Allow List Service - Manages extension allow lists for IDE Shepherd
 *
 * Two types of allow lists:
 * 1. Built-in/First-party extensions (automatically populated, read-only via API)
 * 2. User allow list including trusted publishers and extensions (manually managed by users)
 */

import * as vscode from 'vscode';
import { Logger } from '../logger';
import { ExtensionsRepository } from '../extensions';
import { CONFIG } from '../config';

interface AllowListState {
  userExtensions: string[]; // extension IDs manually allowed by user
  trustedPublishers: string[]; // all trusted publishers (initialized with defaults, can be modified by user)
}

export class AllowListService {
  private static _instance: AllowListService;
  private _context: vscode.ExtensionContext | null = null; // ensures persistence of allow list across sessions
  private _userAllowList: Set<string> = new Set();
  private _builtInAllowList: Set<string> = new Set();
  private _trustedPublisherAllowList: Set<string> = new Set(); // Extension IDs from trusted publishers
  private _trustedPublishers: Set<string> = new Set();

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
    // Initialize trusted publishers with defaults if not already loaded from state
    if (this._trustedPublishers.size === 0) {
      CONFIG.ALLOWLIST.DEFAULT_TRUSTED_PUBLISHERS.forEach((publisher) => {
        this._trustedPublishers.add(publisher);
      });
    }

    this.rebuildAllowLists();

    Logger.debug(
      `AllowListService: Built-in allow list contains ${this._builtInAllowList.size} extensions, ` +
        `Trusted publisher allow list contains ${this._trustedPublisherAllowList.size} extensions`,
    );
  }

  /**
   * Rebuild the allow lists based on current trusted publishers
   */
  private rebuildAllowLists(): void {
    this._builtInAllowList.clear();
    this._trustedPublisherAllowList.clear();

    const builtInExtensions = this._extensionsRepo.getBuiltInExtensions();
    builtInExtensions.forEach((ext) => {
      this._builtInAllowList.add(ext.id);
    });

    // Add extensions from all trusted publishers
    this._trustedPublishers.forEach((publisher) => {
      const publisherExtensions = this._extensionsRepo.getExtensionsByPublisher(publisher);
      publisherExtensions.forEach((ext) => {
        if (!this._builtInAllowList.has(ext.id)) {
          this._trustedPublisherAllowList.add(ext.id);
        }
      });
    });
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

  getTrustedPublishers(): string[] {
    return Array.from(this._trustedPublishers).sort();
  }

  async addTrustedPublisher(publisher: string): Promise<void> {
    if (this._trustedPublishers.has(publisher)) {
      Logger.debug(`AllowListService: Publisher ${publisher} is already trusted`);
      return;
    }

    this._trustedPublishers.add(publisher);
    await this.saveState();
    this.rebuildAllowLists();
    Logger.info(`AllowListService: Added ${publisher} to trusted publishers`);
  }

  async removeTrustedPublisher(publisher: string): Promise<void> {
    if (!this._trustedPublishers.has(publisher)) {
      Logger.debug(`AllowListService: Publisher ${publisher} is not in trusted list`);
      return;
    }

    this._trustedPublishers.delete(publisher);
    await this.saveState();
    this.rebuildAllowLists();
    Logger.info(`AllowListService: Removed ${publisher} from trusted publishers`);
  }

  isTrustedPublisher(publisher: string): boolean {
    return this._trustedPublishers.has(publisher);
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

      if (savedState?.trustedPublishers) {
        this._trustedPublishers = new Set(savedState.trustedPublishers);
        Logger.info(`AllowListService: Loaded ${this._trustedPublishers.size} trusted publishers`);
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
      const state: AllowListState = {
        userExtensions: Array.from(this._userAllowList),
        trustedPublishers: Array.from(this._trustedPublishers),
      };

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
