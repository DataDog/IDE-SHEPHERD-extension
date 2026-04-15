/**
 * Unit tests for FsAnalyzer
 */

import { expect, use } from 'chai';
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

use(sinonChai);
import { FsAnalyzer } from '../../monitor/analysis/fs-analyzer';
import { FsEvent } from '../../lib/events/fs-events';
import { FsOperation } from '../../lib/events/fs-events';
import { FS_RULES } from '../../detection/fs-rules';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { createMockExtensionInfo } from '../test-utils';

function makeEvent(filePath: string, operation: FsOperation = 'read'): FsEvent {
  const ext = createMockExtensionInfo('test.extension', true);
  return new FsEvent(filePath, operation, __filename, ext);
}

suite('FsAnalyzer Tests', () => {
  let analyzer: FsAnalyzer;
  let allowListStub: sinon.SinonStub;
  let updatePerformanceMetricsStub: sinon.SinonStub;
  let emitSecurityEventStub: sinon.SinonStub;

  setup(() => {
    analyzer = new FsAnalyzer();

    const mockAllowListService = { isAllowed: sinon.stub().returns(false) };
    allowListStub = sinon.stub(AllowListService, 'getInstance').returns(mockAllowListService as any);

    updatePerformanceMetricsStub = sinon.stub(IDEStatusService, 'updatePerformanceMetrics').resolves();
    emitSecurityEventStub = sinon.stub(IDEStatusService, 'emitSecurityEvent').resolves();
  });

  teardown(() => {
    sinon.restore();
  });

  // ── Core ────────────────────────────────────────────────────────────────────

  suite('Analysis Core', () => {
    test('should return AnalysisResult for safe path', () => {
      const result = analyzer.analyze(makeEvent('/home/user/projects/app/src/index.ts'));

      expect(result).to.exist;
      expect(result!.verdict.allowed).to.be.true;
      expect(result!.securityEvent).to.be.undefined;
    });

    test('should detect sensitive file read', () => {
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should stop on first matching rule', () => {
      // authorized_keys matches both "read_ssh_private_key" (no) but write_authorized_keys on write
      // Use a path that could match multiple write rules if they existed
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/authorized_keys', 'write'));

      expect(result!.securityEvent).to.exist;
      expect(result!.securityEvent!.iocs).to.have.length(1);
    });

    test('should check against allow list', () => {
      analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(AllowListService.getInstance().isAllowed).to.have.been.calledWith('test.extension');
    });

    test('should record performance metrics', () => {
      analyzer.analyze(makeEvent('/home/user/safe.txt'));

      expect(updatePerformanceMetricsStub.called).to.be.true;
    });

    test('should handle missing extension info', () => {
      const ev = new FsEvent('/home/user/.ssh/id_rsa', 'read', __filename, undefined as any);
      const result = analyzer.analyze(ev);

      expect(result!.verdict.allowed).to.be.true;
    });

    test('should handle exceptions gracefully', () => {
      allowListStub.throws(new Error('service error'));
      const ev = makeEvent('/home/user/.ssh/id_rsa', 'read');

      const result = analyzer.analyze(ev);

      expect(result).to.exist;
      expect(result!.verdict.allowed).to.be.true;
    });
  });

  // ── Path normalization ───────────────────────────────────────────────────────

  suite('Windows Path Normalization', () => {
    test('should normalize backslashes before matching — SSH key', () => {
      const result = analyzer.analyze(makeEvent('C:\\Users\\user\\.ssh\\id_rsa', 'read'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should normalize backslashes before matching — AWS credentials', () => {
      const result = analyzer.analyze(makeEvent('C:\\Users\\user\\.aws\\credentials', 'read'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should normalize backslashes before matching — authorized_keys write', () => {
      const result = analyzer.analyze(makeEvent('C:\\ProgramData\\ssh\\administrators_authorized_keys', 'write'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should normalize backslashes — Windows hosts file write', () => {
      const result = analyzer.analyze(makeEvent('C:\\Windows\\System32\\drivers\\etc\\hosts', 'write'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('should normalize backslashes — Windows LaunchAgent plist write', () => {
      const result = analyzer.analyze(
        makeEvent(
          'C:\\Users\\user\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\evil.exe',
          'write',
        ),
      );

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });
  });

  // ── Operation filtering ──────────────────────────────────────────────────────

  suite('Operation Filtering', () => {
    test('read rule should not fire on write operation', () => {
      // read_ssh_private_key only applies to operation: 'read'
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'write'));

      expect(result!.verdict.allowed).to.be.true;
      expect(result!.securityEvent).to.be.undefined;
    });

    test('write rule should not fire on read operation', () => {
      // write_authorized_keys only applies to write/append
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/authorized_keys', 'read'));

      expect(result!.verdict.allowed).to.be.true;
      expect(result!.securityEvent).to.be.undefined;
    });

    test('write rule should fire on append operation', () => {
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/authorized_keys', 'append'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });

    test('write_cron should fire on append', () => {
      const result = analyzer.analyze(makeEvent('/etc/crontab', 'append'));

      expect(result!.verdict.allowed).to.be.false;
      expect(result!.securityEvent).to.exist;
    });
  });

  // ── READ HIGH rules ──────────────────────────────────────────────────────────

  suite('Rule Matching — READ HIGH', () => {
    test('read_ssh_private_key: id_rsa', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));
      expect(r!.verdict.allowed).to.be.false;
      expect(r!.securityEvent!.iocs[0].rule).to.include('SSH');
    });

    test('read_ssh_private_key: id_ed25519', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.ssh/id_ed25519', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_ssh_private_key: id_ecdsa', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.ssh/id_ecdsa', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_system_passwd: /etc/passwd', () => {
      const r = analyzer.analyze(makeEvent('/etc/passwd', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_system_passwd: /etc/shadow', () => {
      const r = analyzer.analyze(makeEvent('/etc/shadow', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_system_passwd: should not match /etc/passwd.bak', () => {
      const r = analyzer.analyze(makeEvent('/etc/passwd.bak', 'read'));
      expect(r!.verdict.allowed).to.be.true;
    });

    test('read_aws_credentials: unix', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.aws/credentials', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_gnupg_key: unix', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.gnupg/private-keys-v1.d/key.gpg', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_gnupg_key: Windows AppData', () => {
      const r = analyzer.analyze(makeEvent('C:\\Users\\user\\AppData\\Roaming\\gnupg\\secring.gpg', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_netrc', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.netrc', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });
  });

  // ── READ MEDIUM rules ────────────────────────────────────────────────────────

  suite('Rule Matching — READ MEDIUM', () => {
    test('read_aws_config', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.aws/config', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_kube_config', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.kube/config', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_shell_history: bash', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.bash_history', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_shell_history: zsh', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.zsh_history', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_git_credentials', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.git-credentials', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_docker_config: unix', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.docker/config.json', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('read_docker_config: Windows', () => {
      const r = analyzer.analyze(makeEvent('C:\\Users\\user\\AppData\\Roaming\\Docker\\config.json', 'read'));
      expect(r!.verdict.allowed).to.be.false;
    });
  });

  // ── WRITE HIGH rules ─────────────────────────────────────────────────────────

  suite('Rule Matching — WRITE HIGH', () => {
    test('write_authorized_keys: unix', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.ssh/authorized_keys', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_cron: /etc/cron.d/', () => {
      const r = analyzer.analyze(makeEvent('/etc/cron.d/my-job', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_cron: /etc/crontab', () => {
      const r = analyzer.analyze(makeEvent('/etc/crontab', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_cron: /etc/cron.daily/', () => {
      const r = analyzer.analyze(makeEvent('/etc/cron.daily/backup', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_cron: Windows Scheduled Tasks', () => {
      const r = analyzer.analyze(makeEvent('C:\\Windows\\System32\\Tasks\\MyTask', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_launch_agent: macOS LaunchAgents', () => {
      const r = analyzer.analyze(makeEvent('/Users/user/Library/LaunchAgents/com.evil.plist', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_launch_agent: macOS LaunchDaemons', () => {
      const r = analyzer.analyze(makeEvent('/Library/LaunchDaemons/com.evil.plist', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_etc_hosts: unix', () => {
      const r = analyzer.analyze(makeEvent('/etc/hosts', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_etc_hosts: Windows', () => {
      const r = analyzer.analyze(makeEvent('C:\\Windows\\System32\\drivers\\etc\\hosts', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });
  });

  // ── WRITE MEDIUM rules ───────────────────────────────────────────────────────

  suite('Rule Matching — WRITE MEDIUM', () => {
    test('write_shell_profile: .bashrc', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.bashrc', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_shell_profile: .zshrc', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.zshrc', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_shell_profile: .bash_profile', () => {
      const r = analyzer.analyze(makeEvent('/home/user/.bash_profile', 'write'));
      expect(r!.verdict.allowed).to.be.false;
    });

    test('write_shell_profile: PowerShell profile', () => {
      const r = analyzer.analyze(
        makeEvent('C:\\Users\\user\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1', 'write'),
      );
      expect(r!.verdict.allowed).to.be.false;
    });
  });

  // ── False-positive prevention ────────────────────────────────────────────────

  suite('False-Positive Prevention', () => {
    test('should allow project source files', () => {
      const paths = [
        '/home/user/project/src/index.ts',
        '/home/user/project/package.json',
        '/home/user/project/.env.example',
        '/home/user/project/README.md',
      ];
      for (const p of paths) {
        const r = analyzer.analyze(makeEvent(p, 'read'));
        expect(r!.verdict.allowed, `should allow: ${p}`).to.be.true;
      }
    });

    test('should not match /etc/passwd.bak or /etc/passwdx', () => {
      const r1 = analyzer.analyze(makeEvent('/etc/passwd.bak', 'read'));
      const r2 = analyzer.analyze(makeEvent('/etc/passwdx', 'read'));
      expect(r1!.verdict.allowed).to.be.true;
      expect(r2!.verdict.allowed).to.be.true;
    });

    test('should not match file that merely contains "id_rsa" in name inside non-.ssh dir', () => {
      // The pathPattern requires [/\\].ssh[/\\] before the key name
      const r = analyzer.analyze(makeEvent('/home/user/backup/id_rsa.pub', 'read'));
      expect(r!.verdict.allowed).to.be.true;
    });

    test('should not match kube config in unrelated path', () => {
      const r = analyzer.analyze(makeEvent('/home/user/project/.kube-config.yaml', 'read'));
      expect(r!.verdict.allowed).to.be.true;
    });

    test('should not match /etc/hosts.allow', () => {
      const r = analyzer.analyze(makeEvent('/etc/hosts.allow', 'write'));
      expect(r!.verdict.allowed).to.be.true;
    });
  });

  // ── Allow list integration ───────────────────────────────────────────────────

  suite('Allow List Integration', () => {
    test('should bypass detection for allowed extensions', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(true);

      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(result!.verdict.allowed).to.be.true;
      expect(emitSecurityEventStub.called).to.be.false;
    });

    test('should block and emit event for non-allowed extensions', () => {
      const mockAllowListService = AllowListService.getInstance() as any;
      mockAllowListService.isAllowed.returns(false);

      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(result!.verdict.allowed).to.be.false;
      expect(emitSecurityEventStub.called).to.be.true;
    });
  });

  // ── SecurityEvent structure ──────────────────────────────────────────────────

  suite('SecurityEvent Structure', () => {
    test('should include extension id in SecurityEvent', () => {
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(result!.securityEvent!.extension!.id).to.equal('test.extension');
    });

    test('should include path in IoC finding', () => {
      const filePath = '/home/user/.ssh/id_rsa';
      const result = analyzer.analyze(makeEvent(filePath, 'read'));

      expect(result!.securityEvent!.iocs[0].finding).to.equal(filePath);
    });

    test('should include rule name in IoC', () => {
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(result!.securityEvent!.iocs[0].rule).to.equal(FS_RULES.find((r) => r.id === 'read_ssh_private_key')!.name);
    });

    test('should set correct confidence for high-confidence rules', () => {
      const result = analyzer.analyze(makeEvent('/home/user/.ssh/id_rsa', 'read'));

      expect(result!.securityEvent!.iocs[0].confidence).to.equal(1);
    });
  });
});
