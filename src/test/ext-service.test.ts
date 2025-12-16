/**
 * Unit tests for ExtensionServices
 * We're defaulting to macOS for most tests :p
 */

import { expect } from 'chai';
import { ExtensionServices } from '../lib/services/ext-service';
import { IDEStatusService } from '../lib/services/ide-status-service';
import { PlatformType } from '../lib/ide-status';
const sinon = require('sinon');

suite('ExtensionServices Tests', () => {
  let getPlatformStub: sinon.SinonStub;

  setup(() => {
    getPlatformStub = sinon.stub(IDEStatusService, 'getPlatform').returns(PlatformType.MACOS);
  });

  teardown(() => {
    sinon.restore();
  });

  suite('_isSystemPath', () => {
    test('should detect homebrew paths', () => {
      expect(ExtensionServices._isSystemPath('/opt/homebrew/bin/git')).to.be.true;
      expect(ExtensionServices._isSystemPath('at /opt/homebrew/bin/git (file.js:10:5)')).to.be.true;
    });

    test('should detect usr/local paths', () => {
      expect(ExtensionServices._isSystemPath('/usr/local/bin/node')).to.be.true;
    });

    test('should detect system bin paths', () => {
      expect(ExtensionServices._isSystemPath('/usr/bin/python')).to.be.true;
      expect(ExtensionServices._isSystemPath('/bin/bash')).to.be.true;
      expect(ExtensionServices._isSystemPath('/usr/lib/library.so')).to.be.true;
    });

    test('should detect System paths on macOS', () => {
      expect(ExtensionServices._isSystemPath('/System/Library/Frameworks/Something')).to.be.true;
    });

    test('should detect Windows system paths', () => {
      expect(ExtensionServices._isSystemPath('C:\\Windows\\System32\\cmd.exe')).to.be.true;
      expect(ExtensionServices._isSystemPath('C:\\Program Files\\Git\\bin\\git.exe')).to.be.true;
    });

    test('should not detect extension paths', () => {
      expect(ExtensionServices._isSystemPath('/Users/user/.vscode/extensions/publisher.extension-1.0.0/index.js')).to.be
        .false;
    });

    test('should not detect user paths', () => {
      expect(ExtensionServices._isSystemPath('/Users/user/projects/myapp/index.js')).to.be.false;
      expect(ExtensionServices._isSystemPath('C:\\Users\\user\\Documents\\project\\file.js')).to.be.false;
    });
  });

  suite('_shouldSkipStackLine', () => {
    test('should skip ide-shepherd lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at ide-shepherd/lib/something.js:10:5')).to.be.true;
      expect(ExtensionServices._shouldSkipStackLine('at Object.<anonymous> (ide-shepherd/index.js:1:1)')).to.be.true;
    });

    test('should skip node internal lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at node:internal/modules/cjs/loader:1234:5')).to.be.true;
      expect(ExtensionServices._shouldSkipStackLine('at node:internal/process/task_queues:95:5')).to.be.true;
    });

    test('should skip Module._load lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at Module._load (internal/modules/cjs/loader.js:863:27)')).to.be
        .true;
    });

    test('should skip at Object.Module. lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at Object.Module._extensions..js (module.js:579:10)')).to.be.true;
    });

    test('should skip at Module.require lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at Module.require (internal/modules/cjs/loader.js:1025:19)')).to.be
        .true;
    });

    test('should not skip valid extension lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at /Users/user/.vscode/extensions/publisher.ext/index.js:10:5')).to
        .be.false;
    });

    test('should not skip user code lines', () => {
      expect(ExtensionServices._shouldSkipStackLine('at Object.<anonymous> (/workspace/app.js:42:10)')).to.be.false;
    });
  });

  suite('_extractExtensionFromPath', () => {
    test('should extract from user extensions path', () => {
      const result = ExtensionServices._extractExtensionFromPath(
        '/Users/user/.vscode/extensions/publisher.extension-1.0.0/out/index.js',
      );
      expect(result).to.equal('publisher.extension-1.0.0');
    });

    test('should extract from vscode-insiders path', () => {
      const result = ExtensionServices._extractExtensionFromPath(
        '/Users/user/.vscode-insiders/extensions/test.ext-2.5.0/lib/main.js',
      );
      expect(result).to.equal('test.ext-2.5.0');
    });

    test('should extract from built-in extensions path', () => {
      const result = ExtensionServices._extractExtensionFromPath(
        '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/typescript-language-features/out/extension.js',
      );
      expect(result).to.equal('typescript-language-features');
    });

    test('should extract from Windows built-in path', () => {
      const result = ExtensionServices._extractExtensionFromPath(
        'C:\\Program Files\\Microsoft VS Code\\resources\\app\\extensions\\json-language-features\\server\\out\\node\\jsonServerMain.js',
      );
      expect(result).to.equal('json-language-features');
    });

    test('should extract from portable installation', () => {
      const result = ExtensionServices._extractExtensionFromPath(
        '/opt/vscode-portable/data/extensions/company.extension-1.0.0/index.js',
      );
      expect(result).to.equal('company.extension-1.0.0');
    });

    test('should return core-or-unknown for unrecognized paths', () => {
      const result = ExtensionServices._extractExtensionFromPath('/some/random/path/file.js');
      expect(result).to.equal('core-or-unknown');
    });

    test('should handle empty path', () => {
      const result = ExtensionServices._extractExtensionFromPath('');
      expect(result).to.equal('unknown');
    });

    test('should handle null/undefined path', () => {
      const result1 = ExtensionServices._extractExtensionFromPath(null as any);
      const result2 = ExtensionServices._extractExtensionFromPath(undefined as any);
      expect(result1).to.equal('unknown');
      expect(result2).to.equal('unknown');
    });
  });

  suite('getCallContext', () => {
    test('should detect extension from stack trace on macOS', () => {
      getPlatformStub.returns(PlatformType.MACOS);

      // Stub Error constructor to return mock stack
      const mockStack = `Error
    at ExtensionServices.getCallContext (/mock/ide-shepherd/ext-service.js:20:20)
    at someFunction (/Users/user/.vscode/extensions/test.extension-1.0.0/index.js:42:10)
    at Object.<anonymous> (/Users/user/.vscode/extensions/test.extension-1.0.0/main.js:100:5)`;

      const OriginalError = global.Error;
      const MockError: any = function (this: any, message?: string) {
        const err = new OriginalError(message);
        err.stack = mockStack;
        return err;
      };
      MockError.prototype = OriginalError.prototype;
      (global as any).Error = MockError;

      const result = ExtensionServices.getCallContext();
      expect(result.extension).to.equal('test.extension-1.0.0');

      // Restore
      (global as any).Error = OriginalError;
    });

    test('should detect extension from stack trace on Windows', () => {
      getPlatformStub.returns(PlatformType.WINDOWS);

      const mockStack = `Error
    at ExtensionServices.getCallContext (C:\\ide-shepherd\\ext-service.js:20:20)
    at someFunction (C:\\Users\\user\\.vscode\\extensions\\test.extension-1.0.0\\index.js:42:10)`;

      const OriginalError = global.Error;
      const MockError: any = function (this: any, message?: string) {
        const err = new OriginalError(message);
        err.stack = mockStack;
        return err;
      };
      MockError.prototype = OriginalError.prototype;
      (global as any).Error = MockError;

      const result = ExtensionServices.getCallContext();
      expect(result.extension).to.equal('test.extension-1.0.0');

      (global as any).Error = OriginalError;
    });

    test('should detect built-in extension from stack trace', () => {
      const mockStack = `Error
    at ExtensionServices.getCallContext (/mock/ide-shepherd/ext-service.js:20:20)
    at handler (/app/extensions/typescript-language-features/out/extension.js:500:15)`;

      const OriginalError = global.Error;
      const MockError: any = function (this: any, message?: string) {
        const err = new OriginalError(message);
        err.stack = mockStack;
        return err;
      };
      MockError.prototype = OriginalError.prototype;
      (global as any).Error = MockError;

      const result = ExtensionServices.getCallContext();
      expect(result.extension).to.equal('typescript-language-features');

      (global as any).Error = OriginalError;
    });

    test('should detect system binary from stack trace', () => {
      const mockStack = `Error
    at ExtensionServices.getCallContext (/mock/ide-shepherd/ext-service.js:20:20)
    at /opt/homebrew/bin/git`;

      const OriginalError = global.Error;
      const MockError: any = function (this: any, message?: string) {
        const err = new OriginalError(message);
        err.stack = mockStack;
        return err;
      };
      MockError.prototype = OriginalError.prototype;
      (global as any).Error = MockError;

      const result = ExtensionServices.getCallContext();
      expect(result.extension).to.equal('system:git');

      (global as any).Error = OriginalError;
    });

    test('should return caller:unknown when no extension found', () => {
      const mockStack = `Error
    at ExtensionServices.getCallContext (/mock/ide-shepherd/ext-service.js:20:20)
    at Module._load (internal/modules/cjs/loader.js:863:27)
    at node:internal/process/task_queues:95:5`;

      const OriginalError = global.Error;
      const MockError: any = function (this: any, message?: string) {
        const err = new OriginalError(message);
        err.stack = mockStack;
        return err;
      };
      MockError.prototype = OriginalError.prototype;
      (global as any).Error = MockError;

      const result = ExtensionServices.getCallContext();
      expect(result.extension).to.equal('caller:unknown');

      (global as any).Error = OriginalError;
    });

    test('should return unknown-stack when no stack available', () => {
      const OriginalError = global.Error;
      const MockError: any = function (this: any, message?: string) {
        const err = new OriginalError(message);
        err.stack = undefined;
        return err;
      };
      MockError.prototype = OriginalError.prototype;
      (global as any).Error = MockError;

      const result = ExtensionServices.getCallContext();
      expect(result.extension).to.equal('unknown-stack');

      (global as any).Error = OriginalError;
    });

    test('should return stack-error on exception', () => {
      const OriginalError = global.Error;
      try {
        const MockError: any = function (this: any, message?: string) {
          const err = new OriginalError(message);
          Object.defineProperty(err, 'stack', {
            get: function () {
              throw new OriginalError('Stack access failed');
            },
            configurable: true,
          });
          return err;
        };
        MockError.prototype = OriginalError.prototype;
        (global as any).Error = MockError;

        const result = ExtensionServices.getCallContext();
        expect(result.extension).to.equal('stack-error');
      } finally {
        (global as any).Error = OriginalError;
      }
    });
  });
});
