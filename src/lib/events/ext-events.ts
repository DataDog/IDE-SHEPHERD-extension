/**
 * Extension Events : these are the 'raw' metrics collected directly from hooks inserted by patches
 * For first version, we focus only on network activity: outgoing requests and incoming responses
 */

import { randomUUID } from 'crypto';

export type Timestamp = number;

/**
 * Identifier and meta data of the extension that emitted the event.
 */
/**
 * Extension status information
 */
export interface ExtensionInfo {
  id: string; // extensionName.publisherName
  isPatched: boolean;
  patchedAt?: Timestamp; // useful to construct a patching timeline
}

/**
 * High-level class of the event.  Extend in the future for FS, Child-Process …
 */
export enum Target {
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  WORKSPACE = 'workspace',
}

/**
 *  Abstract base for every security-relevant event that leaves a hook.
 *  Carries generic metadata that is useful regardless of the concrete domain.
 */
export abstract class TargetEvent<T extends Target> {
  readonly eventId: string; // UUID, else we can use a timestamp + salt
  readonly timestamp: Timestamp;
  readonly eventType: T;

  readonly extension: ExtensionInfo;

  // absolute path of the file where the hook lives
  readonly hookFile: string;

  protected constructor(eventType: T, extension: ExtensionInfo, hookFile: string, timestamp: Timestamp = Date.now()) {
    this.eventId = randomUUID();
    this.timestamp = timestamp;
    this.eventType = eventType;
    this.extension = extension;
    this.hookFile = hookFile;
  }

  /**
   *  Serialised representation that can be logged, shipped or embedded in a SecurityEvent.
   */
  abstract toJSON(): Record<string, unknown>;
}
