/**
 * Task Timeline View Provider - Displays task execution timeline
 */

import * as vscode from 'vscode';

export enum TaskTimelineEventStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  TERMINATED = 'terminated',
  FAILED = 'failed',
}

export interface TaskTimelineEvent {
  id: string;
  timestamp: Date;
  taskName: string;
  taskType: string;
  source: string;
  command?: string;
  cwd?: string;
  scope?: string;
  status: TaskTimelineEventStatus;
  isSuspicious: boolean;
  suspiciousPattern?: string;
  processId?: number;
  exitCode?: number;
}

type SidebarTreeItem = vscode.TreeItem;

/**
 * Tree data provider for task timeline view
 */
export class TaskTimelineViewProvider implements vscode.TreeDataProvider<SidebarTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SidebarTreeItem | undefined | null | void> =
    new vscode.EventEmitter<SidebarTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SidebarTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private _taskEvents: TaskTimelineEvent[] = [];
  private readonly MAX_EVENTS = 10;

  /**
   * Add a task event to the timeline
   */
  addTaskEvent(event: TaskTimelineEvent): void {
    this._taskEvents.unshift(event);

    if (this._taskEvents.length > this.MAX_EVENTS) {
      this._taskEvents = this._taskEvents.slice(0, this.MAX_EVENTS);
    }

    this._onDidChangeTreeData.fire();
  }

  updateTaskEvent(id: string, updates: Partial<TaskTimelineEvent>): void {
    const event = this._taskEvents.find((e) => e.id === id);
    if (event) {
      Object.assign(event, updates);
      this._onDidChangeTreeData.fire();
    }
  }

  clearTimeline(): void {
    this._taskEvents = [];
    this._onDidChangeTreeData.fire();
  }

  getEvents(): TaskTimelineEvent[] {
    return [...this._taskEvents];
  }

  getSuspiciousEvents(): TaskTimelineEvent[] {
    return this._taskEvents.filter((e) => e.isSuspicious);
  }

  getTreeItem(element: SidebarTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeItem): Thenable<SidebarTreeItem[]> {
    if (!element) {
      // Root level - show only suspicious/terminated tasks
      const suspiciousTasks = this._taskEvents.filter(
        (e) => e.isSuspicious || e.status === TaskTimelineEventStatus.TERMINATED,
      );

      if (suspiciousTasks.length === 0) {
        return Promise.resolve([
          new vscode.TreeItem('No suspicious tasks detected', vscode.TreeItemCollapsibleState.None),
        ]);
      }

      const eventItems = suspiciousTasks.map((event, index) => {
        const timestamp = event.timestamp.toLocaleTimeString();

        const label = `${timestamp} - ${event.taskName}`;

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);

        item.iconPath = this.getEventIcon(event);
        item.contextValue = `task-event-${index}`;
        item.tooltip = this.getEventTooltip(event);

        // Color coding for suspicious tasks
        if (event.isSuspicious) {
          item.description = 'SUSPICIOUS';
        }

        return item;
      });

      return Promise.resolve(eventItems);
    } else {
      // Child level - show event details
      const eventIndex = this.getEventIndexFromContext(element.contextValue);
      if (eventIndex !== -1 && this._taskEvents[eventIndex]) {
        const event = this._taskEvents[eventIndex];
        const details: SidebarTreeItem[] = [];

        details.push(this.createDetailItem('Status', this.getStatusText(event)));
        details.push(this.createDetailItem('Type', event.taskType));
        details.push(this.createDetailItem('Source', event.source));

        if (event.scope) {
          details.push(this.createDetailItem('Scope', event.scope));
        }

        if (event.command) {
          const cmdItem = this.createDetailItem('Command', event.command);
          cmdItem.tooltip = event.command;
          details.push(cmdItem);
        }

        if (event.cwd) {
          details.push(this.createDetailItem('Working Dir', event.cwd));
        }

        if (event.processId !== undefined) {
          details.push(this.createDetailItem('Process ID', event.processId.toString()));
        } else if (
          event.status === TaskTimelineEventStatus.TERMINATED ||
          event.status === TaskTimelineEventStatus.COMPLETED
        ) {
          details.push(this.createDetailItem('Process ID', 'N/A (terminated before PID assigned)'));
        }

        if (event.exitCode !== undefined) {
          const exitCodeText =
            event.exitCode === 143 ? `${event.exitCode} (SIGTERM - Terminated)` : event.exitCode.toString();
          details.push(this.createDetailItem('Exit Code', exitCodeText));
        }

        if (event.isSuspicious && event.suspiciousPattern) {
          const suspItem = this.createDetailItem('Pattern', event.suspiciousPattern);
          suspItem.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
          details.push(suspItem);
        }

        return Promise.resolve(details);
      }
    }

    return Promise.resolve([]);
  }

  private createDetailItem(label: string, value: string): vscode.TreeItem {
    const item = new vscode.TreeItem(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
    return item;
  }

  private getStatusText(event: TaskTimelineEvent): string {
    switch (event.status) {
      case TaskTimelineEventStatus.STARTED:
        return 'Started';
      case TaskTimelineEventStatus.COMPLETED:
        return 'Completed Successfully';
      case TaskTimelineEventStatus.TERMINATED:
        return 'Terminated by IDE-SHEPHERD';
      case TaskTimelineEventStatus.FAILED:
        return 'Failed';
      default:
        return 'Unknown';
    }
  }

  private getEventIcon(event: TaskTimelineEvent): vscode.ThemeIcon {
    if (event.isSuspicious) {
      if (event.status === TaskTimelineEventStatus.TERMINATED) {
        return new vscode.ThemeIcon('shield', new vscode.ThemeColor('errorForeground'));
      }
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground'));
    }

    switch (event.status) {
      case TaskTimelineEventStatus.STARTED:
        return new vscode.ThemeIcon('play');
      case TaskTimelineEventStatus.COMPLETED:
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      case TaskTimelineEventStatus.TERMINATED:
        return new vscode.ThemeIcon('stop-circle', new vscode.ThemeColor('errorForeground'));
      case TaskTimelineEventStatus.FAILED:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }

  private getEventTooltip(event: TaskTimelineEvent): string {
    let tooltip = `Task: ${event.taskName}\n`;
    tooltip += `Type: ${event.taskType}\n`;
    tooltip += `Source: ${event.source}\n`;
    tooltip += `Status: ${this.getStatusText(event)}\n`;

    if (event.command) {
      tooltip += `Command: ${event.command}\n`;
    }

    if (event.isSuspicious) {
      tooltip += `\nSUSPICIOUS TASK\n`;
      if (event.suspiciousPattern) {
        tooltip += `Pattern: ${event.suspiciousPattern}\n`;
      }
    }

    return tooltip;
  }

  private getEventIndexFromContext(contextValue?: string): number {
    if (!contextValue || !contextValue.startsWith('task-event-')) {
      return -1;
    }
    const indexStr = contextValue.replace('task-event-', '');
    const index = parseInt(indexStr, 10);
    return isNaN(index) ? -1 : index;
  }

  /**
   * Get statistics for display
   */
  getStatistics() {
    const total = this._taskEvents.length;
    const suspicious = this._taskEvents.filter((e) => e.isSuspicious).length;
    const terminated = this._taskEvents.filter((e) => e.status === TaskTimelineEventStatus.TERMINATED).length;
    const completed = this._taskEvents.filter((e) => e.status === TaskTimelineEventStatus.COMPLETED).length;
    const failed = this._taskEvents.filter((e) => e.status === TaskTimelineEventStatus.FAILED).length;

    return { total, suspicious, terminated, completed, failed };
  }
}
