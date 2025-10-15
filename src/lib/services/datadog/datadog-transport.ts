/**
 * Datadog Transport Layer - Handles communication with Datadog Agent
 */

import * as net from 'net';
import { Logger } from '../../logger';
import { TelemetryLogItem } from './types';

export interface TransportConfig {
  agentPort: number;
}

/**
 * Handles TCP socket communication with Datadog Agent
 */
export class DatadogTransport {
  private config: TransportConfig;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  /**
   * Send log items to Datadog Agent via TCP socket
   */
  async send(logItems: TelemetryLogItem[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const socket = net.createConnection({ host: 'localhost', port: this.config.agentPort }, () => {
          Logger.debug(`DatadogTransport: Connected to Agent on port ${this.config.agentPort}`);

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
          Logger.debug('DatadogTransport: Successfully sent data to Agent');
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

  /**
   * Test connection to Datadog Agent
   */
  async testConnection(testPayload: TelemetryLogItem): Promise<void> {
    return this.send([testPayload]);
  }
}
