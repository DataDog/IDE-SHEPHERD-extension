/**
 * Unit tests for ExtensionServices
 */

import * as assert from 'assert';
import { ExtensionServices } from '../lib/services/ext-service';

suite('ExtensionServices Tests', () => {
  test('_isSystemPath should detect homebrew paths', () => {
    assert.strictEqual(ExtensionServices._isSystemPath('/opt/homebrew/bin/git'), true);
    assert.strictEqual(ExtensionServices._isSystemPath('at /opt/homebrew/bin/git (file.js:10:5)'), true);
  });

  test('_isSystemPath should detect usr/local paths', () => {
    assert.strictEqual(ExtensionServices._isSystemPath('/usr/local/bin/node'), true);
  });

  test('_isSystemPath should detect system bin paths', () => {
    assert.strictEqual(ExtensionServices._isSystemPath('/usr/bin/python'), true);
    assert.strictEqual(ExtensionServices._isSystemPath('/bin/bash'), true);
  });

  test('_isSystemPath should not detect extension paths', () => {
    assert.strictEqual(
      ExtensionServices._isSystemPath('/Users/user/.vscode/extensions/publisher.extension-1.0.0/index.js'),
      false,
    );
  });

  test('_isSystemPath should detect Windows system paths', () => {
    assert.strictEqual(ExtensionServices._isSystemPath('C:\\Windows\\System32\\cmd.exe'), true);
    assert.strictEqual(ExtensionServices._isSystemPath('C:\\Program Files\\Git\\bin\\git.exe'), true);
  });

  test('_shouldSkipStackLine should skip ide-shepherd lines', () => {
    assert.strictEqual(ExtensionServices._shouldSkipStackLine('at ide-shepherd/lib/something.js:10:5'), true);
  });

  test('_shouldSkipStackLine should skip node internal lines', () => {
    assert.strictEqual(ExtensionServices._shouldSkipStackLine('at node:internal/modules/cjs/loader:1234:5'), true);
  });

  test('_shouldSkipStackLine should not skip valid extension lines', () => {
    assert.strictEqual(
      ExtensionServices._shouldSkipStackLine('at /Users/user/.vscode/extensions/publisher.ext/index.js:10:5'),
      false,
    );
  });
});
