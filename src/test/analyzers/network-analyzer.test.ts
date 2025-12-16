/**
 * Unit tests for NetworkAnalyzer
 */

import { expect, use } from 'chai';
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

use(sinonChai);
import { NetworkAnalyzer } from '../../monitor/analysis/network-analyzer';
import { NetworkEvent } from '../../lib/events/network-events';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { createMockExtensionInfo } from '../test-utils';

suite('NetworkAnalyzer Tests', () => {
  let analyzer: NetworkAnalyzer;
  let allowListStub: sinon.SinonStub;
  let updatePerformanceMetricsStub: sinon.SinonStub;
  let emitSecurityEventStub: sinon.SinonStub;

  setup(() => {
    analyzer = new NetworkAnalyzer();

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
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result).to.exist;
      expect(result).to.have.property('verdict');
    });

    test('should analyze request:pre phase', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    // since we currently only support request:pre phase, we should not analyze other phases
    test('should not analyze other phases', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:post', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should check against allow list', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      analyzer.analyze(event);

      expect(AllowListService.getInstance().isAllowed).to.have.been.calledWith('test.extension');
    });

    test('should record performance metrics', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      analyzer.analyze(event);

      expect(updatePerformanceMetricsStub.called).to.be.true;
    });

    test('should handle missing extension info', () => {
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, undefined as any);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });
  });

  suite('URL Analysis - Suspicious Domains', () => {
    test('should detect bit.ly URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://bit.ly/abc123', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
      expect(result!.securityEvent!.iocs[0].rule).to.include('Suspicious Domains');
    });

    test('should detect workers.dev URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://myapp.workers.dev', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect ngrok.io URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://abc123.ngrok.io', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect ngrok-free.app URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://test.ngrok-free.app', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect webhook.site URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://webhook.site/unique-id',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect burpcollaborator URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://test.burpcollaborator.net',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect localhost.run URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://test.localhost.run', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('URL Analysis - Exfiltration Domains', () => {
    test('should detect discord.com URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://discord.com/api/webhooks/123',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent!.iocs[0].rule).to.include('Exfiltration Domains');
    });

    test('should detect transfer.sh URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://transfer.sh', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect pastebin.com URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://pastebin.com/raw/abc123',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect api.telegram.org URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://api.telegram.org/bot123',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('URL Analysis - Malware Download Domains', () => {
    test('should detect files.catbox.moe URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://files.catbox.moe/file.exe',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent!.iocs[0].rule).to.include('Malware Download Domains');
    });

    test('should detect solidity.bot URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://solidity.bot/api', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('URL Analysis - Intelligence Domains', () => {
    test('should detect ipinfo.io URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ipinfo.io', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent!.iocs[0].rule).to.include('Intel Domains');
    });

    test('should detect ipify.org URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://api.ipify.org', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should detect ifconfig.me URL', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ifconfig.me', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('IP Analysis', () => {
    test('should detect external IP address', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://93.184.216.34', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent!.iocs[0].rule).to.include('Unknown External IP');
    });

    test('should allow local IP 127.0.0.1', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://127.0.0.1:3000', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow local IP 10.x.x.x', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://10.0.0.1', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow local IP 192.168.x.x', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://192.168.1.1', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow local IP 172.16-31.x.x', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://172.16.0.1', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow wildcard IP 0.0.0.0', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://0.0.0.0:8080', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should detect external IP with port', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://93.184.216.34:8080', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });

  suite('Safe URLs', () => {
    test('should allow github.com', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://github.com/user/repo', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow npmjs.org', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent(
        'https',
        'https://registry.npmjs.org/package',
        'request:pre',
        __filename,
        extensionInfo,
      );

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow microsoft.com', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://microsoft.com', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should allow localhost with domain name', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://localhost:3000', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
    });
  });

  suite('SecurityEventCreation', () => {
    test('should create SecurityEvent for detected threats', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.securityEvent).to.exist;
      expect(result!.securityEvent!.extension).to.exist;
      expect(result!.securityEvent!.extension!.id).to.equal('test.extension');
    });

    test('should include IoC in SecurityEvent', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://webhook.site/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.securityEvent!.iocs).to.have.length.greaterThan(0);
      const ioc = result!.securityEvent!.iocs[0];
      expect(ioc.finding).to.exist;
      expect(ioc.rule).to.exist;
      expect(ioc.description).to.exist;
    });

    test('should include matched URL in finding', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://bit.ly/abc123', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      const ioc = result!.securityEvent!.iocs[0];
      expect(ioc.finding).to.include('bit.ly');
    });
  });

  suite('Allow List Integration', () => {
    test('should bypass detection for allowed extensions', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const extensionInfo = createMockExtensionInfo('trusted.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.true;
      expect(emitSecurityEventStub.called).to.be.false;
    });

    test('should block detection for non-allowed extensions', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const extensionInfo = createMockExtensionInfo('untrusted.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
      expect(emitSecurityEventStub.called).to.be.true;
    });
  });

  suite('Error Handling', () => {
    test('should handle exceptions gracefully', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

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
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      // Should not throw
      expect(() => analyzer.analyze(event)).to.not.throw();
    });
  });

  suite('Protocol Variations', () => {
    test('should analyze http protocol', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('http', 'http://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });

    test('should analyze https protocol', () => {
      const extensionInfo = createMockExtensionInfo('test.extension', true);
      const event = new NetworkEvent('https', 'https://ngrok.io/test', 'request:pre', __filename, extensionInfo);

      const result = analyzer.analyze(event);

      expect(result!.verdict.allowed).to.be.false;
    });
  });
});
