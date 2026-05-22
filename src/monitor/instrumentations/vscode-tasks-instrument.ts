import * as vscode from 'vscode';

import { Logger } from '../../lib/logger';
import { TASK_RULES } from '../../detection/task-rules';
import { TrustedWorkspaceService } from '../../lib/services/trusted-workspace-service';
import { NotificationService, BlockedOperationType } from '../../lib/services/notification-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { ExtensionServices } from '../../lib/services/ext-service';
import { SecurityEvent, IoC } from '../../lib/events/sec-events';
import { TaskEvent } from '../../lib/events/task-events';
import { ExtensionInfo, WorkspaceInfo } from '../../lib/events/ext-events';

function extractCommand(task: vscode.Task): string {
  if (!task.execution) {
    return '';
  }
  const ex = task.execution;
  if (ex instanceof vscode.ShellExecution) {
    if (typeof ex.commandLine === 'string' && ex.commandLine) {
      return ex.commandLine;
    }
    const cmd = typeof ex.command === 'string' ? ex.command : '';
    const args = (ex.args ?? []).map((a) => (typeof a === 'string' ? a : String(a)));
    return args.length ? `${cmd} ${args.join(' ')}` : cmd;
  }
  if (ex instanceof vscode.ProcessExecution) {
    const args = ex.args.map((a) => (typeof a === 'string' ? a : String(a)));
    return args.length ? `${ex.process} ${args.join(' ')}` : ex.process;
  }
  return '';
}

function normalizeCommand(cmd: string): string {
  return cmd
    .replace(/\\\n\s*/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function patchVscodeTasks(vscodeMod: typeof vscode): void {
  const tasks = vscodeMod.tasks as any;
  if (tasks.__tasksPatched__) {
    return;
  }

  const origExecuteTask = tasks.executeTask.bind(tasks);

  tasks.executeTask = async function patchedExecuteTask(task: vscode.Task): Promise<vscode.TaskExecution> {
    const raw = extractCommand(task);

    if (raw) {
      const normalized = normalizeCommand(raw);
      const workspacePath = vscodeMod.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

      for (const rule of TASK_RULES) {
        if (rule.commandPattern.test(normalized)) {
          if (TrustedWorkspaceService.getInstance().isTrusted(workspacePath)) {
            break;
          }

          const callContext = ExtensionServices.getCallContext();
          const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

          Logger.warn(
            `vscode.tasks.executeTask intercepted — rule: ${rule.id} | ` +
              `task: ${task.name} | ext: ${callContext.extension} | ` +
              `cmd: ${Logger.truncate(raw, 120)}`,
          );

          try {
            const workspaceName = vscodeMod.workspace.name ?? 'Unknown Workspace';
            const workspaceInfo = new WorkspaceInfo(workspaceName, workspacePath, false);
            const taskEvent = new TaskEvent(
              task.name,
              task.definition.type,
              task.source,
              raw,
              [],
              workspaceInfo,
              workspacePath,
            );
            const ioc: IoC = {
              finding: raw,
              rule: rule.name,
              description: `${rule.description}: ${raw}`,
              confidence: rule.confidence,
              severity: rule.severity,
            };
            const securityEvent = new SecurityEvent(taskEvent, workspaceInfo, rule.severity, rule.type, [ioc]);
            await IDEStatusService.emitSecurityEvent(securityEvent);
            await NotificationService.showSecurityBlockingInfo(raw, securityEvent, BlockedOperationType.TASK);
          } catch (err) {
            Logger.error('vscode-tasks-instrument: failed to emit security event', err as Error);
          }

          return Promise.reject(new Error(`Task blocked by IDE Shepherd [${rule.name}]: ${raw}`));
        }
      }
    }

    return origExecuteTask(task);
  };

  Object.defineProperty(tasks, '__tasksPatched__', { value: true, configurable: false });
  Logger.info('vscode-tasks-instrument: vscode.tasks.executeTask patched');
}
