import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',  // Matches compiled extension.test.js
  version: 'stable',
  workspaceFolder: './',
  mocha: {
    timeout: 20000,
  },
  launchArgs: [
    '--disable-extensions',
    '--disable-workspace-trust',
  ],
});