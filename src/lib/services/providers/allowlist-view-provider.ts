/**
 * Allow List View Provider - Manages display and interaction with allow list
 */

import * as vscode from 'vscode';
import { AllowListService } from '../allowlist-service';
import { TrustedWorkspaceService } from '../trusted-workspace-service';
import { ExtensionsRepository } from '../../extensions';
import { Logger } from '../../logger';

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
  private _trustedWorkspaceService: TrustedWorkspaceService;
  private _extensionsRepo: ExtensionsRepository;

  constructor() {
    this._allowListService = AllowListService.getInstance();
    this._trustedWorkspaceService = TrustedWorkspaceService.getInstance();
    this._extensionsRepo = ExtensionsRepository.getInstance();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async handleRemoveFromAllowList(extensionId: string): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        `Remove ${extensionId} from allow list? Future suspicious operations by this extension will be blocked.`,
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
        label: ext.displayName,
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
        vscode.window.showInformationMessage(`${selected.label} added to allow list`);
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

  async handleAddTrustedPublisher(): Promise<void> {
    try {
      const allExtensions = this._extensionsRepo.getAllExtensions();
      const publishers = new Set<string>();

      allExtensions.forEach((ext) => {
        const publisher = ext.packageJSON?.publisher;
        if (publisher && !this._allowListService.isTrustedPublisher(publisher)) {
          publishers.add(publisher);
        }
      });

      if (publishers.size === 0) {
        vscode.window.showInformationMessage('All publishers are already trusted');
        return;
      }

      const publisherList = Array.from(publishers).sort();
      const quickPickItems = publisherList.map((publisher) => {
        const extensionCount = this._extensionsRepo.getExtensionsByPublisher(publisher).length;
        return {
          label: publisher,
          description: `${extensionCount} extension${extensionCount !== 1 ? 's' : ''}`,
          publisher,
        };
      });

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a publisher to trust',
        matchOnDescription: true,
      });

      if (selected) {
        await this._allowListService.addTrustedPublisher(selected.publisher);
        vscode.window.showInformationMessage(`Publisher "${selected.publisher}" added to trusted list`);
        this.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add trusted publisher: ${error}`);
    }
  }

  async handleRemoveTrustedPublisher(publisher: string): Promise<void> {
    try {
      const result = await vscode.window.showWarningMessage(
        `Remove "${publisher}" from trusted publishers? Extensions from this publisher will no longer be automatically trusted.`,
        'Yes',
        'No',
      );

      if (result === 'Yes') {
        await this._allowListService.removeTrustedPublisher(publisher);
        vscode.window.showInformationMessage(`Publisher "${publisher}" removed from trusted list`);
        this.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to remove trusted publisher: ${error}`);
    }
  }

  async handleRemoveTrustedWorkspace(workspacePath: string): Promise<void> {
    try {
      const pathSegments = workspacePath.split('/');
      const workspaceName = pathSegments[pathSegments.length - 1] || workspacePath;

      const result = await vscode.window.showWarningMessage(
        `Remove "${workspaceName}" from trusted workspaces? Tasks from this workspace will be subject to security checks.`,
        'Yes',
        'No',
      );

      if (result === 'Yes') {
        await this._trustedWorkspaceService.removeFromTrustedWorkspaces(workspacePath);
        vscode.window.showInformationMessage(`Workspace "${workspaceName}" removed from trusted list`);
        this.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to remove trusted workspace: ${error}`);
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

    // Trusted workspaces section
    const trustedWorkspaces = this._trustedWorkspaceService.getTrustedWorkspaces();
    const trustedWorkspacesItem = new vscode.TreeItem(
      `Trusted Workspaces (${trustedWorkspaces.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    trustedWorkspacesItem.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.purple'));
    trustedWorkspacesItem.contextValue = 'trusted-workspaces-list';
    trustedWorkspacesItem.tooltip = 'Workspaces that are trusted by IDE Shepherd to run tasks automatically';
    items.push(trustedWorkspacesItem);

    // Trusted publishers section
    const trustedPublishers = this._allowListService.getTrustedPublishers();

    const publishersWithExtensions = trustedPublishers.filter(
      (publisher) => this._extensionsRepo.getExtensionsByPublisher(publisher).length > 0,
    );

    const trustedPublishersItem = new vscode.TreeItem(
      `Trusted Publishers (${publishersWithExtensions.length})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    trustedPublishersItem.iconPath = new vscode.ThemeIcon('organization', new vscode.ThemeColor('charts.green'));
    trustedPublishersItem.contextValue = 'trusted-publishers-list';
    trustedPublishersItem.tooltip = 'Publishers whose extensions are automatically trusted';
    items.push(trustedPublishersItem);

    // User allow list section
    const userItem = new vscode.TreeItem(
      `User Allow List (${stats.userCount})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    userItem.iconPath = new vscode.ThemeIcon('person', new vscode.ThemeColor('charts.blue'));
    userItem.contextValue = 'user-allowlist';
    userItem.tooltip = 'User-installed extensions that have been manually allowed';
    items.push(userItem);

    // Built-in extensions section
    const builtInItem = new vscode.TreeItem(
      `Built-in Extensions (${stats.builtInCount})`,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    builtInItem.iconPath = new vscode.ThemeIcon('shield', new vscode.ThemeColor('charts.green'));
    builtInItem.contextValue = 'builtin-allowlist';
    builtInItem.tooltip = 'VS Code built-in extensions that are automatically allowed';
    items.push(builtInItem);

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
            const extension = this._extensionsRepo.getExtensionById(extId);
            const displayLabel = extension?.displayName || extId;
            const item = new vscode.TreeItem(displayLabel, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('symbol-module');
            item.contextValue = 'builtin-extension';
            item.tooltip = `Built-in extension: ${displayLabel}`;
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

      case 'trusted-publishers-list':
        const trustedPublishers = this._allowListService.getTrustedPublishers();

        trustedPublishers.forEach((name) => {
          const extensionCount = this._extensionsRepo.getExtensionsByPublisher(name).length;
          if (extensionCount === 0) {
            return;
          }

          const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.Collapsed);
          item.iconPath = new vscode.ThemeIcon('organization');
          item.contextValue = 'trusted-publisher';
          item.description = `${extensionCount} extension${extensionCount !== 1 ? 's' : ''}`;
          item.tooltip = `Trusted publisher\nClick to remove`;
          item.command = {
            command: 'ide-shepherd.removeTrustedPublisher',
            title: 'Remove Trusted Publisher',
            arguments: [name],
          };
          children.push(item);
        });

        if (children.length === 0) {
          children.push(
            new vscode.TreeItem(
              'No trusted publishers with installed extensions',
              vscode.TreeItemCollapsibleState.None,
            ),
          );
        }
        break;

      case 'trusted-publisher':
        // Show extensions from this publisher
        const publisherName = element.label as string;
        const publisherExtensions = this._extensionsRepo.getExtensionsByPublisher(publisherName);

        if (publisherExtensions.length === 0) {
          children.push(new vscode.TreeItem('No extensions installed', vscode.TreeItemCollapsibleState.None));
        } else {
          publisherExtensions.forEach((ext) => {
            const item = new vscode.TreeItem(ext.displayName, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('extensions');
            item.contextValue = 'publisher-extension';
            item.description = `v${ext.packageJSON?.version || 'unknown'}`;
            item.tooltip = `${ext.displayName}\nVersion: ${ext.packageJSON?.version || 'unknown'}`;
            children.push(item);
          });
        }
        break;

      case 'user-allowlist':
        const userExtensions = this._allowListService.getUserAllowList();
        if (userExtensions.length === 0) {
          children.push(new vscode.TreeItem('No allowed extensions', vscode.TreeItemCollapsibleState.None));
        } else {
          userExtensions.forEach((extId) => {
            // Look up the extension to get its display name
            const extension = this._extensionsRepo.getExtensionById(extId);
            const displayLabel = extension?.displayName || extId;

            const item = new vscode.TreeItem(displayLabel, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('extensions');
            item.contextValue = 'user-allowed-extension';
            item.description = `v${extension?.packageJSON?.version || 'unknown'}`;
            item.tooltip = extension
              ? `${displayLabel}\nClick to remove from allow list`
              : `${extId}\nClick to remove from allow list`;

            item.command = {
              command: 'ide-shepherd.removeFromAllowList',
              title: 'Remove from Allow List',
              arguments: [extId],
            };

            children.push(item);
          });
        }
        break;

      case 'trusted-workspaces-list':
        const trustedWorkspaces = this._trustedWorkspaceService.getTrustedWorkspaces();
        if (trustedWorkspaces.length === 0) {
          children.push(new vscode.TreeItem('No trusted workspaces', vscode.TreeItemCollapsibleState.None));
        } else {
          trustedWorkspaces.forEach((workspacePath) => {
            // Extract workspace name from path
            const pathSegments = workspacePath.split('/');
            const workspaceName = pathSegments[pathSegments.length - 1] || workspacePath;

            const item = new vscode.TreeItem(workspaceName, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('folder-opened');
            item.contextValue = 'trusted-workspace';
            item.description = 'Trusted';
            item.tooltip = `${workspacePath}\nClick to remove from trusted list`;

            item.command = {
              command: 'ide-shepherd.removeTrustedWorkspace',
              title: 'Remove from Trusted Workspaces',
              arguments: [workspacePath],
            };

            children.push(item);
          });
        }
        break;
    }

    return children;
  }
}
