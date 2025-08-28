/**
 * Extension Service :  responsible for managing extensions, resolving their ids,
 * their file paths, etc.
 */


import { Logger } from '../logger';

export class ExtensionServices {
    /**
     * Extract extension information from parent module
     */
    static getExtensionFromParentModule(parent: any) {
		Logger.debug(`ExtensionServices: Getting extension from parent module: ${parent.filename}`);
        if (!parent?.filename) {
            return 'unknown-extension';
        }

        try {
            const filename = parent.filename;
            
            if (filename.includes('extensions')) {
                const match = filename.match(/extensions[\/\\]([^\/\\]+)/);
                if (match) {
                    return match[1];
                }
            }
            
            if (filename.includes('node_modules')) {
                const match = filename.match(/node_modules[\/\\]([^\/\\]+)/);
                if (match) {
                    return match[1];
                }
            }
            
            return 'core-module';
        } catch (error) {
            Logger.debug(`Failed to extract extension info from parent: ${error}`);
            return 'unknown-extension';
        }
    }


	// getCallContext will yield a different result from getExtensionFromParentModule 
	// iff there is ANOTHER extension patching Node's require the same way we do.
	// we use the getExtensionFromParentModule, but it is helpful to look at the stack trace to understand the call context.
	static getCallContext() {
		try {
			const stack = new Error().stack;
			if (!stack) {
                return { extension: 'unknown-stack', library: null };
            }
			Logger.debug(`ExtensionServices: Stack: ${stack}`);
			const lines = stack.split('\n');
			let extension = null;
			let library = null;

			for (const line of lines) {
				if (this._shouldSkipStackLine(line)) {
					continue;
				}

				if (!library) {
					library = this._detectHttpLibrary(line);
				}

				// Look for extension
				if (!extension) {
					const match = line.match(/(?:\.vscode|\/app)[/\\]extensions[/\\]([^/\\]+)/);
					if (match) {
						extension = match[1];
					}
				}

				// If we found both, we can stop
				if (extension && library) {
					break;
				}
			}

			return {
				extension: extension || 'caller? who-nose', // since we're using vscode specific static paths, expect this error there
				library: library
			};
		} catch (error) {
			Logger.error('Failed to get call context', error as Error);
			return { extension: 'stack-error', library: null };
		}
	}

	// Detect HTTP libraries in stack trace lines
	static _detectHttpLibrary(line: string) {
		const httpLibraries = [
			{ name: 'axios', patterns: ['/axios/', '\\axios\\', 'node_modules/axios'] },
			{ name: 'request', patterns: ['/request/', '\\request\\', 'node_modules/request'] },
			{ name: 'got', patterns: ['/got/', '\\got\\', 'node_modules/got'] },
			{ name: 'node-fetch', patterns: ['/node-fetch/', '\\node-fetch\\', 'node_modules/node-fetch'] },
			{ name: 'superagent', patterns: ['/superagent/', '\\superagent\\', 'node_modules/superagent'] },
			{ name: 'needle', patterns: ['/needle/', '\\needle\\', 'node_modules/needle'] },
			{ name: '@vscode/proxy-agent', patterns: ['/@vscode/proxy-agent/', '\\@vscode\\proxy-agent\\', 'proxy-agent'] }
		];

		for (const lib of httpLibraries) {
			if (lib.patterns.some(pattern => line.includes(pattern))) {
				return lib.name;
			}
		}

		return null;
	}

	static _shouldSkipStackLine(line: string) {
		const skipPatterns = [
			'ide-shepherd',
			'node:internal',
			'Module._load',
			'at Object.Module.',
			'at Module.require'
		];
		return skipPatterns.some(pattern => line.includes(pattern));
	}

	/**
	 * Enhanced path extraction with better patterns, aims to support multiple IDEs
	 */
	static _extractExtensionFromPath(filePath: string) {
		if (!filePath) {
			return 'unknown';
		}

		try {
			// Enhanced patterns for different VS Code installation types
			const patterns = [
				// User extensions
				/(?:\.vscode|\.vscode-insiders)[/\\]extensions[/\\]([^/\\]+)/,
				// Built-in extensions
				/\/app[/\\]extensions[/\\]([^/\\]+)/,
				// Windows built-in
				/\\app\\extensions\\([^\\]+)/,
				// Portable installations
				/vscode-portable[/\\]data[/\\]extensions[/\\]([^/\\]+)/
			];

			for (const pattern of patterns) {
				const match = filePath.match(pattern);
				if (match) {
					return match[1];
				}
			}

			return 'core-or-unknown';
		} catch (error) {
			Logger.error(`Failed to extract extension from path: ${error}`);
			return 'extraction-error';
		}
	}


}