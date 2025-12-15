/**
 * Unit tests for AllowListService
 */

import { expect, use } from 'chai';
const sinonChai = require('sinon-chai');
const sinon = require('sinon');
use(sinonChai);

import { AllowListService } from '../lib/services/allowlist-service';
import { ExtensionsRepository } from '../lib/extensions';
import { createMockExtensionContext, createMockExtension, createBuiltInExtension } from './test-utils';

suite('AllowListService Tests', () => {
  let service: AllowListService;
  let mockContext: any;
  let extensionsRepoStub: sinon.SinonStub;
  let getBuiltInExtensionsStub: sinon.SinonStub;
  let getExtensionsByPublisherStub: sinon.SinonStub;

  setup(async () => {
    // Reset singleton
    (AllowListService as any)._instance = undefined;

    mockContext = createMockExtensionContext();

    // Mock ExtensionsRepository
    const mockExtensionsRepo = { getBuiltInExtensions: sinon.stub(), getExtensionsByPublisher: sinon.stub() };

    extensionsRepoStub = sinon.stub(ExtensionsRepository, 'getInstance').returns(mockExtensionsRepo as any);
    getBuiltInExtensionsStub = mockExtensionsRepo.getBuiltInExtensions;
    getExtensionsByPublisherStub = mockExtensionsRepo.getExtensionsByPublisher;

    // Setup default returns
    getBuiltInExtensionsStub.returns([
      createBuiltInExtension('typescript-language-features'),
      createBuiltInExtension('json-language-features'),
    ]);

    getExtensionsByPublisherStub.returns([]);

    service = AllowListService.getInstance();
    await service.initialize(mockContext);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Initialization', () => {
    test('should return singleton instance', () => {
      const instance1 = AllowListService.getInstance();
      const instance2 = AllowListService.getInstance();
      expect(instance1).to.equal(instance2);
    });

    test('should initialize with context', async () => {
      expect(service).to.exist;
    });

    test('should load saved state from storage', async () => {
      const savedState = { userExtensions: ['test.extension-1.0.0'], trustedPublishers: ['microsoft', 'github'] };

      mockContext.globalState.get.returns(savedState);

      const newService = AllowListService.getInstance();
      await newService.initialize(mockContext);

      expect(newService.getUserAllowList()).to.deep.equal(['test.extension-1.0.0']);
      expect(newService.getTrustedPublishers()).to.include('microsoft');
      expect(newService.getTrustedPublishers()).to.include('github');
    });

    test('should initialize with empty state when no saved data', async () => {
      mockContext.globalState.get.returns(undefined);

      const newService = AllowListService.getInstance();
      await newService.initialize(mockContext);

      expect(newService.getUserAllowList()).to.be.empty;
    });

    test('should initialize built-in allow list', () => {
      const builtInList = service.getBuiltInAllowList();
      expect(builtInList).to.include('vscode.typescript-language-features-1.0.0');
      expect(builtInList).to.include('vscode.json-language-features-1.0.0');
    });
  });

  suite('Built-in AllowList', () => {
    test('should populate built-in extensions from repository', () => {
      const builtInList = service.getBuiltInAllowList();
      expect(builtInList.length).to.equal(2);
    });

    test('should rebuild allow lists when repository changes', () => {
      getBuiltInExtensionsStub.returns([
        createBuiltInExtension('typescript-language-features'),
        createBuiltInExtension('json-language-features'),
        createBuiltInExtension('html-language-features'),
      ]);

      // Force rebuild by getting new instance
      (AllowListService as any)._instance = undefined;
      const newService = AllowListService.getInstance();

      const builtInList = newService.getBuiltInAllowList();
      expect(builtInList.length).to.equal(3);
    });
  });

  suite('User AllowList Operations', () => {
    test('should add extension to user allow list', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');

      const userList = service.getUserAllowList();
      expect(userList).to.include('test.extension-1.0.0');
    });

    test('should save state after adding to user allow list', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');

      expect(mockContext.globalState.update.calledOnce).to.be.true;
      const savedState = mockContext.globalState.update.firstCall.args[1];
      expect(savedState.userExtensions).to.include('test.extension-1.0.0');
    });

    test('should not add duplicate to user allow list', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');
      await service.addToUserAllowList('test.extension-1.0.0');

      const userList = service.getUserAllowList();
      expect(userList.filter((id) => id === 'test.extension-1.0.0').length).to.equal(1);
    });

    test('should not add already allowed extension', async () => {
      // Extension already in built-in list
      await service.addToUserAllowList('vscode.typescript-language-features-1.0.0');

      const userList = service.getUserAllowList();
      expect(userList).to.not.include('vscode.typescript-language-features-1.0.0');
    });

    test('should remove extension from user allow list', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');
      await service.removeFromUserAllowList('test.extension-1.0.0');

      const userList = service.getUserAllowList();
      expect(userList).to.not.include('test.extension-1.0.0');
    });

    test('should save state after removing from user allow list', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');
      mockContext.globalState.update.resetHistory();

      await service.removeFromUserAllowList('test.extension-1.0.0');

      expect(mockContext.globalState.update.calledOnce).to.be.true;
      const savedState = mockContext.globalState.update.firstCall.args[1];
      expect(savedState.userExtensions).to.not.include('test.extension-1.0.0');
    });

    test('should handle removing non-existent extension', async () => {
      await service.removeFromUserAllowList('non.existent-1.0.0');
      // Should not throw
    });

    test('should clear all user allow list entries', async () => {
      await service.addToUserAllowList('test.ext1-1.0.0');
      await service.addToUserAllowList('test.ext2-1.0.0');
      await service.clearUserAllowList();

      const userList = service.getUserAllowList();
      expect(userList).to.be.empty;
    });
  });

  suite('Trusted Publishers', () => {
    test('should have default trusted publishers', () => {
      const publishers = service.getTrustedPublishers();
      expect(publishers).to.include('ms-python');
      expect(publishers).to.include('github');
    });

    test('should add trusted publisher', async () => {
      await service.addTrustedPublisher('lotm');

      const publishers = service.getTrustedPublishers();
      expect(publishers).to.include('lotm');
    });

    test('should save state after adding trusted publisher', async () => {
      await service.addTrustedPublisher('lotm');

      expect(mockContext.globalState.update.called).to.be.true;
      const savedState = mockContext.globalState.update.lastCall.args[1];
      expect(savedState.trustedPublishers).to.include('lotm');
    });

    test('should not add duplicate trusted publisher', async () => {
      await service.addTrustedPublisher('lotm');
      await service.addTrustedPublisher('lotm');

      const publishers = service.getTrustedPublishers();
      expect(publishers.filter((p) => p === 'lotm').length).to.equal(1);
    });

    test('should remove trusted publisher', async () => {
      await service.addTrustedPublisher('lotm');
      await service.removeTrustedPublisher('lotm');

      const publishers = service.getTrustedPublishers();
      expect(publishers).to.not.include('lotm');
    });

    test('should save state after removing trusted publisher', async () => {
      await service.addTrustedPublisher('lotm');
      mockContext.globalState.update.resetHistory();

      await service.removeTrustedPublisher('lotm');

      expect(mockContext.globalState.update.calledOnce).to.be.true;
      const savedState = mockContext.globalState.update.firstCall.args[1];
      expect(savedState.trustedPublishers).to.not.include('lotm');
    });

    test('should handle removing non-existent publisher', async () => {
      await service.removeTrustedPublisher('non-existent');
    });

    test('should check if publisher is trusted', async () => {
      await service.addTrustedPublisher('lotm');

      expect(service.isTrustedPublisher('lotm')).to.be.true;
      expect(service.isTrustedPublisher('unknown')).to.be.false;
    });

    test('should rebuild allow lists after adding trusted publisher', async () => {
      getExtensionsByPublisherStub
        .withArgs('lotm')
        .returns([
          createMockExtension({
            id: 'lotm.extension1-1.0.0',
            packageJSON: { publisher: 'lotm', name: 'extension1', version: '1.0.0' },
          }),
          createMockExtension({
            id: 'lotm.extension2-1.0.0',
            packageJSON: { publisher: 'lotm', name: 'extension2', version: '1.0.0' },
          }),
        ]);

      await service.addTrustedPublisher('lotm');

      const trustedPublisherList = service.getTrustedPublisherAllowList();
      expect(trustedPublisherList).to.include('lotm.extension1-1.0.0');
      expect(trustedPublisherList).to.include('lotm.extension2-1.0.0');
    });

    test('should rebuild allow lists after removing trusted publisher', async () => {
      getExtensionsByPublisherStub
        .withArgs('lotm')
        .returns([
          createMockExtension({
            id: 'lotm.extension1-1.0.0',
            packageJSON: { publisher: 'lotm', name: 'extension1', version: '1.0.0' },
          }),
        ]);

      await service.addTrustedPublisher('lotm');
      await service.removeTrustedPublisher('lotm');

      const trustedPublisherList = service.getTrustedPublisherAllowList();
      expect(trustedPublisherList).to.not.include('lotm.extension1-1.0.0');
    });

    test('should return sorted list of trusted publishers', async () => {
      await service.addTrustedPublisher('zebra');
      await service.addTrustedPublisher('aardvark');

      const publishers = service.getTrustedPublishers();
      const sortedPublishers = [...publishers].sort();
      expect(publishers).to.deep.equal(sortedPublishers);
    });
  });

  suite('Permission Checks', () => {
    test('should allow built-in extensions', () => {
      expect(service.isAllowed('vscode.typescript-language-features-1.0.0')).to.be.true;
    });

    test('should allow user-allowed extensions', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');
      expect(service.isAllowed('test.extension-1.0.0')).to.be.true;
    });

    test('should allow trusted publisher extensions', async () => {
      getExtensionsByPublisherStub
        .withArgs('lotm')
        .returns([
          createMockExtension({
            id: 'lotm.extension-1.0.0',
            packageJSON: { publisher: 'lotm', name: 'extension', version: '1.0.0' },
          }),
        ]);

      await service.addTrustedPublisher('lotm');
      expect(service.isAllowed('lotm.extension-1.0.0')).to.be.true;
    });

    test('should block non-allowed extensions', () => {
      expect(service.isAllowed('untrusted.extension-1.0.0')).to.be.false;
    });

    test('should block extensions from non-trusted publishers', () => {
      expect(service.isAllowed('unknown.publisher-1.0.0')).to.be.false;
    });
  });

  suite('Statistics', () => {
    test('should return correct statistics', () => {
      const stats = service.getStatistics();

      expect(stats.builtInCount).to.equal(2);
      expect(stats.trustedPublisherCount).to.equal(0);
      expect(stats.userCount).to.equal(0);
      expect(stats.totalCount).to.equal(2);
    });

    test('should update statistics after adding to user list', async () => {
      await service.addToUserAllowList('test.extension-1.0.0');

      const stats = service.getStatistics();
      expect(stats.userCount).to.equal(1);
      expect(stats.totalCount).to.equal(3);
    });

    test('should update statistics after adding trusted publisher', async () => {
      getExtensionsByPublisherStub
        .withArgs('lotm')
        .returns([
          createMockExtension({ id: 'lotm.ext1-1.0.0', packageJSON: { publisher: 'lotm' } }),
          createMockExtension({ id: 'lotm.ext2-1.0.0', packageJSON: { publisher: 'lotm' } }),
        ]);

      await service.addTrustedPublisher('lotm');

      const stats = service.getStatistics();
      expect(stats.trustedPublisherCount).to.equal(2);
      expect(stats.totalCount).to.equal(4); // 2 built-in + 2 trusted publisher
    });

    test('should not double-count extensions in multiple lists', async () => {
      // Add a built-in extension to user list (should be ignored)
      await service.addToUserAllowList('vscode.typescript-language-features-1.0.0');

      const stats = service.getStatistics();
      expect(stats.totalCount).to.equal(2); // Still just 2 built-in
    });
  });

  suite('State Persistence', () => {
    test('should handle storage errors gracefully', async () => {
      mockContext.globalState.update.rejects(new Error('Storage error'));

      // Should not throw
      await service.addToUserAllowList('test.extension-1.0.0');
    });

    test('should handle load errors gracefully', async () => {
      mockContext.globalState.get.throws(new Error('Load error'));

      const newService = AllowListService.getInstance();
      await newService.initialize(mockContext);

      // Should still work with empty state
      expect(newService.getUserAllowList()).to.be.empty;
    });
  });
});
