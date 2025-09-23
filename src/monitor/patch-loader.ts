/**
 * High level layer to loop through all the modules names and apply the patch
 * will report the status of the patch for each module
 * will receive config params and pass them to the hooks
 */

import { ExtensionInfo } from '../lib/events/ext-events';
import { Logger } from '../lib/logger';
import { CONFIG } from '../lib/config';
import { patchHttpExports } from './instrumentations/http-client-instrument';
import { ExtensionServices } from '../lib/services/ext-service';
import { IDEStatusService } from '../lib/services/ide-status-service';

const { Module } = require('module');

const PATCHER_SYMBOL = Symbol.for('__ideSecPatcher__');

export class ModuleLoaderPatcher {
  private originalLoad!: typeof Module._load;
  private patched = false;

  private restoreMap = new Map<any, { request: Function; get: Function }>();

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
        if (CONFIG.MODULES.HTTP_MODULES.includes(request)) {
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

  // restore original _load and unpatch every module export
  unpatch(): void {
    if (!this.patched) {
      Logger.debug('ModuleLoaderPatcher: Not patched, nothing to unpatch');
      return;
    }

    Logger.info('ModuleLoaderPatcher: Starting unpatch process...');

    try {
      // Restore original Module._load
      Logger.debug('ModuleLoaderPatcher: Restoring original Module._load');
      (Module as any)._load = this.originalLoad;

      // Restore all patched module exports
      Logger.debug(`ModuleLoaderPatcher: Restoring ${this.restoreMap.size} patched module exports`);
      for (const [exp, orig] of this.restoreMap) {
        exp.request = orig.request;
        exp.get = orig.get;
        delete exp.__patched__;
      }

      this.restoreMap.clear();
      IDEStatusService.reset();
      this.patched = false;

      Logger.info('ModuleLoaderPatcher: Unpatch process completed successfully');
    } catch (error) {
      Logger.error('ModuleLoaderPatcher: Failed to complete unpatch process', error as Error);
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
      const protocol: 'http' | 'https' = spec.includes('https') ? 'https' : 'http';
      const extId = ExtensionServices.getExtensionFromParentModule(parent);
      const extensionInfo = new ExtensionInfo(extId, true, Date.now());

      Logger.debug(`ModuleLoaderPatcher: Protocol: ${protocol}, Extension ID: ${extId}`);

      // remember originals so that unpatch() can restore them
      this.restoreMap.set(exp, { request: exp.request, get: exp.get });
      Logger.debug(`ModuleLoaderPatcher: Saved original exports for restoration, ${this.restoreMap.values()}`);

      // Apply the HTTP instrumentation patch
      Logger.debug(`ModuleLoaderPatcher: Applying HTTP instrumentation patch`);
      patchHttpExports(exp, protocol, extensionInfo);

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
