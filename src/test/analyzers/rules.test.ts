/**
 * Unit tests for Detection Rules
 */

import { expect, use } from 'chai';
const sinonChai = require('sinon-chai');

use(sinonChai);
import {
  PROCESS_RULES,
  ProcessRuleType,
  getRuleById as getProcessRuleById,
  getRulesByType as getProcessRulesByType,
  getRulesBySeverity as getProcessRulesBySeverity,
  getAllRules as getAllProcessRules,
} from '../../detection/process-rules';
import {
  NETWORK_RULES,
  NetworkRuleType,
  LOCAL_IP_PATTERN,
  WILDCARD_IP_PATTERN,
  getRuleById as getNetworkRuleById,
  getRulesByType as getNetworkRulesByType,
  getRulesBySeverity as getNetworkRulesBySeverity,
  getAllRules as getAllNetworkRules,
} from '../../detection/network-rules';
import { SeverityLevel } from '../../lib/events/sec-events';
import { Target } from '../../lib/events/ext-events';

suite('DetectionRules Tests', () => {
  suite('Process Rules', () => {
    test('should have rules defined', () => {
      expect(PROCESS_RULES).to.be.an('array');
      expect(PROCESS_RULES.length).to.be.greaterThan(0);
    });

    test('all rules should have required properties', () => {
      PROCESS_RULES.forEach((rule) => {
        expect(rule.id).to.be.a('string');
        expect(rule.name).to.be.a('string');
        expect(rule.description).to.be.a('string');
        expect(rule.type).to.exist;
        expect(rule.target).to.equal(Target.PROCESS);
        expect(rule.severity).to.exist;
        expect(rule.commandPattern).to.be.instanceOf(RegExp);
        expect(rule.confidence).to.be.a('number');
      });
    });

    test('PowerShell rule should match powershell commands', () => {
      const rule = PROCESS_RULES.find((r) => r.id === 'powershell_execution');
      expect(rule).to.exist;
      expect(rule!.commandPattern.test('powershell')).to.be.true;
      expect(rule!.commandPattern.test('powershell.exe')).to.be.true;
      expect(rule!.commandPattern.test('pwsh')).to.be.true;
      expect(rule!.commandPattern.test('POWERSHELL')).to.be.true;
    });

    test('PowerShell rule flagPattern should match suspicious flags', () => {
      const rule = PROCESS_RULES.find((r) => r.id === 'powershell_execution');
      expect(rule!.flagPattern).to.exist;
      expect(rule!.flagPattern!.test('-Command Get-Process')).to.be.true;
      expect(rule!.flagPattern!.test('-c Get-Process')).to.be.true;
      expect(rule!.flagPattern!.test('-enc BASE64')).to.be.true;
      expect(rule!.flagPattern!.test('-EncodedCommand BASE64')).to.be.true;
      expect(rule!.flagPattern!.test('-ExecutionPolicy Bypass')).to.be.true;
      expect(rule!.flagPattern!.test('-NoProfile')).to.be.true;
      expect(rule!.flagPattern!.test('-WindowStyle Hidden')).to.be.true;
      expect(rule!.flagPattern!.test('-w Hidden')).to.be.true;
    });

    test('PowerShell rule flagPattern should NOT match benign flags', () => {
      const rule = PROCESS_RULES.find((r) => r.id === 'powershell_execution');
      expect(rule!.flagPattern).to.exist;
      expect(rule!.flagPattern!.test('-Version')).to.be.false;
      expect(rule!.flagPattern!.test('-Help')).to.be.false;
      expect(rule!.flagPattern!.test('-?')).to.be.false;
    });

    test('Command Injection rule should match shell commands', () => {
      const rule = PROCESS_RULES.find((r) => r.id === 'command_injection');
      expect(rule).to.exist;
      expect(rule!.commandPattern.test('bash')).to.be.true;
      expect(rule!.commandPattern.test('sh')).to.be.true;
      expect(rule!.commandPattern.test('zsh')).to.be.true;
      expect(rule!.commandPattern.test('curl')).to.be.true;
      expect(rule!.commandPattern.test('wget')).to.be.true;
    });

    test('getRuleById should return rule', () => {
      const rule = getProcessRuleById('powershell_execution');
      expect(rule).to.exist;
      expect(rule!.id).to.equal('powershell_execution');
    });

    test('getRuleById should return undefined for invalid ID', () => {
      const rule = getProcessRuleById('non_existent');
      expect(rule).to.be.undefined;
    });

    test('getRulesByType should filter by type', () => {
      const scriptRules = getProcessRulesByType(ProcessRuleType.SCRIPT);
      expect(scriptRules.every((r) => r.type === ProcessRuleType.SCRIPT)).to.be.true;

      const commandRules = getProcessRulesByType(ProcessRuleType.COMMAND);
      expect(commandRules.every((r) => r.type === ProcessRuleType.COMMAND)).to.be.true;
    });

    test('getRulesBySeverity should filter by severity', () => {
      const highRules = getProcessRulesBySeverity(SeverityLevel.HIGH);
      expect(highRules.every((r) => r.severity === SeverityLevel.HIGH)).to.be.true;
    });

    test('getAllRules should return copy of rules', () => {
      const rules = getAllProcessRules();
      expect(rules).to.deep.equal(PROCESS_RULES);
      expect(rules).to.not.equal(PROCESS_RULES); // Should be a copy
    });
  });

  suite('Network Rules', () => {
    test('should have rules defined', () => {
      expect(NETWORK_RULES).to.be.an('array');
      expect(NETWORK_RULES.length).to.be.greaterThan(0);
    });

    test('all rules should have required properties', () => {
      NETWORK_RULES.forEach((rule) => {
        expect(rule.id).to.be.a('string');
        expect(rule.name).to.be.a('string');
        expect(rule.description).to.be.a('string');
        expect(rule.type).to.exist;
        expect(rule.target).to.equal(Target.NETWORK);
        expect(rule.severity).to.exist;
        expect(rule.pattern).to.be.instanceOf(RegExp);
        expect(rule.confidence).to.be.a('number');
      });
    });

    test('suspicious domains rule should match known domains', () => {
      const rule = NETWORK_RULES.find((r) => r.id === 'suspicious_domains');
      expect(rule).to.exist;
      expect(rule!.pattern.test('https://bit.ly/abc')).to.be.true;
      expect(rule!.pattern.test('https://test.workers.dev')).to.be.true;
      expect(rule!.pattern.test('https://abc.ngrok.io')).to.be.true;
      expect(rule!.pattern.test('https://test.dnslog.cn')).to.be.true;
      expect(rule!.pattern.test('https://test.pipedream.net')).to.be.true;
      expect(rule!.pattern.test('https://webhook.site/test')).to.be.true;
    });

    test('Exfiltration Domains rule should match data exfiltration services', () => {
      const rule = NETWORK_RULES.find((r) => r.id === 'exfiltration_domains');
      expect(rule).to.exist;
      expect(rule!.pattern.test('https://discord.com/api/webhooks')).to.be.true;
      expect(rule!.pattern.test('https://transfer.sh')).to.be.true;
      expect(rule!.pattern.test('https://pastebin.com/raw/abc')).to.be.true;
      expect(rule!.pattern.test('https://api.telegram.org/bot123')).to.be.true;
      expect(rule!.pattern.test('https://ghostbin.site/test')).to.be.true;
    });

    test('Malware Download Domains rule should match malware sites', () => {
      const rule = NETWORK_RULES.find((r) => r.id === 'malware_download_domains');
      expect(rule).to.exist;
      expect(rule!.pattern.test('https://files.catbox.moe/file.exe')).to.be.true;
      expect(rule!.pattern.test('https://solidity.bot/api')).to.be.true;
    });

    test('Intel Domains rule should match IP intelligence services', () => {
      const rule = NETWORK_RULES.find((r) => r.id === 'intel_domains');
      expect(rule).to.exist;
      expect(rule!.pattern.test('https://ipinfo.io')).to.be.true;
      expect(rule!.pattern.test('https://api.ipify.org')).to.be.true;
      expect(rule!.pattern.test('https://ifconfig.me')).to.be.true;
    });

    test('External IP rule should match IP addresses', () => {
      const rule = NETWORK_RULES.find((r) => r.id === 'external_ip');
      expect(rule).to.exist;
      expect(rule!.pattern.test('http://93.184.216.34')).to.be.true;
      expect(rule!.pattern.test('http://8.8.8.8:80')).to.be.true;
    });

    test('LOCAL_IP_PATTERN should match local IPs', () => {
      expect(LOCAL_IP_PATTERN.test('127.0.0.1')).to.be.true;
      expect(LOCAL_IP_PATTERN.test('10.0.0.1')).to.be.true;
      expect(LOCAL_IP_PATTERN.test('192.168.1.1')).to.be.true;
      expect(LOCAL_IP_PATTERN.test('172.16.0.1')).to.be.true;
      expect(LOCAL_IP_PATTERN.test('169.254.1.1')).to.be.true;
    });

    test('LOCAL_IP_PATTERN should not match external IPs', () => {
      expect(LOCAL_IP_PATTERN.test('8.8.8.8')).to.be.false;
      expect(LOCAL_IP_PATTERN.test('93.184.216.34')).to.be.false;
    });

    test('WILDCARD_IP_PATTERN should match 0.0.0.0', () => {
      expect(WILDCARD_IP_PATTERN.test('0.0.0.0')).to.be.true;
    });

    test('getRuleById should return rule', () => {
      const rule = getNetworkRuleById('suspicious_domains');
      expect(rule).to.exist;
      expect(rule!.id).to.equal('suspicious_domains');
    });

    test('getRuleById should return undefined for invalid ID', () => {
      const rule = getNetworkRuleById('non_existent');
      expect(rule).to.be.undefined;
    });

    test('getRulesByType should filter by type', () => {
      const urlRules = getNetworkRulesByType(NetworkRuleType.URL);
      expect(urlRules.every((r) => r.type === NetworkRuleType.URL)).to.be.true;

      const ipRules = getNetworkRulesByType(NetworkRuleType.IP);
      expect(ipRules.every((r) => r.type === NetworkRuleType.IP)).to.be.true;
    });

    test('getRulesBySeverity should filter by severity', () => {
      const highRules = getNetworkRulesBySeverity(SeverityLevel.HIGH);
      expect(highRules.every((r) => r.severity === SeverityLevel.HIGH)).to.be.true;

      const mediumRules = getNetworkRulesBySeverity(SeverityLevel.MEDIUM);
      expect(mediumRules.every((r) => r.severity === SeverityLevel.MEDIUM)).to.be.true;
    });

    test('getAllRules should return copy of rules', () => {
      const rules = getAllNetworkRules();
      expect(rules).to.deep.equal(NETWORK_RULES);
      expect(rules).to.not.equal(NETWORK_RULES); // Should be a copy
    });
  });

  suite('Rule Quality', () => {
    test('all process rules should have unique IDs', () => {
      const ids = PROCESS_RULES.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).to.equal(ids.length);
    });

    test('all network rules should have unique IDs', () => {
      const ids = NETWORK_RULES.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).to.equal(ids.length);
    });

    test('all rules should have non-empty names', () => {
      [...PROCESS_RULES, ...NETWORK_RULES].forEach((rule) => {
        expect(rule.name.length).to.be.greaterThan(0);
      });
    });

    test('all rules should have non-empty descriptions', () => {
      [...PROCESS_RULES, ...NETWORK_RULES].forEach((rule) => {
        expect(rule.description.length).to.be.greaterThan(0);
      });
    });

    test('all rules should have confidence between 0 and 1', () => {
      [...PROCESS_RULES, ...NETWORK_RULES].forEach((rule) => {
        expect(rule.confidence).to.be.at.least(0);
        expect(rule.confidence).to.be.at.most(1);
      });
    });
  });
});
