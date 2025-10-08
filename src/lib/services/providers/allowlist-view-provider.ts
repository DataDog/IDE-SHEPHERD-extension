/**
 * Allow List View Provider - Manages display and interaction with allow list
 */

import * as vscode from 'vscode';
import { AllowListService } from '../allowlist-service';
import { ExtensionsRepository } from '../../extensions';

type SidebarTreeItem = vscode.TreeItem;

/**
 * Tree data provider for allow list management view
 */
export class AllowListViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _allowListService: AllowListService;
  private _extensionsRepo: ExtensionsRepository;

  constructor() {
    this._allowListService = AllowListService.getInstance();
    this._extensionsRepo = ExtensionsRepository.getInstance();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async handleRemoveFromAllowList(extensionId: string): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        `Remove ${extensionId} from allow list? Future suspicious operations will be blocked.`,
        'Yes',
        'No',
      );

      if (result === 'Yes') {
        await this._allowListService.removeFromUserAllowList(extensionId);
        vscode.window.showInformationMessage(`${extensionId} removed from allow list`);
        this.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to remove extension from allow list: ${error}`);
    }
  }

  async handleAddToAllowList(): Promise<void> {
    try {
      const allUserExtensions = this._extensionsRepo.getUserExtensions();
      const availableExtensions = allUserExtensions.filter((ext) => !this._allowListService.isAllowed(ext.id));

      if (availableExtensions.length === 0) {
        vscode.window.showInformationMessage('All user extensions are already on the allow list');
        return;
      }

      const quickPickItems = availableExtensions.map((ext) => ({
        label: ext.id,
        description: ext.packageJSON?.description || '',
        detail: `Publisher: ${ext.packageJSON?.publisher || 'Unknown'} | Version: ${ext.packageJSON?.version || 'Unknown'}`,
        extensionId: ext.id,
      }));

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an extension to add to allow list',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        await this._allowListService.addToUserAllowList(selected.extensionId);
        vscode.window.showInformationMessage(`${selected.extensionId} added to allow list`);
        this.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add extension to allow list: ${error}`);
    }
  }

  async handleClearAllowList(): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        'Clear all user-defined allow list entries? This cannot be undone.',
        'Yes',
        'No',
      );

      if (result === 'Yes') {
        await this._allowListService.clearUserAllowList();
        vscode.window.showInformationMessage('User allow list cleared');
        this.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to clear allow list: ${error}`);
    }
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems());
    }

    const children = this.getChildrenForItem(element);
    return Promise.resolve(children);
  }

  private getRootItems(): SidebarTreeItem[] {
    const items: SidebarTreeItem[] = [];
    const stats = this._allowListService.getStatistics();

    // Built-in extensions section
    const builtInItem = new vscode.TreeItem(
      `Built-in Extensions (${stats.builtInCount})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    builtInItem.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('charts.green'));
    builtInItem.contextValue = 'builtin-allowlist';
    builtInItem.tooltip = 'VS Code built-in extensions that are automatically allowed';
    items.push(builtInItem);

    // Trusted publisher extensions section
    const trustedPublisherItem = new vscode.TreeItem(
      `Trusted Publishers (${stats.trustedPublisherCount})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    trustedPublisherItem.iconPath = new vscode.ThemeIcon('verified-filled', new vscode.ThemeColor('charts.green'));
    trustedPublisherItem.contextValue = 'trusted-publisher-allowlist';
    trustedPublisherItem.tooltip = 'Extensions from trusted publishers that are automatically allowed';
    items.push(trustedPublisherItem);

    // User allow list section
    const userItem = new vscode.TreeItem(
      `User Allow List (${stats.userCount})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    userItem.iconPath = new vscode.ThemeIcon('person', new vscode.ThemeColor('charts.blue'));
    userItem.contextValue = 'user-allowlist';
    userItem.tooltip = 'User-installed extensions that have been manually allowed';
    items.push(userItem);

    return items;
  }

  private getChildrenForItem(element: SidebarTreeItem): SidebarTreeItem[] {
    const children: SidebarTreeItem[] = [];

    switch (element.contextValue) {
      case 'builtin-allowlist':
        const builtInExtensions = this._allowListService.getBuiltInAllowList();
        if (builtInExtensions.length === 0) {
          children.push(new vscode.TreeItem('No built-in extensions', vscode.TreeItemCollapsibleState.None));
        } else {
          builtInExtensions.slice(0, 50).forEach((extId) => {
            const item = new vscode.TreeItem(extId, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('symbol-module');
            item.contextValue = 'builtin-extension';
            item.tooltip = `Built-in extension: ${extId}`;
            children.push(item);
          });
          if (builtInExtensions.length > 50) {
            const moreItem = new vscode.TreeItem(
              `... and ${builtInExtensions.length - 50} more`,
              vscode.TreeItemCollapsibleState.None,
            );
            children.push(moreItem);
          }
        }
        break;

      case 'trusted-publisher-allowlist':
        const trustedPublisherExtensions = this._allowListService.getTrustedPublisherAllowList();
        if (trustedPublisherExtensions.length === 0) {
          children.push(new vscode.TreeItem('No trusted publisher extensions', vscode.TreeItemCollapsibleState.None));
        } else {
          trustedPublisherExtensions.slice(0, 50).forEach((extId) => {
            const item = new vscode.TreeItem(extId, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('verified');
            item.contextValue = 'trusted-publisher-extension';
            item.tooltip = `Trusted publisher extension: ${extId}`;
            children.push(item);
          });
          if (trustedPublisherExtensions.length > 50) {
            const moreItem = new vscode.TreeItem(
              `... and ${trustedPublisherExtensions.length - 50} more`,
              vscode.TreeItemCollapsibleState.None,
            );
            children.push(moreItem);
          }
        }
        break;

      case 'user-allowlist':
        const userExtensions = this._allowListService.getUserAllowList();
        if (userExtensions.length === 0) {
          children.push(new vscode.TreeItem('No allowed extensions', vscode.TreeItemCollapsibleState.None));
        } else {
          userExtensions.forEach((extId) => {
            const item = new vscode.TreeItem(extId, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('extensions');
            item.contextValue = 'user-allowed-extension';
            item.tooltip = `Click to remove from allow list`;

            item.command = {
              command: 'ide-shepherd.removeFromAllowList',
              title: 'Remove from Allow List',
              arguments: [extId],
            };

            children.push(item);
          });
        }
        break;
    }

    return children;
  }
}
