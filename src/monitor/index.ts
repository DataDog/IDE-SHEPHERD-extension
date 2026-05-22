/**
 * Monitor module exports
 * Main entry point for security monitoring functionality
 */

export { moduleLoaderPatcher, ModuleLoaderPatcher } from './patch-loader';
export { NetworkAnalyzer } from './analysis/network-analyzer';
export { patchVscodeTasks } from './instrumentations/vscode-tasks-instrument';
