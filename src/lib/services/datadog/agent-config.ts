/**
 * Datadog Agent Configuration Utilities
 * Provides utilities for configuring the local Datadog Agent to receive logs from IDE Shepherd.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../logger';
import { CONFIG } from '../../config';

const execAsync = promisify(exec);
const DEFAULT_AGENT_PORT = 10518;

// Cache for config directory path to allow config file deletion even when agent is down
let cachedConfigPath: string | undefined;

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

  const agentConfigBaseDir = await getAgentConfigDir();
  const shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');
  const shepherdConfigFile = path.join(shepherdConfigDir, 'conf.yaml');

  try {
    try {
      await fs.access(shepherdConfigDir);
      Logger.debug(`Directory ${shepherdConfigDir} already exists`);
    } catch {
      await fs.mkdir(shepherdConfigDir, { recursive: true });
      Logger.info(`Created directory ${shepherdConfigDir} for Datadog Agent configuration`);
    }

    await fs.writeFile(shepherdConfigFile, configFile, 'utf-8');
    cachedConfigPath = shepherdConfigDir;

    Logger.info(`Wrote file ${shepherdConfigFile} with Datadog Agent configuration`);
  } catch (error) {
    Logger.error('Failed to configure Datadog Agent', error as Error);
    throw new Error(`Failed to configure Datadog Agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function removeAgentLogging(): Promise<void> {
  try {
    let shepherdConfigDir: string;

    // Try to get path from agent first, fall back to cached path if agent is down
    try {
      const agentConfigBaseDir = await getAgentConfigDir();
      shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');
    } catch (error) {
      if (cachedConfigPath) {
        shepherdConfigDir = cachedConfigPath;
        Logger.info('Agent is down, using cached config path for deletion');
      } else {
        Logger.warn('Cannot remove config: agent is down and no cached path available');
        throw new Error('Datadog Agent is not running and config path is not cached');
      }
    }

    try {
      await fs.access(shepherdConfigDir);
    } catch {
      Logger.info('No Datadog Agent configuration directory to remove');
      cachedConfigPath = undefined;
      return;
    }

    await fs.rm(shepherdConfigDir, { recursive: true, force: true });
    cachedConfigPath = undefined;
    Logger.info(`Deleted directory ${shepherdConfigDir} with Datadog Agent configuration`);
  } catch (error) {
    Logger.error('Failed to remove Datadog Agent configuration', error as Error);
    throw new Error(
      `Failed to delete directory with Datadog Agent configuration for IDE Shepherd: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Get the filesystem path to the Datadog Agent's base configuration directory.
 * Returns the confd_path from the agent, which is the base directory for all integrations.
 */
async function getAgentConfigDir(): Promise<string> {
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
        throw new Error('Unable to query Datadog Agent status: please ensure the Agent is installed and running. ');
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
 * Check if IDE Shepherd configuration is loaded in the Datadog Agent
 * Returns true if "ide-shepherd" is found in the agent status output
 */
export async function isShepherdConfigLoaded(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('datadog-agent status');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return stdout.includes('ide-shepherd');
  } catch {
    return false;
  }
}

/**
 * Check if IDE Shepherd configuration file already exists
 * use case: when multiple instances are installed on two or more IDEs
 */
export async function doesShepherdConfigExist(): Promise<boolean> {
  try {
    const agentConfigBaseDir = await getAgentConfigDir();
    const shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');
    const shepherdConfigFile = path.join(shepherdConfigDir, 'conf.yaml');

    await fs.access(shepherdConfigFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the port from existing IDE Shepherd configuration file
 */
export async function readPortFromConfig(): Promise<number | undefined> {
  try {
    const agentConfigBaseDir = await getAgentConfigDir();
    const shepherdConfigDir = path.join(agentConfigBaseDir, 'ide-shepherd.d');
    const shepherdConfigFile = path.join(shepherdConfigDir, 'conf.yaml');

    const configContent = await fs.readFile(shepherdConfigFile, 'utf-8');
    const portMatch = configContent.match(/port:\s*(\d+)/);

    if (portMatch && portMatch[1]) {
      return parseInt(portMatch[1], 10);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: port, method: 'HEAD', timeout: 1000 }, () => {
      resolve(false);
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') {
        resolve(true);
      } else {
        resolve(false); // we'll treat any other error as unavailable
      }
    });

    req.end();
  });
}

/**
 * Tries default port 10518 first, then random ports if needed.
 */
export async function findAvailablePort(): Promise<number> {
  if (await isPortAvailable(DEFAULT_AGENT_PORT)) {
    Logger.info(`Using default port ${DEFAULT_AGENT_PORT} for Datadog Agent`);
    return DEFAULT_AGENT_PORT;
  }

  for (let i = 0; i < 5; i++) {
    // 5 tries should be enough
    const randomPort = Math.floor(Math.random() * (65535 - 10000) + 10000);
    if (await isPortAvailable(randomPort)) {
      Logger.info(`Default port ${DEFAULT_AGENT_PORT} was taken, using random port ${randomPort}`);
      return randomPort;
    }
  }

  throw new Error('Unable to find an available port for Datadog Agent. Please try again later.');
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
