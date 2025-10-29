import { Logger } from '../../lib/logger';
import { ExtensionServices } from '../../lib/services/ext-service';
import { ExtensionInfo } from '../../lib/events/ext-events';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { EvalAnalyzer } from '../analysis/eval-analyzer';
import { EvalEvent } from '../../lib/events/eval-events';
import { BlockedOperationType, NotificationService } from '../../lib/services/notification-service';

// Type definitions for patched global objects
interface PatchedGlobalThis {
  __evalPatched__?: boolean;
  __functionPatched__?: boolean;
}

export function patchGlobalEval(): void {
  const global = globalThis as typeof globalThis & PatchedGlobalThis;

  if (global.__evalPatched__) {
    return;
  }

  // Store reference to original eval
  const indirectEval = globalThis.eval;
  const evalAnalyzer = new EvalAnalyzer();

  // indirect eval runs in global scope whereas require might not be defined :')
  if (typeof global.require === 'undefined' && typeof require !== 'undefined') {
    global.require = require;
  }

  globalThis.eval = function patchedEval(code: string): unknown {
    const callContext = ExtensionServices.getCallContext();
    const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

    IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
      Logger.warn(`Eval Plugin: Failed to update extension status for ${extensionInfo.id}: ${error.message}`);
    });

    Logger.info(`Eval Plugin: eval() called by extension ${extensionInfo.id}`);
    Logger.debug(`Eval Plugin: Code to be executed: ${Logger.truncate(String(code), 200)}`);

    const analysis = evalAnalyzer.analyze(new EvalEvent(String(code), __filename, extensionInfo));

    if (analysis && !analysis.verdict.allowed && analysis.securityEvent) {
      Logger.warn(`Eval Plugin: blocked eval(): ${Logger.truncate(String(code), 120)}`);
      NotificationService.showSecurityBlockingInfo(String(code), analysis.securityEvent, BlockedOperationType.EVAL);
      throw new Error('eval() blocked by security policy');
    }

    return indirectEval(code);
  };

  global.__evalPatched__ = true;
}
