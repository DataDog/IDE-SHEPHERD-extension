/**
 * Unit tests for Network Event Classes
 */

import { expect, use } from 'chai';
const sinonChai = require('sinon-chai');

use(sinonChai);
import { ExtensionInfo, WorkspaceInfo, Target } from '../../lib/events/ext-events';
import { NetworkEvent } from '../../lib/events/network-events';

suite('NetworkEvent Tests', () => {
  suite('NetworkEvent', () => {
    let extensionInfo: ExtensionInfo;

    setup(() => {
      extensionInfo = new ExtensionInfo('test.extension', true, Date.now());
    });

    test('should create with required parameters', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      expect(event.protocol).to.equal('https');
      expect(event.url).to.equal('https://example.com');
      expect(event.phase).to.equal('request:pre');
      expect(event.extension).to.equal(extensionInfo);
      expect(event.eventType).to.equal(Target.NETWORK);
    });

    test('should generate event ID', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      expect(event.eventId).to.exist;
      expect(event.eventId).to.be.a('string');
    });

    test('should set timestamp', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      expect(event.timestamp).to.exist;
      expect(event.timestamp).to.be.a('number');
    });

    test('should create with optional parameters', () => {
      const options = { headers: { 'User-Agent': 'Test' } };
      const headers = { 'Content-Type': 'application/json' };

      const event = new NetworkEvent(
        'https',
        'https://example.com',
        'response',
        __filename,
        extensionInfo,
        'POST',
        options,
        200,
        headers,
        undefined,
        'payload data',
        false,
      );

      expect(event.method).to.equal('POST');
      expect(event.options).to.deep.equal(options);
      expect(event.statusCode).to.equal(200);
      expect(event.headers).to.deep.equal(headers);
      expect(event.payload).to.equal('payload data');
      expect(event.truncated).to.be.false;
    });

    test('should use correlation ID if provided', () => {
      const correlationId = 'custom-correlation-id';
      const event = new NetworkEvent(
        'https',
        'https://example.com',
        'request:pre',
        __filename,
        extensionInfo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        correlationId,
      );

      expect(event.correlationId).to.equal(correlationId);
    });

    test('should use event ID as correlation ID if not provided', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);

      expect(event.correlationId).to.equal(event.eventId);
    });

    test('isRequestPhase should return true for request:pre', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);
      expect(event.isRequestPhase()).to.be.true;
    });

    test('isRequestPhase should return true for request:post', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:post', __filename, extensionInfo);
      expect(event.isRequestPhase()).to.be.true;
    });

    test('isRequestPhase should return false for response', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'response', __filename, extensionInfo);
      expect(event.isRequestPhase()).to.be.false;
    });

    test('isResponsePhase should return true for response', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'response', __filename, extensionInfo);
      expect(event.isResponsePhase()).to.be.true;
    });

    test('isResponsePhase should return false for request:pre', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);
      expect(event.isResponsePhase()).to.be.false;
    });

    test('toJSON should serialize event', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);
      const json = event.toJSON();

      expect(json).to.be.a('string');
      const parsed = JSON.parse(json);
      expect(parsed.protocol).to.equal('https');
      expect(parsed.url).to.equal('https://example.com');
      expect(parsed.phase).to.equal('request:pre');
    });

    test('truncated should default to false', () => {
      const event = new NetworkEvent('https', 'https://example.com', 'request:pre', __filename, extensionInfo);
      expect(event.truncated).to.be.false;
    });

    test('truncated should be true when provided', () => {
      const event = new NetworkEvent(
        'https',
        'https://example.com',
        'request:pre',
        __filename,
        extensionInfo,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'payload',
        true,
      );
      expect(event.truncated).to.be.true;
    });
  });
});
