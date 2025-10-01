/**
 * High level layer to loop through all the modules names and apply the patch
 * will report the status of the patch for each module
 * will receive config params and pass them to the hooks
 */

import { ExtensionInfo } from '../lib/events/ext-events';
import { Logger } from '../lib/logger';
import { CONFIG } from '../lib/config';
import { patchHttpExports } from './instrumentations/http-client-instrument';
import { patchChildProcess } from './instrumentations/child-process-instrument';
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
        
        const toHook: string[] = [];
        for (const moduleGroup of [CONFIG.MODULES.HTTP_MODULES, CONFIG.MODULES.CHILD_PROCESS_MODULES]) {
          toHook.push(...moduleGroup);
        }
        
        if (toHook.includes(request)) {
          self.patchExports(exports, request);
        }
        return exports;
      };

      this.patched = true;
    } catch (error) {
      Logger.error('ModuleLoaderPatcher: Failed to complete patch process', error as Error);
      throw error;
    }
  }

  private patchExports(exp: any, spec: string): void {
    if (!exp || exp.__patched__) {
      Logger.debug(`ModuleLoaderPatcher: Module ${spec} already patched or invalid, skipping`);
      return;
    }

    Logger.debug(`ModuleLoaderPatcher: Patching exports for module: ${spec}`);

    try {
      if (CONFIG.MODULES.HTTP_MODULES.includes(spec)) {
        const protocol: Protocol = spec.includes('https') ? 'https' : 'http';
        patchHttpExports(exp, protocol);
      }

      if (CONFIG.MODULES.CHILD_PROCESS_MODULES.includes(spec)) {
        patchChildProcess(exp);
      }

      Object.defineProperty(exp, '__patched__', { value: true });
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
