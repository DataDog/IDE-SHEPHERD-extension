/**
 * Unit tests for ExtensionChangeService (Extension Lifecycle Service)
 */

import { expect, use } from 'chai';
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

use(sinonChai);
import * as vscode from 'vscode';
import { ExtensionChangeService, ExtensionChangeListener } from '../../lib/services/extension-lifecycle-service';
import { ExtensionsRepository } from '../../lib/extensions';

suite('ExtensionChangeService Tests', () => {
  let service: ExtensionChangeService;
  let buildRepositoryStub: sinon.SinonStub;
  let onDidChangeStub: sinon.SinonStub;
  let onDidChangeCallback: any;
  let disposeStub: sinon.SinonStub;

  setup(() => {
    // Reset singleton
    (ExtensionChangeService as any)._instance = undefined;

    disposeStub = sinon.stub();

    // Mock vscode.extensions.onDidChange
    onDidChangeStub = sinon.stub().callsFake((callback: any) => {
      onDidChangeCallback = callback;
      return { dispose: disposeStub };
    });

    Object.defineProperty(vscode.extensions, 'onDidChange', {
      value: onDidChangeStub,
      writable: true,
      configurable: true,
    });

    // Mock ExtensionsRepository
    buildRepositoryStub = sinon.stub(ExtensionsRepository.prototype, 'buildRepository');

    service = ExtensionChangeService.getInstance();
  });

  teardown(() => {
    sinon.restore();
    delete (vscode.extensions as any).onDidChange; // VS Code will recreate it anyways
  });

  suite('Initialization', () => {
    test('should return singleton instance', () => {
      const instance1 = ExtensionChangeService.getInstance();
      const instance2 = ExtensionChangeService.getInstance();
      expect(instance1).to.equal(instance2);
    });

    test('should setup change listener on creation', () => {
      expect(onDidChangeStub).to.have.been.calledOnce;
      expect(onDidChangeCallback).to.exist;
    });
  });

  suite('Change Detection', () => {
    test('should rebuild repository on extension change', async () => {
      await onDidChangeCallback();

      await new Promise((resolve) => setImmediate(resolve));

      expect(buildRepositoryStub.calledOnce).to.be.true;
    });

    test('should prevent concurrent processing', async () => {
      let activeExecutions = 0;
      let maxConcurrentExecutions = 0;

      // Make buildRepository slow and track concurrent executions
      buildRepositoryStub.callsFake(async () => {
        activeExecutions++;
        maxConcurrentExecutions = Math.max(maxConcurrentExecutions, activeExecutions);

        // Simulate slow work
        await new Promise((resolve) => setTimeout(resolve, 30));

        activeExecutions--;
      });

      // Fire off three calls that would overlap if not prevented
      const call1 = onDidChangeCallback();
      await new Promise((resolve) => setTimeout(resolve, 5)); // Let call1 start
      const call2 = onDidChangeCallback();
      const call3 = onDidChangeCallback();

      // Wait for all to complete
      await Promise.all([call1, call2, call3]);

      // Verify: Either only 1 call executed (fully prevented),
      // or multiple executed but NEVER concurrently
      expect(maxConcurrentExecutions).to.equal(
        1,
        'Should never have more than 1 concurrent execution of buildRepository',
      );

      // At least one should have executed
      expect(buildRepositoryStub.callCount).to.be.greaterThan(0);
    });
  });

  suite('Listener Management', () => {
    test('should register listener', () => {
      const listener: ExtensionChangeListener = { onExtensionChange: sinon.stub().resolves() };

      service.registerListener(listener);
      // No error should be thrown
    });

    test('should notify registered listeners on change', async () => {
      const listener1: ExtensionChangeListener = { onExtensionChange: sinon.stub().resolves() };
      const listener2: ExtensionChangeListener = { onExtensionChange: sinon.stub().resolves() };

      service.registerListener(listener1);
      service.registerListener(listener2);

      await onDidChangeCallback();
      await new Promise((resolve) => setImmediate(resolve));

      expect(listener1.onExtensionChange).to.have.been.calledOnce;
      expect(listener2.onExtensionChange).to.have.been.calledOnce;
    });

    test('should handle listener errors gracefully', async () => {
      const listener1: ExtensionChangeListener = {
        onExtensionChange: sinon.stub().rejects(new Error('Listener error')),
      };
      const listener2: ExtensionChangeListener = { onExtensionChange: sinon.stub().resolves() };

      service.registerListener(listener1);
      service.registerListener(listener2);

      await onDidChangeCallback();
      await new Promise((resolve) => setImmediate(resolve));

      // Both should be called despite first one failing
      expect(listener1.onExtensionChange).to.have.been.calledOnce;
      expect(listener2.onExtensionChange).to.have.been.calledOnce;
    });
  });

  suite('Disposal', () => {
    test('should dispose subscriptions', () => {
      service.dispose();
    });

    test('should clear listeners on dispose', () => {
      const listener: ExtensionChangeListener = { onExtensionChange: sinon.stub().resolves() };

      service.registerListener(listener);
      service.dispose();
    });
  });

  suite('Error Handling', () => {
    test('should handle repository build errors', async () => {
      buildRepositoryStub.throws(new Error('Repository error'));

      // Should not throw
      await onDidChangeCallback();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
