import { Target, TargetEvent, ExtensionInfo } from './ext-events';

export type FsOperation = 'read' | 'write' | 'append';

export class FsEvent extends TargetEvent<Target.FILESYSTEM> {
  readonly path: string;
  readonly operation: FsOperation;

  constructor(
    path: string,
    operation: FsOperation,
    hookFile: string,
    extensionInfo: ExtensionInfo,
    timestamp?: number,
  ) {
    super(Target.FILESYSTEM, extensionInfo, hookFile, timestamp);
    this.path = path;
    this.operation = operation;
  }

  toJSON(): string {
    return JSON.stringify({
      eventId: this.eventId,
      timestamp: this.timestamp,
      eventType: this.eventType,
      extension: this.extension,
      hookFile: this.hookFile,
      path: this.path,
      operation: this.operation,
    });
  }
}
