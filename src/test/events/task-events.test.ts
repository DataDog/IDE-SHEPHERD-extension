/**
 * Unit tests for Task Event Classes
 */

import { expect, use } from 'chai';
const sinonChai = require('sinon-chai');

use(sinonChai);
import { WorkspaceInfo, Target } from '../../lib/events/ext-events';
import { TaskEvent } from '../../lib/events/task-events';

suite('TaskEvent Tests', () => {
  suite('TaskEvent', () => {
    let workspaceInfo: WorkspaceInfo;

    setup(() => {
      workspaceInfo = new WorkspaceInfo('test-workspace', '/path/to/workspace', false);
    });

    test('should create with required parameters', () => {
      const event = new TaskEvent('build', 'shell', 'workspace', 'npm', ['run', 'build'], workspaceInfo, __filename);

      expect(event.taskName).to.equal('build');
      expect(event.taskType).to.equal('shell');
      expect(event.source).to.equal('workspace');
      expect(event.command).to.equal('npm');
      expect(event.args).to.deep.equal(['run', 'build']);
      expect(event.workspace).to.equal(workspaceInfo);
      expect(event.eventType).to.equal(Target.WORKSPACE);
    });

    test('should generate event ID', () => {
      const event = new TaskEvent('build', 'shell', 'workspace', 'npm', ['run', 'build'], workspaceInfo, __filename);

      expect(event.eventId).to.exist;
      expect(event.eventId).to.be.a('string');
    });

    test('should set timestamp', () => {
      const event = new TaskEvent('build', 'shell', 'workspace', 'npm', ['run', 'build'], workspaceInfo, __filename);

      expect(event.timestamp).to.exist;
      expect(event.timestamp).to.be.a('number');
    });

    test('should create with optional cwd and scope', () => {
      const event = new TaskEvent(
        'build',
        'shell',
        'workspace',
        'npm',
        ['run', 'build'],
        workspaceInfo,
        __filename,
        '/path/to/cwd',
        'Workspace',
      );

      expect(event.cwd).to.equal('/path/to/cwd');
      expect(event.scope).to.equal('Workspace');
    });

    test('should use custom timestamp if provided', () => {
      const customTimestamp = 12345;
      const event = new TaskEvent(
        'build',
        'shell',
        'workspace',
        'npm',
        ['run', 'build'],
        workspaceInfo,
        __filename,
        undefined,
        undefined,
        customTimestamp,
      );

      expect(event.timestamp).to.equal(customTimestamp);
    });

    test('getFullCommand should combine command and args', () => {
      const event = new TaskEvent('build', 'shell', 'workspace', 'npm', ['run', 'build'], workspaceInfo, __filename);

      expect(event.getFullCommand()).to.equal('npm run build');
    });

    test('getFullCommand should return command only when no args', () => {
      const event = new TaskEvent('build', 'shell', 'workspace', 'npm', [], workspaceInfo, __filename);

      expect(event.getFullCommand()).to.equal('npm');
    });

    test('toJSON should serialize event', () => {
      const event = new TaskEvent('build', 'shell', 'workspace', 'npm', ['run', 'build'], workspaceInfo, __filename);
      const json = event.toJSON();

      expect(json).to.be.a('string');
      const parsed = JSON.parse(json);
      expect(parsed.taskName).to.equal('build');
      expect(parsed.taskType).to.equal('shell');
      expect(parsed.command).to.equal('npm');
      expect(parsed.args).to.deep.equal(['run', 'build']);
    });
  });
});
