import { Logger } from '../../lib/logger';
import { BlockedOperationType, NotificationService } from '../../lib/services/notification-service';
import { ExtensionInfo } from '../../lib/events/ext-events';
import { FsAnalyzer } from '../analysis/fs-analyzer';
import { FsEvent, FsOperation } from '../../lib/events/fs-events';
import { ExtensionServices } from '../../lib/services/ext-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';

function makeBlockedError(filePath: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(`EACCES: permission denied, open '${filePath}'`);
  err.code = 'EACCES';
  err.errno = -13;
  err.syscall = 'open';
  err.path = filePath;
  return err;
}

function resolvePath(fileArg: unknown): string {
  if (typeof fileArg === 'string') {
    return fileArg;
  }
  if (fileArg instanceof URL) {
    const pathname = fileArg.pathname;
    return /^\/[a-z]:/i.test(pathname) ? pathname.slice(1) : pathname;
  }
  if (Buffer.isBuffer(fileArg)) {
    return fileArg.toString();
  }
  return String(fileArg);
}

function getContext(filePath: string, operation: FsOperation, fsAnalyzer: FsAnalyzer) {
  const callContext = ExtensionServices.getCallContext();
  const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

  IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
    Logger.warn(`FsInstrument: Failed to update extension status for ${extensionInfo.id}: ${error.message}`);
  });

  const ev = new FsEvent(filePath, operation, __filename, extensionInfo);
  const analysis = fsAnalyzer.analyze(ev);
  return { analysis };
}

/**
 * Patch the promise-based fs API (used for both the fs.promises sub-object
 * and for the standalone fs/promises / node:fs/promises module export).
 */
function patchFsPromises(promises: any, fsAnalyzer: FsAnalyzer): void {
  const origReadFile = promises.readFile.bind(promises);
  promises.readFile = async function patchedPromisesReadFile(file: any, ...rest: any[]): Promise<any> {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'read', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked promises.readFile(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_READ);
      throw makeBlockedError(filePath);
    }

    return origReadFile(file, ...rest);
  };

  const origWriteFile = promises.writeFile.bind(promises);
  promises.writeFile = async function patchedPromisesWriteFile(file: any, data: any, ...rest: any[]): Promise<void> {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'write', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked promises.writeFile(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_WRITE);
      throw makeBlockedError(filePath);
    }

    return origWriteFile(file, data, ...rest);
  };

  const origAppendFile = promises.appendFile.bind(promises);
  promises.appendFile = async function patchedPromisesAppendFile(file: any, data: any, ...rest: any[]): Promise<void> {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'append', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked promises.appendFile(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_WRITE);
      throw makeBlockedError(filePath);
    }

    return origAppendFile(file, data, ...rest);
  };
}

/**
 * Patch the full `fs` / `node:fs` module export, which has callback-based,
 * sync, and a `fs.promises` sub-object.
 */
function patchFullFsModule(fs: any, fsAnalyzer: FsAnalyzer): void {
  // ── readFile ────────────────────────────────────────────────────────────────

  const origReadFile = fs.readFile.bind(fs);
  fs.readFile = function patchedReadFile(file: any, ...rest: any[]): void {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'read', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked readFile(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_READ);
      const cb = rest[rest.length - 1];
      if (typeof cb === 'function') {
        process.nextTick(cb, makeBlockedError(filePath));
      }
      return;
    }

    return origReadFile(file, ...rest);
  };

  // ── readFileSync ────────────────────────────────────────────────────────────

  const origReadFileSync = fs.readFileSync.bind(fs);
  fs.readFileSync = function patchedReadFileSync(file: any, ...rest: any[]): any {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'read', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked readFileSync(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_READ);
      throw makeBlockedError(filePath);
    }

    return origReadFileSync(file, ...rest);
  };

  // ── writeFile ───────────────────────────────────────────────────────────────

  const origWriteFile = fs.writeFile.bind(fs);
  fs.writeFile = function patchedWriteFile(file: any, data: any, ...rest: any[]): void {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'write', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked writeFile(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_WRITE);
      const cb = rest[rest.length - 1];
      if (typeof cb === 'function') {
        process.nextTick(cb, makeBlockedError(filePath));
      }
      return;
    }

    return origWriteFile(file, data, ...rest);
  };

  // ── writeFileSync ───────────────────────────────────────────────────────────

  const origWriteFileSync = fs.writeFileSync.bind(fs);
  fs.writeFileSync = function patchedWriteFileSync(file: any, data: any, ...rest: any[]): void {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'write', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked writeFileSync(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_WRITE);
      throw makeBlockedError(filePath);
    }

    return origWriteFileSync(file, data, ...rest);
  };

  // ── appendFile ──────────────────────────────────────────────────────────────

  const origAppendFile = fs.appendFile.bind(fs);
  fs.appendFile = function patchedAppendFile(file: any, data: any, ...rest: any[]): void {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'append', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked appendFile(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_WRITE);
      const cb = rest[rest.length - 1];
      if (typeof cb === 'function') {
        process.nextTick(cb, makeBlockedError(filePath));
      }
      return;
    }

    return origAppendFile(file, data, ...rest);
  };

  // ── appendFileSync ──────────────────────────────────────────────────────────

  const origAppendFileSync = fs.appendFileSync.bind(fs);
  fs.appendFileSync = function patchedAppendFileSync(file: any, data: any, ...rest: any[]): void {
    const filePath = resolvePath(file);
    const { analysis } = getContext(filePath, 'append', fsAnalyzer);

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`FsInstrument: blocked appendFileSync(): ${filePath}`);
      NotificationService.showSecurityBlockingInfo(filePath, analysis.securityEvent, BlockedOperationType.FS_WRITE);
      throw makeBlockedError(filePath);
    }

    return origAppendFileSync(file, data, ...rest);
  };

  // ── fs.promises sub-object ──────────────────────────────────────────────────

  if (fs.promises) {
    patchFsPromises(fs.promises, fsAnalyzer);
  }
}

/**
 * Entry point called by patch-loader for any fs-related module.
 *
 * `fs` / `node:fs` — full module: has sync, callback, and `fs.promises`.
 * `fs/promises` / `node:fs/promises` — promises-only namespace: no sync or
 *   callback variants. Trying to `.bind()` those absent methods crashes callers
 *   (e.g. vscode.git) before they even run.
 */
export function patchFs(exp: any & { __patched__?: boolean }, fsAnalyzer = new FsAnalyzer()): void {
  if (exp.__patched__) {
    return;
  }

  // Distinguish the two module shapes by the presence of sync methods.
  const isFullFsModule = typeof exp.readFileSync === 'function';

  if (isFullFsModule) {
    patchFullFsModule(exp, fsAnalyzer);
  } else {
    // fs/promises export — patch the async functions directly
    patchFsPromises(exp, fsAnalyzer);
  }

  Object.defineProperty(exp, '__patched__', { value: true });
}
