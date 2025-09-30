import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { promisify } from 'util';
import { ChildProcess, ExecOptions, ExecException } from 'child_process';

import { Logger } from '../../lib/logger';
import { NotificationService } from '../../lib/services/notification-service';
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

  const origExec = childProcess.exec.bind(childProcess);
  // get call context from the caller
  const patchedExec = function patchedExec(
    command: string,
    optsOrCb?: ExecOptions | ((error: ExecException | null, stdout: string, stderr: string) => void),
    maybeCb?: (error: ExecException | null, stdout: string, stderr: string) => void,
  ) {
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

      NotificationService.showSecurityBlockingInfo(command, analysis.securityEvent, 'exec');

      return createBlockedProcess();
    }

    return (origExec as any)(command, options, callback);
  };

  // preserve the __promisify__ property for util.promisify() compatibility
  Object.defineProperty(patchedExec, '__promisify__', {
    value: promisify(origExec),
    writable: false,
    enumerable: false,
    configurable: true,
  });

  childProcess.exec = patchedExec as typeof childProcess.exec;

  Object.defineProperty(childProcess, '__patched__', { value: true });
}
