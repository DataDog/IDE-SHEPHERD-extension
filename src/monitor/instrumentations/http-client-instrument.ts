import { NetworkEvent } from '../../lib/events/network-events';
import type { Protocol } from '../../lib/events/network-events';
import url from 'url';
import { ExtensionInfo } from '../../lib/events/ext-events';
import { Logger } from '../../lib/logger';
import { NetworkAnalyzer } from '../analysis/network-analyzer';
import { BlockedOperationType, NotificationService } from '../../lib/services/notification-service';
import { ExtensionServices } from '../../lib/services/ext-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';

// Create a local instance of NetworkAnalyzer
const networkAnalyzer = new NetworkAnalyzer();

// dynamically block the request
function createDynamicMock(realRequest: any): any {
  // simulate an event emitter
  // https://nodejs.org/api/events.html#class-eventemitter

  const listeners = new Map<string | symbol, Function[]>();

  const on = (event: string | symbol, fn: Function) => {
    (listeners.get(event) ?? listeners.set(event, []).get(event)!).push(fn);
    return mockReq; // chaining
  };
  const once = (event: string | symbol, fn: Function) =>
    on(event, function wrapper(...a: any[]) {
      off(event, wrapper);
      fn(...a);
    });
  const off = (event: string | symbol, fn: Function) => {
    const arr = listeners.get(event);
    if (arr) {
      listeners.set(
        event,
        arr.filter((f) => f !== fn),
      );
    }
    return mockReq;
  };
  const emit = (event: string | symbol, ...a: any[]) => {
    (listeners.get(event) ?? []).slice().forEach((f) => {
      try {
        f(...a);
      } catch {
        // keep going
      }
    });
    return mockReq;
  };

  // stable objects
  const dummyObject = new Proxy(
    {},
    {
      // never throws, always defined
      get: () => dummyObject,
      set: () => true,
      apply: () => undefined,
    },
  );

  // chainable no-ops methods
  // add it explicitly in case the user tests `typeof req.write === 'function'`
  const CHAINABLE = new Set([
    'write',
    'end',
    'destroy',
    'setTimeout',
    'setNoDelay',
    'setSocketKeepAlive',
    'setHeader',
    'removeHeader',
    'addTrailers',
    'cork',
    'uncork',
    'flushHeaders',
  ]);

  // state flags - default to false (?)
  // includes finished (deprecated), aborted (deprecated), destroyed, writableEnded, writableFinished

  const STATE_FLAGS = ['finished', 'aborted', 'destroyed', 'writableEnded', 'writableFinished'];

  // everything that is not defined explicitly becomes
  // either a chainable no-op function or undefined (for data properties)
  const cache = new Map<PropertyKey, any>(); // ensures identity

  const base: any = {
    // event-emitter subset
    on,
    addListener: on,
    once,
    off,
    removeListener: off,
    emit,

    // "stable" sub-objects
    socket: dummyObject,
    connection: dummyObject,
    agent: dummyObject,

    // state flags
    // default them to false, the same way like a first initial request
    ...Object.fromEntries(STATE_FLAGS.map((k) => [k, false])),

    // util.inspect support – makes console.log nicer
    [Symbol.for('nodejs.util.inspect.custom')]: () => '[BlockedClientRequest]',
  };

  const mockReq = new Proxy(base, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      // symbols we do not explicitly know about are undefined
      if (typeof prop === 'symbol') {
        return undefined;
      }

      // cache so repeated access returns identical value
      if (cache.has(prop)) {
        return cache.get(prop);
      }

      const val = CHAINABLE.has(String(prop))
        ? (..._args: any[]) => receiver
        : typeof realRequest[prop] === 'function'
          ? (..._args: any[]) => receiver
          : undefined;

      cache.set(prop, val);
      return val;
    },

    // mute any writes : apparently user code sometimes tries to assign
    // req.method = 'POST', req.path = '/foo', etc.
    set: () => true,
  });

  setTimeout(() => mockReq.emit('error', new Error('Request blocked by security policy')), 0);
  Logger.debug(`HTTP Plugin: Created dynamic mock with ${Object.keys(base).length} base properties + proxy fallbacks`);
  return mockReq;
}

// We want a thorough coverage of http client since we're analyzing ALL traffic
// credit: dd-trace-js
function combineOptions(inputURL: any, inputOptions: any) {
  return inputOptions && typeof inputOptions === 'object' ? Object.assign(inputURL || {}, inputOptions) : inputURL;
}

function normalizeHeaders(options: any) {
  options.headers ??= {};
}

function normalizeCallback(inputOptions: any, callback: any, inputURL: any) {
  return typeof inputOptions === 'function' ? [inputOptions, inputURL || {}] : [callback, inputOptions];
}

function urlToOptions(u: any, httpExports: any) {
  const agent = u.agent || httpExports.globalAgent;
  const options: any = {
    protocol: u.protocol || agent?.protocol,
    hostname:
      typeof u.hostname === 'string' && u.hostname.startsWith('[')
        ? u.hostname.slice(1, -1)
        : u.hostname || u.host || 'localhost',
    hash: u.hash,
    search: u.search,
    pathname: u.pathname,
    path: `${u.pathname || ''}${u.search || ''}`,
    href: u.href,
  };
  if (u.port !== '') {
    options.port = u.port;
  }
  if (u.username || u.password) {
    options.auth = `${u.username}:${u.password}`;
  }
  return options;
}

function normalizeOptions(inputURL: any, httpExports: any) {
  if (typeof inputURL === 'string') {
    try {
      return urlToOptions(new url.URL(inputURL), httpExports);
    } catch {
      return url.parse(inputURL);
    }
  } else if (inputURL instanceof url.URL) {
    return urlToOptions(inputURL, httpExports);
  } else {
    return inputURL;
  }
}

// Normalize arguments, options and callbacks
export function normalizeArgs(httpExports: any, inputURL: any, inputOptions?: any, cb?: any) {
  const originalUrl = inputURL;
  inputURL = normalizeOptions(inputURL, httpExports);

  const [callback, inputOptionsNormalized] = normalizeCallback(inputOptions, cb, inputURL);
  const options = combineOptions(inputURL, inputOptionsNormalized);
  normalizeHeaders(options);
  const uri = url.format(options);

  return { uri, options, callback, originalUrl };
}

export function patchHttpExports(http: any, protocol: Protocol) {
  if (http.__patched__) {
    return;
  }

  const orig = http.request.bind(http);

  http.request = function wrapped(...args: any[]) {
    // Detect extension per-request, not per-patch
    const callContext = ExtensionServices.getCallContext();
    const extensionInfo = new ExtensionInfo(callContext.extension, true, Date.now());

    IDEStatusService.updatePatchedExtension(extensionInfo).catch((error) => {
      Logger.warn(`HTTP Plugin: Failed to update extension status for ${extensionInfo.id}: ${error.message}`);
    });

    const parsed = normalizeArgs(http, args[0], args[1], args[2]);
    Logger.debug(`HTTP Plugin: Intercepted ${protocol} request to: ${Logger.truncate(parsed.uri, 100)}`);

    // preemptive block for malicious URLs, ie before creating request
    const urlEvent = new NetworkEvent(
      protocol,
      parsed.uri,
      'request:pre',
      __filename,
      extensionInfo,
      undefined,
      parsed.options,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    );
    const urlResult = networkAnalyzer.analyze(urlEvent);

    if (urlResult && !urlResult.verdict.allowed && urlResult.securityEvent) {
      Logger.warn(`HTTP Plugin: Blocked request based on URL analysis: ${parsed.uri}`);
      NotificationService.showSecurityBlockingInfo(parsed.uri, urlResult.securityEvent, BlockedOperationType.REQUEST);
      // Return mock immediately
      return createDynamicMock(null);
    }

    // --> only create the real request if URL passed validation
    return orig(...args);
  };

  http.get = function (...a: any[]) {
    const r = http.request(...a);
    r.end();
    return r;
  };
  Object.defineProperty(http, '__patched__', { value: true });

  Logger.info(`HTTP Plugin: Successfully patched ${protocol} module (extension detection per-request)`);
}
