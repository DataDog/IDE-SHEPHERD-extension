/**
 * Unit tests for AnalysisResult
 */

import { expect, use } from 'chai';
const sinon = require('sinon');
import { AnalysisResult } from '../../monitor/analysis/analyzer';
import { SecurityEvent, SeverityLevel } from '../../lib/events/sec-events';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { ExecEvent } from '../../lib/events/process-events';
import { createMockExtensionInfo } from '../test-utils';
import { ProcessRuleType } from '../../detection/process-rules';

suite('AnalysisResult Tests', () => {
  let allowListStub: sinon.SinonStub;
  let emitSecurityEventStub: sinon.SinonStub;

  setup(() => {
    // Mock AllowListService
    const mockAllowListService = { isAllowed: sinon.stub().returns(false) };
    allowListStub = sinon.stub(AllowListService, 'getInstance').returns(mockAllowListService as any);

    // Mock IDEStatusService
    emitSecurityEventStub = sinon.stub(IDEStatusService, 'emitSecurityEvent').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Construction', () => {
    test('should create with default allowed verdict', () => {
      const result = new AnalysisResult();

      expect(result.verdict).to.exist;
      expect(result.verdict.allowed).to.be.true;
      expect(result.securityEvent).to.be.undefined;
    });

    test('should create with provided verdict', () => {
      const result = new AnalysisResult({ allowed: false });

      expect(result.verdict.allowed).to.be.false;
      expect(result.securityEvent).to.be.undefined;
    });

    test('should create with verdict and security event', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        {
          finding: 'curl http://example.com',
          rule: 'Test Rule',
          description: 'Test description',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);

      expect(result.verdict.allowed).to.be.false;
      expect(result.securityEvent).to.equal(securityEvent);
    });
  });

  suite('checkAgainstAllowList', () => {
    test('should return self if no security event', () => {
      const result = new AnalysisResult({ allowed: true });

      const checked = result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(checked).to.equal(result);
    });

    test('should return allowed result for allowed extension', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        {
          finding: 'curl http://example.com',
          rule: 'Test Rule',
          description: 'Test description',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      const checked = result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(checked.verdict.allowed).to.be.true;
      expect(checked.securityEvent).to.be.undefined;
    });

    test('should call isAllowed with extension ID', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(mockAllowListService.isAllowed).to.have.been.calledWith('test.extension');
    });

    test('should emit security event for non-allowed extension', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      const checked = result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(emitSecurityEventStub).to.have.been.calledWith(securityEvent);
      expect(checked).to.equal(result);
    });

    test('should return original result for non-allowed extension', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      const checked = result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(checked.verdict.allowed).to.be.false;
      expect(checked.securityEvent).to.equal(securityEvent);
    });

    test('should not emit security event for allowed extension', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(emitSecurityEventStub).to.not.have.been.called;
    });
  });

  suite('Verdict Behavior', () => {
    test('should preserve blocked verdict for non-allowed extension', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      const checked = result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(checked.verdict).to.deep.equal({ allowed: false });
    });

    test('should change verdict to allowed for allowed extension', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);
      const checked = result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer');

      expect(checked.verdict).to.deep.equal({ allowed: true });
    });
  });

  suite('Error Handling', () => {
    test('should handle emitSecurityEvent failure', async () => {
      emitSecurityEventStub.rejects(new Error('Emit failed'));

      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);

      // Should not throw even if emitSecurityEvent fails
      expect(() => result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer')).to.not.throw();
    });

    // We may wanna change this behavior to a more lenient one, depending on the use case
    // ie, if unclear do not block the extension
    test('should handle isAllowed failure', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.throws(new Error('AllowList error'));

      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const securityEvent = new SecurityEvent(event, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, [
        { finding: 'curl', rule: 'Test Rule', description: 'Test', confidence: 1, severity: SeverityLevel.HIGH },
      ]);

      const result = new AnalysisResult({ allowed: false }, securityEvent);

      // Should throw since we can't determine if extension is allowed
      expect(() => result.checkAgainstAllowList('test.extension', 'test context', 'TestAnalyzer')).to.throw();
    });
  });

  suite('Context Parameter', () => {
    test('should accept any context string', () => {
      const result = new AnalysisResult();

      expect(() => result.checkAgainstAllowList('ext', 'some context', 'Analyzer')).to.not.throw();
      expect(() => result.checkAgainstAllowList('ext', 'https://example.com', 'NetworkAnalyzer')).to.not.throw();
      expect(() => result.checkAgainstAllowList('ext', 'curl http://test', 'ProcessAnalyzer')).to.not.throw();
    });
  });
});
