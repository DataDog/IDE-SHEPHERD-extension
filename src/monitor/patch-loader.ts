/**
 * High level layer to loop through all the modules names and apply the patch
 * will report the status of the patch for each module
 * will receive config params and pass them to the hooks
 */

import { ExtensionInfo } from '../lib/events/ext-events';
import { Logger } from '../lib/logger';
import { CONFIG } from '../lib/config';
import { patchHttpExports } from './instrumentations/http-client-instrument';
import { patchChildProcess } from './instrumentations/child-process-instrumentation';
import { ExtensionServices } from '../lib/services/ext-service';
import { IDEStatusService } from '../lib/services/ide-status-service';
import { Protocol } from '../lib/events/network-events';

const { Module } = require('module');

const PATCHER_SYMBOL = Symbol.for('__ideSecPatcher__');

export class ModuleLoaderPatcher {
  private originalLoad!: typeof Module._load;
  private patched = false;

  patch(): void {
    if (this.patched) {
      Logger.debug('ModuleLoaderPatcher: Already patched, skipping');
      return;
    }

    Logger.info('ModuleLoaderPatcher: Starting patch process...');

    try {
      // patch Module._load for future requires
      Logger.info('ModuleLoaderPatcher: Installing Module._load hook for future requires');
      const self = this;
      this.originalLoad = (Module as any)._load;

      (Module as any)._load = function patchedLoad(request: any, parent: any, isMain: any) {
        const exports = self.originalLoad.apply(this, arguments);
        if (CONFIG.MODULES.HTTP_MODULES.includes(request) || CONFIG.MODULES.CHILD_PROCESS_MODULES.includes(request)) {
          Logger.debug(`ModuleLoaderPatcher: Intercepted require for patchable module: ${request}`);
          self.patchExports(exports, request, parent);
        }
        return exports;
      };

      this.patched = true;
      Logger.info('ModuleLoaderPatcher: Patch process completed successfully');
    } catch (error) {
      Logger.error('ModuleLoaderPatcher: Failed to complete patch process', error as Error);
      throw error;
    }
  }

  private patchExports(exp: any, spec: string, parent: typeof Module | null): void {
    if (!exp || exp.__patched__) {
      Logger.debug(`ModuleLoaderPatcher: Module ${spec} already patched or invalid, skipping`);
      return;
    }

    Logger.debug(`ModuleLoaderPatcher: Patching exports for module: ${spec}`);

    try {
      const extId = ExtensionServices.getExtensionFromParentModule(parent);
      const extensionInfo = new ExtensionInfo(extId, true, Date.now());

      if (CONFIG.MODULES.HTTP_MODULES.includes(spec)) {
        const protocol: Protocol = spec.includes('https') ? 'https' : 'http';
        Logger.debug(`ModuleLoaderPatcher: Protocol: ${protocol}, Extension ID: ${extId}`);
        patchHttpExports(exp, protocol, extensionInfo);
      }

      if (CONFIG.MODULES.CHILD_PROCESS_MODULES.includes(spec)) {
        Logger.debug(`ModuleLoaderPatcher: Extension ID: ${extId}`);
        patchChildProcess(exp, extensionInfo);
      }

      Object.defineProperty(exp, '__patched__', { value: true });
      Logger.debug(`ModuleLoaderPatcher: Marked ${spec} as patched`);

      // Update IDE status using the service
      IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
        Logger.warn(`ModuleLoaderPatcher: Failed to update extension status for ${extId}: ${error.message}`);
      });

      Logger.info(`ModuleLoaderPatcher: Successfully patched ${spec} exports for extension ${extId}`);
    } catch (error) {
      Logger.error(`ModuleLoaderPatcher: Failed to patch exports for ${spec}`, error as Error);
      throw error;
    }
  }
}

// expose singleton on globalThis
if (!(global as any)[PATCHER_SYMBOL]) {
  (global as any)[PATCHER_SYMBOL] = new ModuleLoaderPatcher();
}
export const moduleLoaderPatcher: ModuleLoaderPatcher = (global as any)[PATCHER_SYMBOL];
