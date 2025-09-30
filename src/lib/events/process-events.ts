import { Target, TargetEvent, ExtensionInfo } from './ext-events';

export class ExecEvent extends TargetEvent<Target.PROCESS> {
  constructor(
    public readonly cmd: string,
    public readonly args: string[],
    public readonly options: Record<string, any> | undefined,
    public readonly hookFile: string,
    extensionInfo: ExtensionInfo,
    timestamp?: number,
  ) {
    super(Target.PROCESS, extensionInfo, hookFile, timestamp);
  }

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      timestamp: this.timestamp,
      eventType: this.eventType,
      extension: this.extension,
      hookFile: this.hookFile,
      cmd: this.cmd,
      args: this.args,
      options: this.options,
    };
  }
}
