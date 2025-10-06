import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { promisify } from 'util';
import { ChildProcess, ExecOptions, ExecException, SpawnOptions } from 'child_process';
import { Buffer } from 'buffer';

import { Logger } from '../../lib/logger';
import { BlockedOperationType, NotificationService } from '../../lib/services/notification-service';
import { ExtensionInfo } from '../../lib/events/ext-events';
import { ProcessAnalyzer } from '../analysis/process-analyzer';
import { ExecEvent } from '../../lib/events/process-events';
import { ExtensionServices } from '../../lib/services/ext-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';

function createBlockedProcess(): ChildProcess {
  const proc = new EventEmitter() as any;

  proc.killed = false;
  proc.pid = undefined;
  proc.stdin = new Writable({
    write(_c, _e, cb) {
      cb();
    },
  });
  proc.stdout = Readable.from([]);
  proc.stderr = Readable.from([]);

  proc.kill = () => {
    proc.killed = true;
    return true;
  };

  // let the caller’s error handler run *after* they attach it
  process.nextTick(() => proc.emit('error', new Error('Execution blocked by security policy')));

  return proc;
}

function normalizeExecArgs(
  cmd: string,
  optsOrCb?: ExecOptions | ((error: ExecException | null, stdout: string, stderr: string) => void),
  maybeCb?: (error: ExecException | null, stdout: string, stderr: string) => void,
) {
  if (typeof optsOrCb === 'function') {
    return { options: undefined, callback: optsOrCb };
  }
  return { options: optsOrCb ?? undefined, callback: maybeCb };
}

export function patchChildProcess(
  childProcess: typeof import('child_process') & { __patched__?: boolean },
  processAnalyzer = new ProcessAnalyzer(),
) {
  if (childProcess.__patched__) {
    Logger.debug(`Child-Process Plugin: already patched, skipping`);
    return;
  }
  Logger.debug(`Child-Process Plugin: patching child_process`);

  // Patch exec function
  const origExec = childProcess.exec.bind(childProcess);
  const patchedExec = function patchedExec(
    command: string,
    optsOrCb?: ExecOptions | ((error: ExecException | null, stdout: string, stderr: string) => void),
    maybeCb?: (error: ExecException | null, stdout: string, stderr: string) => void,
  ): ChildProcess {
    const { options, callback } = normalizeExecArgs(command, optsOrCb, maybeCb);
    const callContext = ExtensionServices.getCallContext();
    const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

    // update patched extensions in ide status service
    IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
      Logger.warn(`ModuleLoaderPatcher: Failed to update extension status for ${extensionInfo.id}: ${error.message}`);
    });

    const analysis = processAnalyzer.analyze(new ExecEvent(command, [], options, __filename, extensionInfo));

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`Child-Process Plugin: blocked exec(): ${Logger.truncate(command, 120)}`);

      NotificationService.showSecurityBlockingInfo(command, analysis.securityEvent, BlockedOperationType.EXEC);

      return createBlockedProcess();
    }

    const wrappedCallback = callback
      ? (error: ExecException | null, stdout: string | Buffer, stderr: string | Buffer) => {
          callback(error, String(stdout), String(stderr));
        }
      : undefined;

    // Handle the overloads properly by checking what's defined
    return origExec(command, options, wrappedCallback) as ChildProcess;
  };

  const promisifiedExec = (command: string, options?: ExecOptions): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve, reject) => {
      const callContext = ExtensionServices.getCallContext();
      const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

      IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
        Logger.warn(`ModuleLoaderPatcher: Failed to update extension status for ${extensionInfo.id}: ${error.message}`);
      });

      const analysis = processAnalyzer.analyze(new ExecEvent(command, [], options, __filename, extensionInfo));

      if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
        Logger.warn(`Child-Process Plugin: blocked exec(): ${Logger.truncate(command, 120)}`);

        NotificationService.showSecurityBlockingInfo(command, analysis.securityEvent, BlockedOperationType.EXEC);

        const proc = createBlockedProcess();
        proc.once('error', reject);
        return;
      }

      const callback = (error: ExecException | null, stdout: string | Buffer, stderr: string | Buffer) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout: String(stdout), stderr: String(stderr) });
        }
      };

      origExec(command, options, callback);
    });
  };

  Object.defineProperty(patchedExec, promisify.custom, {
    value: promisifiedExec,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  childProcess.exec = patchedExec as typeof childProcess.exec;

  // Patch spawn function
  const origSpawn = childProcess.spawn.bind(childProcess);

  function patchedSpawn(command: string, options?: SpawnOptions): ChildProcess;
  function patchedSpawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess;
  function patchedSpawn(
    command: string,
    args?: readonly string[] | SpawnOptions,
    options?: SpawnOptions,
  ): ChildProcess {
    // spawn can be called with (command, options) or (command, args, options)
    const actualArgs = Array.isArray(args) ? args : [];
    const actualOptions = Array.isArray(args) ? options : args;

    const callContext = ExtensionServices.getCallContext();
    const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

    IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
      Logger.warn(`ModuleLoaderPatcher: Failed to update extension status for ${extensionInfo.id}: ${error.message}`);
    });

    const analysis = processAnalyzer.analyze(
      new ExecEvent(command, actualArgs, actualOptions, __filename, extensionInfo),
    );
    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`Child-Process Plugin: blocked spawn(): ${Logger.truncate(command, 120)}`);
      NotificationService.showSecurityBlockingInfo(command, analysis.securityEvent, BlockedOperationType.SPAWN);
      return createBlockedProcess();
    }

    if (Array.isArray(args)) {
      if (options) {
        return origSpawn(command, args, options);
      } else {
        return origSpawn(command, args);
      }
    } else {
      // we need to cast because TypeScript can't narrow the union properly
      const spawnOpts = args as SpawnOptions | undefined;
      if (spawnOpts) {
        return origSpawn(command, [], spawnOpts);
      } else {
        return origSpawn(command, []);
      }
    }
  }

  childProcess.spawn = patchedSpawn as typeof childProcess.spawn;

  Object.defineProperty(childProcess, '__patched__', { value: true });
}
