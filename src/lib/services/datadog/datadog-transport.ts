/**
 * Datadog Transport Layer - Handles communication with Datadog Agent
 */

import * as net from 'net';
import * as vscode from 'vscode';
import { Logger } from '../../logger';
import { TelemetryLogItem } from './types';
import type { OCSFDetectionFinding, OCSFAppSecurityPostureFinding } from './ocsf-types';

export interface DatadogConfig {
  isEnabled: boolean;
  agentPort?: number;
}

/**
 * Handles TCP socket communication with Datadog Agent
 */
export class DatadogTransport {
  getConfig(): DatadogConfig {
    const config = vscode.workspace.getConfiguration('ide-shepherd.datadog');
    return { isEnabled: config.get<boolean>('isEnabled') || false, agentPort: config.get<number>('agentPort') };
  }

  isEnabled(): boolean {
    return this.getConfig().isEnabled;
  }

  /**
   * Send log items to Datadog Agent via TCP socket
   */
  async send(logItems: (TelemetryLogItem | OCSFDetectionFinding | OCSFAppSecurityPostureFinding)[]): Promise<void> {
    const config = this.getConfig();
    if (!config.isEnabled || !config.agentPort) {
      throw new Error('Datadog Agent is not configured');
    }

    const agentPort = config.agentPort;

    return new Promise((resolve, reject) => {
      try {
        const socket = net.createConnection({ host: 'localhost', port: agentPort }, () => {
          Logger.debug(`DatadogTransport: Connected to Agent on port ${agentPort}`);

          for (const item of logItems) {
            const logMessage = JSON.stringify(item) + '\n';
            const sent = socket.write(logMessage);

            if (!sent) {
              Logger.warn('DatadogTransport: Socket buffer full, message may be delayed');
            }
          }
          socket.end();
        });

        socket.on('close', () => {
          resolve();
        });

        socket.on('error', (error) => {
          Logger.error('DatadogTransport: Failed to connect to Agent', error);
          reject(new Error(`Failed to forward logs to Datadog Agent: ${error.message}`));
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Connection to Datadog Agent timed out'));
        });

        socket.setTimeout(5000);
      } catch (error) {
        Logger.error('DatadogTransport: Failed to send data', error as Error);
        reject(error);
      }
    });
  }
}
