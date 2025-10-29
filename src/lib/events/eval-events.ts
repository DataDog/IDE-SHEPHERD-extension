import { Target, TargetEvent, ExtensionInfo } from './ext-events';
export class EvalEvent extends TargetEvent<Target.EVAL> {
  constructor(
    public readonly code: string,
    public readonly hookFile: string,
    extensionInfo: ExtensionInfo,
    timestamp?: number,
  ) {
    super(Target.EVAL, extensionInfo, hookFile, timestamp);
  }

  toJSON(): string {
    return JSON.stringify({
      eventId: this.eventId,
      timestamp: this.timestamp,
      eventType: this.eventType,
      extension: this.extension,
      hookFile: this.hookFile,
      code: this.code,
    });
  }
}
