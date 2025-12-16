/**
 * Unit tests for Process Event Classes
 */

import { expect, use } from 'chai';
const sinonChai = require('sinon-chai');

use(sinonChai);
import { ExtensionInfo, Target } from '../../lib/events/ext-events';
import { ExecEvent } from '../../lib/events/process-events';

suite('ProcessEvent Tests', () => {
  suite('ExecEvent', () => {
    let extensionInfo: ExtensionInfo;

    setup(() => {
      extensionInfo = new ExtensionInfo('test.extension', true, Date.now());
    });

    test('should create with required parameters', () => {
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);

      expect(event.cmd).to.equal('curl');
      expect(event.args).to.deep.equal(['http://example.com']);
      expect(event.extension).to.equal(extensionInfo);
      expect(event.eventType).to.equal(Target.PROCESS);
    });

    test('should generate event ID', () => {
      const event = new ExecEvent('echo', ['hello'], {}, __filename, extensionInfo);

      expect(event.eventId).to.exist;
      expect(event.eventId).to.be.a('string');
    });

    test('should set timestamp', () => {
      const event = new ExecEvent('echo', ['hello'], {}, __filename, extensionInfo);

      expect(event.timestamp).to.exist;
      expect(event.timestamp).to.be.a('number');
    });

    test('should store options', () => {
      const options = { cwd: '/path/to/dir', env: { VAR: 'value' } };
      const event = new ExecEvent('node', ['script.js'], options, __filename, extensionInfo);

      expect(event.options).to.deep.equal(options);
    });

    test('should handle empty args', () => {
      const event = new ExecEvent('ls', [], {}, __filename, extensionInfo);

      expect(event.args).to.be.an('array');
      expect(event.args).to.be.empty;
    });

    test('should handle undefined options', () => {
      const event = new ExecEvent('ls', [], undefined, __filename, extensionInfo);

      expect(event.options).to.be.undefined;
    });

    test('toJSON should serialize event', () => {
      const event = new ExecEvent('curl', ['http://example.com'], {}, __filename, extensionInfo);
      const json = event.toJSON();

      expect(json).to.be.a('string');
      const parsed = JSON.parse(json);
      expect(parsed.cmd).to.equal('curl');
      expect(parsed.args).to.deep.equal(['http://example.com']);
    });

    test('should use custom timestamp if provided', () => {
      const customTimestamp = 12345;
      const event = new ExecEvent('echo', ['test'], {}, __filename, extensionInfo, customTimestamp);

      expect(event.timestamp).to.equal(customTimestamp);
    });
  });
});
