import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { Logger } from '../../lib/logger';
import { NotificationService } from '../../lib/services/notification-service';
import { ExtensionInfo } from '../../lib/events/ext-events';
import { ProcessAnalyzer } from '../analysis/process-analyzer';
import { ExecEvent } from '../../lib/events/process-events';

function createBlockedProcess(): any {
    const proc: any = new EventEmitter();
  
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
    process.nextTick(() =>
      proc.emit('error', new Error('Execution blocked by security policy')),
    );
  
    return proc;
  }

  
  function normalizeExecArgs(
    cmd: any,
    optsOrCb?: any,
    maybeCb?: any
  ) {
    if (typeof optsOrCb === 'function') {
      return { options: undefined, callback: optsOrCb };
    }
    return { options: optsOrCb ?? undefined, callback: maybeCb };
  }



export function patchChildProcess(child_process: any, extensionInfo: ExtensionInfo, processAnalyzer = new ProcessAnalyzer()) {
    if (child_process.__patched__) {
        Logger.debug(`Child-Process Plugin: already patched, skipping`);
        return;
    }
    Logger.debug(`Child-Process Plugin: patching child_process`);

    const origExec = child_process.exec.bind(child_process);
    child_process.exec = function patchedExec(command: string, optsOrCb?: any, maybeCb?: any) {
        const { options, callback } = normalizeExecArgs(command, optsOrCb, maybeCb);
    
        const analysis = processAnalyzer.analyze(
          new ExecEvent(command, [], options, __filename, extensionInfo),
        );
    
        if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
          Logger.warn(
            `Child-Process Plugin: blocked exec(): ${Logger.truncate(command, 120)}`,
          );
    
          NotificationService.showSecurityBlockingInfo(
            command,
            analysis.securityEvent,
            'exec',
          );
    
          return createBlockedProcess();
        }
    
        return origExec(command, options, callback);
      };

    Object.defineProperty(child_process, '__patched__', { value: true });
}
