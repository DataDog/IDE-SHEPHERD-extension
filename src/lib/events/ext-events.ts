/**
 * Extension Events : these are the 'raw' metrics collected directly from hooks inserted by patches
 * For first version, we focus only on network activity: outgoing requests and incoming responses
 */

import { randomUUID } from 'crypto';

export type Timestamp = number;

export class ExtensionInfo {
  id: string; // extensionName.publisherName
  isPatched: boolean;
  patchedAt?: Timestamp; // useful to construct a patching timeline

  constructor(id: string, isPatched: boolean, patchedAt?: Timestamp) {
    this.id = id;
    this.isPatched = isPatched;
    this.patchedAt = patchedAt;
  }
}

export class WorkspaceInfo {
  name: string;
  path: string;
  isTrusted: boolean; // trusted to run tasks, extend this definition as we add more targets
  trustedAt?: Timestamp;

  constructor(name: string, path: string, isTrusted: boolean, trustedAt?: Timestamp) {
    this.name = name;
    this.path = path;
    this.isTrusted = isTrusted;
    this.trustedAt = trustedAt;
  }
}

/**
 * High-level class of the event.  Extend in the future for FS, Child-Process …
 */
export enum Target {
  NETWORK = 'Network',
  PROCESS = 'Process',
  WORKSPACE = 'Workspace',
}

export namespace Target {
  export function getValue(target: Target): string {
    return target;
  }

  export function getIcon(target: Target): string {
    switch (target) {
      case Target.NETWORK:
        return 'globe';
      case Target.PROCESS:
        return 'terminal';
      case Target.WORKSPACE:
        return 'folder';
      default:
        return 'question';
    }
  }
}

/**
 *  Abstract base for every security-relevant event that leaves a hook.
 *  Carries generic metadata that is useful regardless of the concrete domain.
 */
export abstract class TargetEvent<T extends Target> {
  readonly eventId: string; // UUID, else we can use a timestamp + salt
  readonly timestamp: Timestamp;
  readonly eventType: T;

  readonly extension?: ExtensionInfo;
  readonly workspace?: WorkspaceInfo;

  // absolute path of the file where the hook lives
  readonly hookFile: string;

  protected constructor(
    eventType: T,
    source: ExtensionInfo | WorkspaceInfo,
    hookFile: string,
    timestamp: Timestamp = Date.now(),
  ) {
    this.eventId = randomUUID();
    this.timestamp = timestamp;
    this.eventType = eventType;

    // Determine source type based on Target
    if (eventType === Target.WORKSPACE) {
      this.workspace = source as WorkspaceInfo;
    } else {
      this.extension = source as ExtensionInfo;
    }

    this.hookFile = hookFile;
  }

  /**
   *  Serialised representation that can be logged, shipped or embedded in a SecurityEvent.
   */
  abstract toJSON(): string;
}
