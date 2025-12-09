/**
 * Security Events View Provider - Displays recent security events
 */

import * as vscode from 'vscode';
import { SecurityEvent, SeverityLevel } from '../../events/sec-events';

type SidebarTreeItem = vscode.TreeItem;

/**
 * Tree data provider for security events view
 */
export class SecurityEventsViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;
  private _securityEvents: SecurityEvent[] = [];

  updateData(events: SecurityEvent[]): void {
    this._securityEvents = events || [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!element) {
      if (this._securityEvents.length === 0) {
        return Promise.resolve([
          new vscode.TreeItem('No recent security events', vscode.TreeItemCollapsibleState.None),
        ]);
      }

      const eventItems = this._securityEvents.slice(0, 10).map((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const sourceIdentifier = event.extension?.id || event.workspace?.path || 'unknown';

        const item = new vscode.TreeItem(
          `[${timestamp}] ${event.originalEvent.eventType} - ${sourceIdentifier}`,
          vscode.TreeItemCollapsibleState.Collapsed,
        );

        item.iconPath = this.getEventIcon(event);
        item.contextValue = `event-${index}`;

        return item;
      });

      return Promise.resolve(eventItems);
    } else {
      const eventIndex = this.getEventIndexFromContext(element.contextValue);
      if (eventIndex !== -1 && this._securityEvents[eventIndex]) {
        const event = this._securityEvents[eventIndex];
        const details: SidebarTreeItem[] = [];

        if (event.iocs && Array.isArray(event.iocs) && event.iocs.length > 0) {
          const primaryIoC = event.getPrimaryIoC ? event.getPrimaryIoC() : event.iocs[0];
          if (primaryIoC) {
            details.push(new vscode.TreeItem(`Rule: ${primaryIoC.rule}`, vscode.TreeItemCollapsibleState.None));
            details.push(new vscode.TreeItem(`Finding: ${primaryIoC.finding}`, vscode.TreeItemCollapsibleState.None));
            details.push(
              new vscode.TreeItem(`Description: ${primaryIoC.description}`, vscode.TreeItemCollapsibleState.None),
            );
          }
        }

        return Promise.resolve(details);
      }
    }

    return Promise.resolve([]);
  }

  private getEventIcon(event: SecurityEvent): vscode.ThemeIcon {
    if (event.severity) {
      switch (event.severity) {
        case SeverityLevel.HIGH:
          return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        case SeverityLevel.MEDIUM:
          return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
        case SeverityLevel.LOW:
          return new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground'));
        default:
          return new vscode.ThemeIcon('circle-outline');
      }
    }

    return new vscode.ThemeIcon('shield');
  }

  private getEventIndexFromContext(contextValue?: string): number {
    if (!contextValue || !contextValue.startsWith('event-')) {
      return -1;
    }
    const indexStr = contextValue.replace('event-', '');
    const index = parseInt(indexStr, 10);
    return isNaN(index) ? -1 : index;
  }
}
