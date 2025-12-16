/**
 * Shared test utilities and mocks for unit testing
 * We're defaulting to macOS and VS Code for most tests :p
 */

const sinon = require('sinon');

/**
 * Mock VS Code ExtensionContext for testing
 */
export function createMockExtensionContext(): any {
  const globalState = new Map<string, any>();

  return {
    subscriptions: [],
    workspaceState: { get: sinon.stub(), update: sinon.stub(), keys: sinon.stub().returns([]) },
    globalState: {
      get: sinon.stub().callsFake((key: string) => globalState.get(key)),
      update: sinon.stub().callsFake((key: string, value: any) => {
        globalState.set(key, value);
        return Promise.resolve();
      }),
      keys: sinon.stub().returns([]),
      setKeysForSync: sinon.stub(),
    },
    extensionPath: '/mock/extension/path',
    extensionUri: { fsPath: '/mock/extension/path' },
    environmentVariableCollection: {
      persistent: true,
      replace: sinon.stub(),
      append: sinon.stub(),
      prepend: sinon.stub(),
      get: sinon.stub(),
      forEach: sinon.stub(),
      delete: sinon.stub(),
      clear: sinon.stub(),
    },
    extensionMode: 3, // Production
    storageUri: { fsPath: '/mock/storage' },
    globalStorageUri: { fsPath: '/mock/global/storage' },
    logUri: { fsPath: '/mock/logs' },
    asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
    secrets: { get: sinon.stub(), store: sinon.stub(), delete: sinon.stub(), onDidChange: sinon.stub() },
    extension: {
      id: 'test.extension',
      extensionUri: { fsPath: '/mock/extension/path' },
      extensionPath: '/mock/extension/path',
      isActive: true,
      packageJSON: {},
      exports: undefined,
      activate: sinon.stub(),
      extensionKind: 1,
    },
    // Helper to get the internal map for assertions
    _getGlobalStateMap: () => globalState,
  };
}

/**
 * Mock VS Code Extension object
 */
export function createMockExtension(overrides?: Partial<any>): any {
  const defaults = {
    id: 'publisher.extension-1.0.0',
    extensionUri: { fsPath: '/mock/.vscode/extensions/publisher.extension-1.0.0' },
    extensionPath: '/mock/.vscode/extensions/publisher.extension-1.0.0',
    isActive: true,
    packageJSON: {
      name: 'extension',
      publisher: 'publisher',
      version: '1.0.0',
      displayName: 'Test Extension',
      description: 'A test extension',
    },
    exports: undefined,
    activate: sinon.stub().resolves(),
    extensionKind: 1, // ExtensionKind.Workspace
  };

  return { ...defaults, ...overrides };
}

/**
 * Mock built-in VS Code extension
 */
export function createBuiltInExtension(name: string): any {
  return createMockExtension({
    id: `vscode.${name}-1.0.0`,
    extensionPath: `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/${name}`,
    packageJSON: { name, publisher: 'vscode', version: '1.0.0', displayName: `VS Code ${name}`, isBuiltin: true },
  });
}

/**
 * Mock built-in Cursor extension (macOS)
 */
export function createCursorBuiltInExtension(name: string): any {
  return createMockExtension({
    id: `cursor.${name}-1.0.0`,
    extensionPath: `/Applications/Cursor.app/Contents/Resources/app/extensions/${name}`,
    packageJSON: { name, publisher: 'cursor', version: '1.0.0', displayName: `Cursor ${name}`, isBuiltin: true },
  });
}

/**
 * Mock built-in Cursor extension (Windows)
 */
export function createCursorBuiltInExtensionWindows(name: string): any {
  return createMockExtension({
    id: `cursor.${name}-1.0.0`,
    extensionPath: `C:\\Users\\user\\AppData\\Local\\Programs\\Cursor\\resources\\app\\extensions\\${name}`,
    packageJSON: { name, publisher: 'cursor', version: '1.0.0', displayName: `Cursor ${name}`, isBuiltin: true },
  });
}

/**
 * Mock built-in Cursor extension (Linux)
 */
export function createCursorBuiltInExtensionLinux(name: string): any {
  return createMockExtension({
    id: `cursor.${name}-1.0.0`,
    extensionPath: `/opt/Cursor/resources/app/extensions/${name}`,
    packageJSON: { name, publisher: 'cursor', version: '1.0.0', displayName: `Cursor ${name}`, isBuiltin: true },
  });
}

/**
 * Mock VS Code Task
 */
export function createMockTask(overrides?: Partial<any>): any {
  const defaults = {
    name: 'test-task',
    definition: { type: 'shell' },
    source: 'Workspace',
    scope: 1, // TaskScope.Workspace
    execution: null,
    isBackground: false,
    presentationOptions: {},
    problemMatchers: [],
    runOptions: {},
  };

  return { ...defaults, ...overrides };
}

/**
 * Mock VS Code TaskExecution
 */
export function createMockTaskExecution(task: any): any {
  return { task, terminate: sinon.stub() };
}

/**
 * Mock VS Code ShellExecution
 */
export function createMockShellExecution(command: string, args?: string[], options?: any): any {
  return {
    commandLine: args ? undefined : command,
    command: args ? command : undefined,
    args: args || [],
    options: options || {},
  };
}

/**
 * Mock VS Code ProcessExecution
 */
export function createMockProcessExecution(process: string, args: string[], options?: any): any {
  return { process, args, options: options || {} };
}

/**
 * Mock VS Code workspace
 */
export function createMockWorkspace(): any {
  return {
    name: 'test-workspace',
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' }, name: 'test-workspace', index: 0 }],
    getConfiguration: sinon
      .stub()
      .returns({ get: sinon.stub(), update: sinon.stub(), has: sinon.stub().returns(true), inspect: sinon.stub() }),
    onDidChangeConfiguration: sinon.stub(),
    onDidChangeWorkspaceFolders: sinon.stub(),
    onDidOpenTextDocument: sinon.stub(),
    onDidCloseTextDocument: sinon.stub(),
    onDidChangeTextDocument: sinon.stub(),
    onDidSaveTextDocument: sinon.stub(),
    textDocuments: [],
    rootPath: '/mock/workspace',
    workspaceFile: undefined,
    asRelativePath: (pathOrUri: any) => pathOrUri,
    findFiles: sinon.stub().resolves([]),
    fs: { readFile: sinon.stub(), writeFile: sinon.stub(), stat: sinon.stub(), readDirectory: sinon.stub() },
  };
}

/**
 * Reset all Sinon stubs and spies
 */
export function resetAllStubs(): void {
  sinon.restore();
}

/**
 * Create a spy that tracks calls
 */
export function createSpy(): sinon.SinonSpy {
  return sinon.spy();
}

/**
 * Create a stub that can be configured
 */
export function createStub(): sinon.SinonStub {
  return sinon.stub();
}

/**
 * Wait for async operations to complete
 */
export async function waitForPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Mock ExtensionInfo
 */
export function createMockExtensionInfo(id: string = 'test.extension', isPatched: boolean = true): any {
  return { id, isPatched, patchedAt: Date.now() };
}

/**
 * Mock WorkspaceInfo
 */
export function createMockWorkspaceInfo(
  name: string = 'test-workspace',
  path: string = '/mock/workspace',
  isTrusted: boolean = false,
): any {
  return { name, path, isTrusted, trustedAt: isTrusted ? Date.now() : undefined };
}

/**
 * Mock logger to prevent console spam in tests
 */
export function createMockLogger(): any {
  return { debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), log: sinon.stub() };
}
