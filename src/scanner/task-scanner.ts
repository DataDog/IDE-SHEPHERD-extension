import * as vscode from 'vscode';
import { Logger } from '../lib/logger';
import { SidebarService } from '../lib/services/sidebar-service';
import { IDEStatusService } from '../lib/services/ide-status-service';
import { TaskTimelineEvent, TaskTimelineEventStatus } from '../lib/services/providers/task-timeline-provider';
import { TaskEvent } from '../lib/events/task-events';
import { SecurityEvent, IoC } from '../lib/events/sec-events';
import { WorkspaceInfo } from '../lib/events/ext-events';
import { NotificationService, BlockedOperationType } from '../lib/services/notification-service';
import { TASK_RULES, TaskRule } from '../detection/task-rules';
import { TrustedWorkspaceService } from '../lib/services/trusted-workspace-service';

/**
 * Enhanced TaskScanner with immediate termination capability
 *
 * While we cannot BLOCK task execution before it starts,
 * we can TERMINATE suspicious tasks immediately after detection.
 */
export class TaskScanner {
  private activeTasks: Map<string, TaskExecutionInfo> = new Map();
  private taskExecutions: Map<string, vscode.TaskExecution> = new Map();
  private autoTerminateEnabled: boolean = true;

  /**
   * Activate task monitoring with termination capability
   */
  public activate(context: vscode.ExtensionContext): void {
    Logger.info('TaskScanner WITH TERMINATION activated - monitoring VS Code tasks');

    // task start events
    context.subscriptions.push(
      vscode.tasks.onDidStartTask((event) => {
        this.handleTaskStart(event);
      }),
    );

    // task end events
    context.subscriptions.push(
      vscode.tasks.onDidEndTask((event) => {
        this.handleTaskEnd(event);
      }),
    );

    // task process start events
    context.subscriptions.push(
      vscode.tasks.onDidStartTaskProcess((event) => {
        this.handleTaskProcessStart(event);
      }),
    );

    // task process end events
    context.subscriptions.push(
      vscode.tasks.onDidEndTaskProcess((event) => {
        this.handleTaskProcessEnd(event);
      }),
    );

    // register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('ide-shepherd.terminateAllTasks', () => {
        this.terminateAllTasks();
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('ide-shepherd.toggleAutoTerminate', () => {
        this.autoTerminateEnabled = !this.autoTerminateEnabled;
        vscode.window.showInformationMessage(
          `IDE-SHEPHERD: Auto-termination ${this.autoTerminateEnabled ? 'enabled' : 'disabled'}`,
        );
      }),
    );
  }

  /**
   * Handle task start with immediate termination option
   */
  private handleTaskStart(event: vscode.TaskStartEvent): void {
    const task = event.execution.task;
    const taskId = this.getTaskId(task);

    this.taskExecutions.set(taskId, event.execution);

    const info = this.extractTaskInfo(task, event);
    this.activeTasks.set(taskId, info);

    const fullCommand = this.getFullCommand(info);
    Logger.info(
      `Task started: ${info.taskName} | ` +
        `Type: ${info.taskType} | ` +
        `Source: ${info.source} | ` +
        `Scope: ${info.scope} | ` +
        `Command: ${fullCommand || 'N/A'} | ` +
        `CWD: ${info.cwd || 'N/A'}`,
    );

    const timelineEvent: TaskTimelineEvent = {
      id: taskId,
      timestamp: info.startTime,
      taskName: info.taskName,
      taskType: info.taskType,
      source: info.source,
      command: fullCommand,
      cwd: info.cwd,
      scope: info.scope,
      status: TaskTimelineEventStatus.STARTED,
      isSuspicious: false,
    };

    SidebarService.getInstance().addTaskEvent(timelineEvent);

    this.analyzeTask(info, event.execution, taskId);
  }

  /**
   * Analyze task and terminate immediately if suspicious
   */
  private async analyzeTask(info: TaskExecutionInfo, execution: vscode.TaskExecution, taskId: string): Promise<void> {
    const fullCommand = this.getFullCommand(info);

    for (const rule of TASK_RULES) {
      if (rule.commandPattern.test(fullCommand)) {
        Logger.warn(`SUSPICIOUS TASK DETECTED! Task: ${info.taskName} | Rule: ${rule.name}`);

        SidebarService.getInstance().updateTaskEvent(taskId, { isSuspicious: true, suspiciousPattern: rule.name });

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspacePath = workspaceFolder?.uri.fsPath || '';
        const trustedWorkspaceService = TrustedWorkspaceService.getInstance();

        if (trustedWorkspaceService.isTrusted(workspacePath)) {
          Logger.info(`Task allowed - workspace is trusted: ${workspacePath}`);
          return;
        }

        if (this.autoTerminateEnabled) {
          // Terminate the task and trigger a security event
          const terminationTime = Date.now();
          execution.terminate();
          const timeSinceStart = terminationTime - info.startTime.getTime();

          // Create and emit security event
          const securityEvent = await this.triggerSecurityEvent(info, rule, fullCommand);

          Logger.warn(
            `Task terminated: ${info.taskName} | ` +
              `Time since start: ${timeSinceStart}ms | ` +
              `Command: ${fullCommand}`,
          );

          SidebarService.getInstance().updateTaskEvent(taskId, { status: TaskTimelineEventStatus.TERMINATED });

          // Show security blocking notification (same as process analyzer)
          if (securityEvent) {
            await NotificationService.showSecurityBlockingInfo(fullCommand, securityEvent, BlockedOperationType.TASK);
          }
        }

        break; // Only handle first matching rule
      }
    }
  }

  /**
   * Terminate all running tasks (emergency stop)
   */
  public terminateAllTasks(): void {
    Logger.warn('EMERGENCY: Terminating all active tasks');
    let count = 0;

    for (const [taskId, execution] of this.taskExecutions.entries()) {
      execution.terminate();
      count++;
    }

    vscode.window.showWarningMessage(`IDE-SHEPHERD: Terminated ${count} active task(s)`);
  }

  /**
   * Enable/disable auto-termination
   */
  public setAutoTerminate(enabled: boolean): void {
    this.autoTerminateEnabled = enabled;
    Logger.info(`Auto-termination ${enabled ? 'enabled' : 'disabled'}`);
  }

  private getTaskId(task: vscode.Task): string {
    return `${task.source}_${task.name}_${task.definition.type}`;
  }

  private getFullCommand(info: TaskExecutionInfo): string {
    if (!info.command) {
      return '';
    }
    if (info.args && info.args.length > 0) {
      return `${info.command} ${info.args.join(' ')}`;
    }
    return info.command;
  }

  private extractTaskInfo(task: vscode.Task, event: vscode.TaskStartEvent): TaskExecutionInfo {
    const info: TaskExecutionInfo = {
      taskName: task.name,
      taskType: task.definition.type,
      source: task.source,
      startTime: new Date(),
      scope: this.getTaskScope(task),
    };

    // Get working directory from task scope if available
    let workingDir: string | undefined;
    if (task.scope && typeof task.scope === 'object') {
      workingDir = (task.scope as vscode.WorkspaceFolder).uri.fsPath;
    }

    // extract command details if available
    if (task.execution) {
      if (task.execution instanceof vscode.ShellExecution) {
        const shellExec = task.execution as vscode.ShellExecution;
        if (typeof shellExec.commandLine === 'string') {
          info.command = shellExec.commandLine;
        } else {
          info.command = shellExec.command as string;
          if (shellExec.args) {
            info.args = shellExec.args.map((arg) => (typeof arg === 'string' ? arg : String(arg)));
          }
        }
        // Use explicit cwd from options, or fall back to workspace folder
        info.cwd = shellExec.options?.cwd || workingDir;
      } else if (task.execution instanceof vscode.ProcessExecution) {
        const procExec = task.execution as vscode.ProcessExecution;
        info.command = procExec.process;
        info.args = procExec.args.map((arg) => (typeof arg === 'string' ? arg : String(arg)));
        info.cwd = procExec.options?.cwd || workingDir;
      }
    }

    return info;
  }

  private getTaskScope(task: vscode.Task): string {
    if (task.scope === vscode.TaskScope.Global) {
      return 'Global';
    } else if (task.scope === vscode.TaskScope.Workspace) {
      return 'Workspace';
    } else if (task.scope && typeof task.scope === 'object') {
      return (task.scope as vscode.WorkspaceFolder).name;
    }
    return 'Unknown';
  }

  /**
   * Trigger a security event for suspicious task
   */
  private async triggerSecurityEvent(
    info: TaskExecutionInfo,
    rule: TaskRule,
    command: string,
  ): Promise<SecurityEvent | null> {
    try {
      const workspaceName = vscode.workspace.name || 'Unknown Workspace';
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const workspacePath = workspaceFolder?.uri.fsPath || '';

      // Check if workspace is trusted
      const trustedWorkspaceService = TrustedWorkspaceService.getInstance();
      const isTrusted = trustedWorkspaceService.isTrusted(workspacePath);

      const workspaceInfo = new WorkspaceInfo(workspaceName, workspacePath, isTrusted);

      const taskEvent = new TaskEvent(
        info.taskName,
        info.taskType,
        info.source,
        info.command || '',
        info.args || [],
        workspaceInfo,
        workspacePath,
        info.cwd,
        info.scope,
      );

      const ioc: IoC = {
        finding: command,
        rule: rule.name,
        description: `${rule.description}: ${command}`,
        confidence: rule.confidence,
        severity: rule.severity,
      };

      // Create SecurityEvent
      const securityEvent = new SecurityEvent(taskEvent, workspaceInfo, rule.severity, rule.type, [ioc]);

      // Emit the security event
      await IDEStatusService.emitSecurityEvent(securityEvent);

      return securityEvent;
    } catch (error) {
      Logger.error('Failed to trigger security event for task', error as Error);
      return null;
    }
  }

  private handleTaskEnd(event: vscode.TaskEndEvent): void {
    const task = event.execution.task;
    const taskId = this.getTaskId(task);

    const info = this.activeTasks.get(taskId);
    if (info) {
      info.endTime = new Date();

      this.activeTasks.delete(taskId);
      this.taskExecutions.delete(taskId);

      const fullCommand = this.getFullCommand(info);

      Logger.info(
        `Task ended: ${info.taskName} | ` +
          `Exit code: ${info.exitCode !== undefined ? info.exitCode : 'pending'} | ` +
          `PID: ${info.processId || 'N/A'} | ` +
          `Command: ${fullCommand || 'N/A'}`,
      );

      const status =
        info.exitCode === 143
          ? TaskTimelineEventStatus.TERMINATED
          : info.exitCode === 0
            ? TaskTimelineEventStatus.COMPLETED
            : TaskTimelineEventStatus.FAILED;

      SidebarService.getInstance().updateTaskEvent(taskId, {
        status,
        exitCode: info.exitCode,
        processId: info.processId,
      });
    }
  }

  private handleTaskProcessStart(event: vscode.TaskProcessStartEvent): void {
    const task = event.execution.task;
    const taskId = this.getTaskId(task);

    const info = this.activeTasks.get(taskId);
    if (info) {
      info.processId = event.processId;
      Logger.info(`Task process started: ${info.taskName} (PID: ${event.processId})`);
    } else {
      Logger.info(
        `Task process started but task info missing (likely terminated): ${task.name} (PID: ${event.processId})`,
      );
    }
  }

  private handleTaskProcessEnd(event: vscode.TaskProcessEndEvent): void {
    const task = event.execution.task;
    const taskId = this.getTaskId(task);

    const info = this.activeTasks.get(taskId);
    if (info) {
      info.exitCode = event.exitCode;

      Logger.info(
        `Task process ended: ${info.taskName} | ` +
          `Exit code: ${event.exitCode} | ` +
          `PID: ${info.processId || 'N/A (terminated before PID assigned)'}`,
      );

      if (event.exitCode === 143) {
        Logger.info(`Exit code 143 = Task was terminated by SIGTERM (our termination worked!)`);
      } else if (event.exitCode !== 0) {
        Logger.warn(`Task ${info.taskName} failed with exit code ${event.exitCode}`);
      }
    } else {
      Logger.info(`Task process ended (already in history): ${task.name} (Exit code: ${event.exitCode})`);
    }
  }
}

interface TaskExecutionInfo {
  taskName: string;
  taskType: string;
  source: string;
  command?: string;
  args?: string[];
  cwd?: string;
  processId?: number;
  startTime: Date;
  endTime?: Date;
  exitCode?: number;
  scope?: string;
}
