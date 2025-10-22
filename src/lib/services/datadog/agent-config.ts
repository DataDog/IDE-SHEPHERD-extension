/**
 * Datadog Agent Configuration Utilities
 * Provides utilities for configuring the local Datadog Agent to receive logs from IDE Shepherd.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../logger';
import { CONFIG } from '../../config';

const execAsync = promisify(exec);

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

  const shepherdConfigDir = await getAgentShepherdConfigDir();
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
    const shepherdConfigDir = await getAgentShepherdConfigDir();

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
    const shepherdConfigDir = await getAgentShepherdConfigDir();
    const shepherdConfigFile = path.join(shepherdConfigDir, 'conf.yaml');

    await fs.access(shepherdConfigFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the filesystem path to IDE Shepherd's configuration directory for
 * Datadog Agent log forwarding.
 */
async function getAgentShepherdConfigDir(): Promise<string> {
  try {
    // Query Datadog Agent status to get configuration directory
    const { stdout } = await execAsync('datadog-agent status --json');

    let agentStatus: any;
    try {
      agentStatus = JSON.parse(stdout);
    } catch (parseError) {
      throw new Error('Failed to parse Datadog Agent status report as JSON');
    }

    const confdPath = agentStatus?.config?.confd_path;
    if (!confdPath) {
      throw new Error('Datadog Agent configuration directory (confd_path) is not set');
    }

    return path.join(confdPath, 'ide-shepherd.d');
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
