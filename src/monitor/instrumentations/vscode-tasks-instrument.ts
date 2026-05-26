import * as vscode from 'vscode';

import { Logger } from '../../lib/logger';
import { TASK_RULES } from '../../detection/task-rules';
import { TrustedWorkspaceService } from '../../lib/services/trusted-workspace-service';
import { AllowListService } from '../../lib/services/allowlist-service';
import { NotificationService, BlockedOperationType } from '../../lib/services/notification-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { SecurityEvent, IoC } from '../../lib/events/sec-events';
import { TaskEvent } from '../../lib/events/task-events';
import { ExtensionInfo, WorkspaceInfo } from '../../lib/events/ext-events';

// task.source values VS Code sets for workspace-owned tasks; anything else is an extension ID.
const WORKSPACE_TASK_SOURCES = new Set(['Workspace', 'User', '']);

// task.source is the task-provider type string (e.g. 'nx'), not the extension ID.
// Resolve it to the real extension ID by finding which installed extension contributes
// a taskDefinition with that type. Falls back to the raw source string if no match.
function resolveExtensionIdFromTaskSource(taskSource: string, vscodeMod: typeof vscode): string {
  for (const ext of vscodeMod.extensions.all) {
    const taskDefs = ext.packageJSON?.contributes?.taskDefinitions;
    if (Array.isArray(taskDefs) && taskDefs.some((def: any) => def.type === taskSource)) {
      return ext.id;
    }
  }
  return taskSource;
}

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

      // task.source is set at Task construction time by whoever owns the task —
      // reliable across sync and async dispatch, unlike stack trace inspection.
      const taskSource = task.source ?? '';
      const extensionId = WORKSPACE_TASK_SOURCES.has(taskSource)
        ? null
        : resolveExtensionIdFromTaskSource(taskSource, vscodeMod);

      for (const rule of TASK_RULES) {
        if (rule.commandPattern.test(normalized)) {
          if (TrustedWorkspaceService.getInstance().isTrusted(workspacePath)) {
            break;
          }

          if (extensionId && AllowListService.getInstance().isAllowed(extensionId)) {
            break;
          }

          Logger.warn(
            `vscode.tasks.executeTask intercepted — rule: ${rule.id} | ` +
              `task: ${task.name} | source: ${taskSource || 'Workspace'} | ` +
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
            const callerExtension = extensionId ? new ExtensionInfo(extensionId, true, Date.now()) : undefined;
            const securityEvent = new SecurityEvent(
              taskEvent,
              workspaceInfo,
              rule.severity,
              rule.type,
              [ioc],
              callerExtension,
            );
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
