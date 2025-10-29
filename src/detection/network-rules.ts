/**
 * Network Rules - Rule definitions for network traffic analysis
 */

import { BaseRule, createRuleHelpers } from './rules';
import { Target } from '../lib/events/ext-events';
import { SeverityLevel } from '../lib/events/sec-events';

export enum NetworkRuleType {
  URL = 'URL',
  IP = 'IP',
}

export interface NetworkRule extends BaseRule<NetworkRuleType> {
  pattern: RegExp;
}

/**
 * Network rules for traffic analysis
 */
export const NETWORK_RULES: NetworkRule[] = [
  // Suspicious Domain Rules
  {
    id: 'suspicious_domains',
    name: 'Suspicious Domains',
    description: 'Request to known suspicious domain',
    type: NetworkRuleType.URL,
    target: Target.NETWORK,
    severity: SeverityLevel.HIGH,
    pattern:
      /([a-zA-Z0-9\-\.\_]+)(bit\.ly|workers\.dev|appdomain\.cloud|ngrok\.io|termbin\.com|localhost\.run|webhook\.(site|cool)|oastify\.com|burpcollaborator\.(me|net)|trycloudflare\.com|oast\.(pro|live|site|online|fun|me)|ply\.gg|pipedream\.net|dnslog\.cn|webhook-test\.com|typedwebhook\.tools|beeceptor\.com|ngrok-free\.(app|dev))/,
    confidence: 1,
  },

  // Exfiltration Domain Rules
  {
    id: 'exfiltration_domains',
    name: 'Exfiltration Domains',
    description: 'Request to potential data exfiltration service',
    type: NetworkRuleType.URL,
    target: Target.NETWORK,
    severity: SeverityLevel.HIGH,
    pattern:
      /(discord\.com|transfer\.sh|filetransfer\.io|sendspace\.com|backblazeb2\.com|paste\.ee|pastebin\.com|hastebin\.com|ghostbin\.site|api\.telegram\.org|rentry\.co)/,
    confidence: 1,
  },

  // Malware Download Domain Rules
  {
    id: 'malware_download_domains',
    name: 'Malware Download Domains',
    description: 'Request to known malware distribution domain',
    type: NetworkRuleType.URL,
    target: Target.NETWORK,
    severity: SeverityLevel.HIGH,
    pattern: /(files\.catbox\.moe|notif\.su|solidity\.bot)/,
    confidence: 1,
  },

  // Intelligence Domain Rules
  {
    id: 'intel_domains',
    name: 'Intel Domains',
    description: 'Request to IP intelligence service',
    type: NetworkRuleType.URL,
    target: Target.NETWORK,
    severity: SeverityLevel.MEDIUM,
    pattern: /.{0,50}(ipinfo\.io|checkip\.dyndns\.org|ip\.me|jsonip\.com|ipify\.org|ifconfig\.me)/,
    confidence: 1,
  },

  // External IP Rules
  {
    id: 'external_ip',
    name: 'Unknown External IP',
    description: 'Request to external IP address',
    type: NetworkRuleType.IP,
    target: Target.NETWORK,
    severity: SeverityLevel.MEDIUM,
    pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
    confidence: 1,
  },
];

// Helper patterns for IP filtering
export const LOCAL_IP_PATTERN =
  /(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)\d{1,3}\.\d{1,3}\.\d{1,3}/;
export const WILDCARD_IP_PATTERN = /[0\.0\.0\.0]/;

const helpers = createRuleHelpers(NETWORK_RULES);

export const getRuleById = helpers.getRuleById;
export const getRulesByType = helpers.getRulesByType;
export const getRulesBySeverity = helpers.getRulesBySeverity;
export const getAllRules = helpers.getAllRules;
