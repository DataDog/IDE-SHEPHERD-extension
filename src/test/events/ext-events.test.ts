/**
 * Unit tests for Extension Events
 */

import { expect } from 'chai';
import { ExtensionInfo, WorkspaceInfo } from '../../lib/events/ext-events';

suite('ExtensionEvent Tests', () => {
  suite('ExtensionInfo', () => {
    test('should create with all properties', () => {
      const info = new ExtensionInfo('test.extension', true, 12345);

      expect(info.id).to.equal('test.extension');
      expect(info.isPatched).to.be.true;
      expect(info.patchedAt).to.equal(12345);
    });

    test('should create without patchedAt', () => {
      const info = new ExtensionInfo('test.extension', false);

      expect(info.id).to.equal('test.extension');
      expect(info.isPatched).to.be.false;
      expect(info.patchedAt).to.be.undefined;
    });
  });

  suite('WorkspaceInfo', () => {
    test('should create with all properties', () => {
      const info = new WorkspaceInfo('test-workspace', '/path/to/workspace', true, 12345);

      expect(info.name).to.equal('test-workspace');
      expect(info.path).to.equal('/path/to/workspace');
      expect(info.isTrusted).to.be.true;
      expect(info.trustedAt).to.equal(12345);
    });

    test('should create without trustedAt', () => {
      const info = new WorkspaceInfo('test-workspace', '/path/to/workspace', false);

      expect(info.name).to.equal('test-workspace');
      expect(info.path).to.equal('/path/to/workspace');
      expect(info.isTrusted).to.be.false;
      expect(info.trustedAt).to.be.undefined;
    });
  });
});
