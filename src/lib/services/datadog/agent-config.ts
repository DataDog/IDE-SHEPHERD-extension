/**
 * Datadog Agent Configuration Utilities
 * Provides utilities for configuring the local Datadog Agent to receive logs from IDE Shepherd.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../logger';
import { CONFIG } from '../../config';

const execAsync = promisify(exec);

/**
 * Validate that a file path is within the expected Datadog Agent configuration directory.
 */
function validateConfigPath(filePath: string, baseDir: string): void {
  const normalizedPath = path.normalize(filePath);
  const normalizedBase = path.normalize(baseDir);

  if (!normalizedPath.startsWith(normalizedBase)) {
    throw new Error('Invalid configuration path: path traversal attempt detected');
  }
  // ensure no parent directory traversal attempts
  if (normalizedPath.includes('..')) {
    throw new Error('Invalid configuration path: parent directory traversal not allowed');
  }
}

/**
 * Configure a local dd agent for accepting logs from IDE Shepherd.
 */
export async function configureAgentLogging(port: number): Promise<void> {
  if (port < 1024 || port >= 65536) {
    throw new Error('Invalid port number provided for Datadog Agent logging');
  }

  Logger.info(`Configuring Datadog Agent for IDE Shepherd on port ${port}`);

  const configFile = `logs:\n
    - type: tcp\n
      port: ${port}\n
      service: "${CONFIG.DATADOG.SERVICE}"\n    
      source: "${CONFIG.DATADOG.SOURCE}"\n`;

  const agentConfigBaseDir = await getAgentConfigBaseDir();
  const shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');
  const shepherdConfigFile = path.join(shepherdConfigDir, 'conf.yaml');

  // Prevent path traversal attacks
  validateConfigPath(shepherdConfigDir, agentConfigBaseDir);
  validateConfigPath(shepherdConfigFile, shepherdConfigDir);

  try {
    try {
      await fs.access(shepherdConfigDir);
      Logger.debug(`Directory ${shepherdConfigDir} already exists`);
    } catch {
      await fs.mkdir(shepherdConfigDir, { recursive: true });
      Logger.info(`Created directory ${shepherdConfigDir} for Datadog Agent configuration`);
    }

    await fs.writeFile(shepherdConfigFile, configFile, 'utf-8');
    Logger.info(`Wrote file ${shepherdConfigFile} with Datadog Agent configuration`);

    const writtenContent = await fs.readFile(shepherdConfigFile, 'utf-8');
    if (writtenContent !== configFile) {
      throw new Error('Configuration file content verification failed');
    }
  } catch (error) {
    Logger.error('Failed to configure Datadog Agent', error as Error);
    throw new Error(`Failed to configure Datadog Agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function removeAgentLogging(): Promise<void> {
  try {
    const agentConfigBaseDir = await getAgentConfigBaseDir();
    const shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');

    // Prevent path traversal attacks
    validateConfigPath(shepherdConfigDir, agentConfigBaseDir);

    try {
      await fs.access(shepherdConfigDir);
    } catch {
      Logger.info('No Datadog Agent configuration directory to remove');
      return;
    }

    await fs.rm(shepherdConfigDir, { recursive: true, force: true });
    Logger.info(`Deleted directory ${shepherdConfigDir} with Datadog Agent configuration`);
  } catch (error) {
    Logger.error('Failed to remove Datadog Agent configuration', error as Error);
    throw new Error(
      `Failed to delete directory with Datadog Agent configuration for IDE Shepherd: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export async function hasAgentConfiguration(): Promise<boolean> {
  try {
    const agentConfigBaseDir = await getAgentConfigBaseDir();
    const shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');
    const shepherdConfigFile = path.join(shepherdConfigDir, 'conf.yaml');

    // Prevent path traversal attacks
    validateConfigPath(shepherdConfigDir, agentConfigBaseDir);
    validateConfigPath(shepherdConfigFile, shepherdConfigDir);

    await fs.access(shepherdConfigFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the filesystem path to the Datadog Agent's base configuration directory.
 * Returns the confd_path from the agent, which is the base directory for all integrations.
 */
async function getAgentConfigBaseDir(): Promise<string> {
  try {
    // Query Datadog Agent status to get configuration directory
    const { stdout } = await execAsync('datadog-agent status --json');

    let confdPath: string | undefined;
    try {
      confdPath = (JSON.parse(stdout) as { config?: { confd_path: string } })?.config?.confd_path;
    } catch (parseError) {
      throw new Error('Failed to parse Datadog Agent status report as JSON');
    }

    if (!confdPath) {
      throw new Error('Datadog Agent configuration directory (confd_path) is not set');
    }

    return confdPath;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('command not found') || error.message.includes('ENOENT')) {
        throw new Error(
          'Unable to query Datadog Agent status: please ensure the Agent is installed and running. ' +
            'Linux/macOS users may need sudo to run this command.',
        );
      }
      throw error;
    }
    throw new Error('Unknown error while getting Datadog Agent configuration directory');
  }
}

export async function isAgentRunning(): Promise<boolean> {
  try {
    await execAsync('datadog-agent status --json');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false); // some other error, treat as unavailable
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Restart the Datadog Agent, we're only supporting macOS for now :p
 */
export async function restartAgent(): Promise<void> {
  const platform = process.platform;

  if (platform !== 'darwin') {
    throw new Error(`Unsupported platform: ${platform}. Automatic restart only supported on macOS.`);
  }

  try {
    await execAsync('launchctl stop com.datadoghq.agent');
    Logger.info('Datadog Agent stop command executed');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await execAsync('launchctl start com.datadoghq.agent');
    Logger.info('Datadog Agent start command executed');
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } catch (error) {
    Logger.error('Failed to restart Datadog Agent', error as Error);
    throw new Error(`Failed to restart Datadog Agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
