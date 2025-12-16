/**
 * Unit tests for TrustedWorkspaceService
 */

import { expect, use } from 'chai';
const sinon = require('sinon');

import { TrustedWorkspaceService } from '../../lib/services/trusted-workspace-service';
import { createMockExtensionContext } from '../test-utils';

suite('TrustedWorkspaceService Tests', () => {
  let service: TrustedWorkspaceService;
  let mockContext: any;

  setup(async () => {
    // Reset singleton
    (TrustedWorkspaceService as any).instance = undefined;

    mockContext = createMockExtensionContext();
    service = TrustedWorkspaceService.getInstance();
    await service.initialize(mockContext);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Initialization', () => {
    test('should return singleton instance', () => {
      const instance1 = TrustedWorkspaceService.getInstance();
      const instance2 = TrustedWorkspaceService.getInstance();
      expect(instance1).to.equal(instance2);
    });

    test('should initialize with context', async () => {
      expect(service).to.exist;
    });

    test('should load empty trusted workspaces by default', () => {
      mockContext.globalState.get.returns(undefined);
      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.be.an('array');
      expect(workspaces).to.be.empty;
    });

    test('should load saved trusted workspaces from storage', () => {
      const savedState = { trustedWorkspaces: ['/path/to/workspace1', '/path/to/workspace2'] };
      mockContext.globalState.get.returns(savedState);

      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.deep.equal(['/path/to/workspace1', '/path/to/workspace2']);
    });
  });

  suite('Workspace Trust Operations', () => {
    test('getTrustedWorkspaces should return list of trusted workspaces', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      const workspaces = service.getTrustedWorkspaces();

      expect(workspaces).to.include('/path/to/workspace');
    });

    test('isTrusted should return true for trusted workspace', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      expect(service.isTrusted('/path/to/workspace')).to.be.true;
    });

    test('isTrusted should return false for untrusted workspace', () => {
      expect(service.isTrusted('/path/to/untrusted')).to.be.false;
    });

    test('addToTrustedWorkspaces should add workspace to trusted list', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');

      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.include('/path/to/workspace');
    });

    test('addToTrustedWorkspaces should save state', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');

      expect(mockContext.globalState.update.calledOnce).to.be.true;
      const savedState = mockContext.globalState.update.firstCall.args[1];
      expect(savedState.trustedWorkspaces).to.include('/path/to/workspace');
    });

    test('addToTrustedWorkspaces should not add duplicates', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      await service.addToTrustedWorkspaces('/path/to/workspace');

      const workspaces = service.getTrustedWorkspaces();
      const count = workspaces.filter((w) => w === '/path/to/workspace').length;
      expect(count).to.equal(1);
    });

    test('addToTrustedWorkspaces should handle already trusted workspace', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      mockContext.globalState.update.resetHistory();

      await service.addToTrustedWorkspaces('/path/to/workspace');

      // Should not save again
      expect(mockContext.globalState.update.called).to.be.false;
    });

    test('removeFromTrustedWorkspaces should remove workspace', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      await service.removeFromTrustedWorkspaces('/path/to/workspace');

      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.not.include('/path/to/workspace');
    });

    test('removeFromTrustedWorkspaces should save state', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      mockContext.globalState.update.resetHistory();

      await service.removeFromTrustedWorkspaces('/path/to/workspace');

      expect(mockContext.globalState.update.calledOnce).to.be.true;
      const savedState = mockContext.globalState.update.firstCall.args[1];
      expect(savedState.trustedWorkspaces).to.not.include('/path/to/workspace');
    });

    test('removeFromTrustedWorkspaces should handle non-existent workspace', async () => {
      // Should not throw
      await service.removeFromTrustedWorkspaces('/path/to/nonexistent');
      expect(mockContext.globalState.update.called).to.be.true;
    });

    test('removeFromTrustedWorkspaces should only remove specified workspace', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace1');
      await service.addToTrustedWorkspaces('/path/to/workspace2');
      await service.removeFromTrustedWorkspaces('/path/to/workspace1');

      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.not.include('/path/to/workspace1');
      expect(workspaces).to.include('/path/to/workspace2');
    });

    test('clearTrustedWorkspaces should remove all workspaces', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace1');
      await service.addToTrustedWorkspaces('/path/to/workspace2');
      await service.clearTrustedWorkspaces();

      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.be.empty;
    });

    test('clearTrustedWorkspaces should save state', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      mockContext.globalState.update.resetHistory();

      await service.clearTrustedWorkspaces();

      expect(mockContext.globalState.update.calledOnce).to.be.true;
      const savedState = mockContext.globalState.update.firstCall.args[1];
      expect(savedState.trustedWorkspaces).to.be.empty;
    });

    test('getTrustedWorkspaceCount should return correct count', async () => {
      expect(service.getTrustedWorkspaceCount()).to.equal(0);

      await service.addToTrustedWorkspaces('/path/to/workspace1');
      expect(service.getTrustedWorkspaceCount()).to.equal(1);

      await service.addToTrustedWorkspaces('/path/to/workspace2');
      expect(service.getTrustedWorkspaceCount()).to.equal(2);

      await service.removeFromTrustedWorkspaces('/path/to/workspace1');
      expect(service.getTrustedWorkspaceCount()).to.equal(1);
    });
  });

  suite('Multiple Workspaces', () => {
    test('should handle multiple trusted workspaces', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace1');
      await service.addToTrustedWorkspaces('/path/to/workspace2');
      await service.addToTrustedWorkspaces('/path/to/workspace3');

      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces.length).to.equal(3);
      expect(workspaces).to.include.members(['/path/to/workspace1', '/path/to/workspace2', '/path/to/workspace3']);
    });

    test('should correctly check trust for multiple workspaces', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace1');
      await service.addToTrustedWorkspaces('/path/to/workspace2');

      expect(service.isTrusted('/path/to/workspace1')).to.be.true;
      expect(service.isTrusted('/path/to/workspace2')).to.be.true;
      expect(service.isTrusted('/path/to/workspace3')).to.be.false;
    });
  });

  suite('Path Variations', () => {
    test('should handle Unix-style paths', async () => {
      await service.addToTrustedWorkspaces('/Users/user/projects/myapp');
      expect(service.isTrusted('/Users/user/projects/myapp')).to.be.true;
    });

    test('should handle Windows-style paths', async () => {
      await service.addToTrustedWorkspaces('C:\\Users\\user\\projects\\myapp');
      expect(service.isTrusted('C:\\Users\\user\\projects\\myapp')).to.be.true;
    });

    test('should handle paths with spaces', async () => {
      await service.addToTrustedWorkspaces('/path/to/my workspace');
      expect(service.isTrusted('/path/to/my workspace')).to.be.true;
    });

    test('should handle paths with special characters', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace-123_test@2024');
      expect(service.isTrusted('/path/to/workspace-123_test@2024')).to.be.true;
    });

    test('should be case-sensitive for paths', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      expect(service.isTrusted('/path/to/workspace')).to.be.true;
      expect(service.isTrusted('/path/to/Workspace')).to.be.false;
    });
  });

  suite('Error Handling', () => {
    test('should handle storage errors on add', async () => {
      mockContext.globalState.update.rejects(new Error('Storage error'));

      try {
        await service.addToTrustedWorkspaces('/path/to/workspace');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal('Storage error');
      }
    });

    test('should handle storage errors on remove', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      mockContext.globalState.update.rejects(new Error('Storage error'));

      try {
        await service.removeFromTrustedWorkspaces('/path/to/workspace');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal('Storage error');
      }
    });

    test('should handle storage errors on clear', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');
      mockContext.globalState.update.rejects(new Error('Storage error'));

      try {
        await service.clearTrustedWorkspaces();
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal('Storage error');
      }
    });

    test('should handle missing context gracefully', () => {
      mockContext.globalState.get.returns(undefined);
      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.be.an('array');
    });

    test('should handle malformed storage data', () => {
      mockContext.globalState.get.returns({ invalid: 'data' });
      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.be.an('array');
      expect(workspaces).to.be.empty;
    });

    test('should handle null in storage', () => {
      mockContext.globalState.get.returns(null);
      const workspaces = service.getTrustedWorkspaces();
      expect(workspaces).to.be.an('array');
      expect(workspaces).to.be.empty;
    });
  });

  suite('State Persistence', () => {
    test('should persist across service instances', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');

      // Get saved state
      const savedState = mockContext._getGlobalStateMap().get('trustedWorkspaces');

      // Create new service instance
      (TrustedWorkspaceService as any).instance = undefined;
      mockContext.globalState.get.returns(savedState);

      const newService = TrustedWorkspaceService.getInstance();
      await newService.initialize(mockContext);

      expect(newService.isTrusted('/path/to/workspace')).to.be.true;
    });

    test('should use correct storage key', async () => {
      await service.addToTrustedWorkspaces('/path/to/workspace');

      const storageKey = mockContext.globalState.update.firstCall.args[0];
      expect(storageKey).to.equal('trustedWorkspaces');
    });
  });
});
