/**
 * Task Events - Events generated when VS Code tasks are executed
 */

import { WorkspaceInfo, Target, TargetEvent, Timestamp } from './ext-events';

export class TaskEvent extends TargetEvent<Target.WORKSPACE> {
  readonly taskName: string;
  readonly taskType: string;
  readonly source: string;
  readonly command: string;
  readonly args: string[];
  readonly cwd?: string;
  readonly scope?: string;

  constructor(
    taskName: string,
    taskType: string,
    source: string,
    command: string,
    args: string[],
    workspace: WorkspaceInfo,
    hookFile: string,
    cwd?: string,
    scope?: string,
    timestamp: Timestamp = Date.now(),
  ) {
    super(Target.WORKSPACE, workspace, hookFile, timestamp);
    this.taskName = taskName;
    this.taskType = taskType;
    this.source = source;
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.scope = scope;
  }

  toJSON(): string {
    return JSON.stringify({
      eventId: this.eventId,
      timestamp: this.timestamp,
      eventType: this.eventType,
      workspace: this.workspace,
      hookFile: this.hookFile,
      taskName: this.taskName,
      taskType: this.taskType,
      source: this.source,
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      scope: this.scope,
    });
  }

  getFullCommand(): string {
    if (this.args.length > 0) {
      return `${this.command} ${this.args.join(' ')}`;
    }
    return this.command;
  }
}
