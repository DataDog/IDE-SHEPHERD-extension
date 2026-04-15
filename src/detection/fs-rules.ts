/**
 * File System Rules - Rule definitions for file system access analysis
 *
 * Paths are normalized to forward slashes before matching.
 * Patterns are case-insensitive to handle Windows paths correctly.
 */

import { SeverityLevel } from '../lib/events/sec-events';
import { Target } from '../lib/events/ext-events';
import { FsOperation } from '../lib/events/fs-events';

export enum FsRuleType {
  READ = 'READ',
  WRITE = 'WRITE',
}

export interface FsRule {
  id: string;
  name: string;
  description: string;
  type: FsRuleType;
  target: Target;
  severity: SeverityLevel;
  /** Matched against the normalized (forward-slash) absolute path. */
  pathPattern: RegExp;
  /** Which fs operations this rule applies to. */
  operations: FsOperation[];
  confidence: number;
}

export const FS_RULES: FsRule[] = [
  // ─── READ HIGH ──────────────────────────────────────────────────────────────

  {
    id: 'read_ssh_private_key',
    name: 'SSH Private Key Read',
    description: 'Detected read access to SSH private key file',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Matches ~/.ssh/id_rsa (and variants) on all platforms
    pathPattern: /[/\\]\.ssh[/\\](id_rsa|id_ed25519|id_ecdsa|id_dsa)$/i,
    operations: ['read'],
    confidence: 1,
  },

  {
    id: 'read_system_passwd',
    name: 'System Password File Read',
    description: 'Detected read access to system password or shadow file',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Unix only — no Windows equivalent
    pathPattern: /^\/etc\/(shadow|master\.passwd|passwd)$/i,
    operations: ['read'],
    confidence: 1,
  },

  {
    id: 'read_aws_credentials',
    name: 'AWS Credentials Read',
    description: 'Detected read access to AWS credentials file',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Matches ~/.aws/credentials (Unix) and %USERPROFILE%\.aws\credentials (Windows)
    pathPattern: /[/\\]\.aws[/\\]credentials$/i,
    operations: ['read'],
    confidence: 1,
  },

  {
    id: 'read_gnupg_key',
    name: 'GnuPG Key Read',
    description: 'Detected read access to GnuPG private key material',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Matches ~/.gnupg/ (Unix) and %APPDATA%\gnupg\ (Windows)
    pathPattern: /(\.gnupg|AppData[/\\]Roaming[/\\]gnupg)[/\\]/i,
    operations: ['read'],
    confidence: 1,
  },

  {
    id: 'read_netrc',
    name: 'Netrc Credentials Read',
    description: 'Detected read access to .netrc file containing plaintext credentials',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    pathPattern: /[/\\]\.netrc$/i,
    operations: ['read'],
    confidence: 1,
  },

  // ─── READ MEDIUM ────────────────────────────────────────────────────────────

  {
    id: 'read_aws_config',
    name: 'AWS Config Read',
    description: 'Detected read access to AWS config file (may contain role ARNs and profile data)',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.MEDIUM,
    pathPattern: /[/\\]\.aws[/\\]config$/i,
    operations: ['read'],
    confidence: 0.9,
  },

  {
    id: 'read_kube_config',
    name: 'Kubernetes Config Read',
    description: 'Detected read access to Kubernetes config file containing cluster credentials',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.MEDIUM,
    // Matches ~/.kube/config (Unix and Windows)
    pathPattern: /[/\\]\.kube[/\\]config$/i,
    operations: ['read'],
    confidence: 0.8,
  },

  {
    id: 'read_shell_history',
    name: 'Shell History Read',
    description: 'Detected read access to shell history file (reconnaissance for secrets typed in terminal)',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.MEDIUM,
    pathPattern: /[/\\]\.(bash_history|zsh_history|sh_history)$/i,
    operations: ['read'],
    confidence: 1,
  },

  {
    id: 'read_git_credentials',
    name: 'Git Credentials Read',
    description: 'Detected read access to Git credentials file containing plaintext tokens',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.MEDIUM,
    pathPattern: /[/\\]\.git-credentials$/i,
    operations: ['read'],
    confidence: 0.9,
  },

  {
    id: 'read_docker_config',
    name: 'Docker Config Read',
    description: 'Detected read access to Docker config file containing registry auth tokens',
    type: FsRuleType.READ,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.MEDIUM,
    // Matches ~/.docker/config.json (Unix) and %APPDATA%\Docker\config.json (Windows)
    pathPattern: /(\.docker|AppData[/\\]Roaming[/\\]Docker)[/\\]config\.json$/i,
    operations: ['read'],
    confidence: 0.8,
  },

  // ─── WRITE HIGH ─────────────────────────────────────────────────────────────

  {
    id: 'write_authorized_keys',
    name: 'SSH Authorized Keys Write',
    description: 'Detected write to SSH authorized_keys file — potential backdoor persistence',
    type: FsRuleType.WRITE,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Matches ~/.ssh/authorized_keys (Unix) and ProgramData\ssh\administrators_authorized_keys (Windows)
    pathPattern: /(authorized_keys|administrators_authorized_keys)$/i,
    operations: ['write', 'append'],
    confidence: 1,
  },

  {
    id: 'write_cron',
    name: 'Cron / Scheduled Task Write',
    description: 'Detected write to cron or Windows Scheduled Tasks directory — potential persistence',
    type: FsRuleType.WRITE,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Unix: /etc/cron.d/, /etc/crontab, /etc/cron.daily|hourly|weekly|monthly/
    // Windows: C:\Windows\System32\Tasks\, C:\Windows\SysWOW64\Tasks\
    pathPattern:
      /(^\/etc\/(cron\.d\/|crontab$|cron\.(daily|hourly|weekly|monthly)\/)|[/\\]Windows[/\\](System32|SysWOW64)[/\\]Tasks[/\\])/i,
    operations: ['write', 'append'],
    confidence: 1,
  },

  {
    id: 'write_launch_agent',
    name: 'Launch Agent / Startup Write',
    description: 'Detected write to launchd or Windows startup directory — potential persistence',
    type: FsRuleType.WRITE,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // macOS: ~/Library/LaunchAgents/*.plist, /Library/LaunchDaemons/*.plist
    // Windows: %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
    pathPattern:
      /(Library[/\\]Launch(Agents|Daemons)[/\\].*\.plist$|AppData[/\\]Roaming[/\\]Microsoft[/\\]Windows[/\\]Start Menu[/\\]Programs[/\\]Startup[/\\])/i,
    operations: ['write', 'append'],
    confidence: 1,
  },

  {
    id: 'write_etc_hosts',
    name: 'Hosts File Write',
    description: 'Detected write to hosts file — potential DNS poisoning',
    type: FsRuleType.WRITE,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.HIGH,
    // Unix: /etc/hosts  Windows: C:\Windows\System32\drivers\etc\hosts
    pathPattern: /(^\/etc\/hosts$|[/\\]Windows[/\\]System32[/\\]drivers[/\\]etc[/\\]hosts$)/i,
    operations: ['write', 'append'],
    confidence: 1,
  },

  // ─── WRITE MEDIUM ───────────────────────────────────────────────────────────

  {
    id: 'write_shell_profile',
    name: 'Shell Profile Write',
    description: 'Detected write to shell profile or PowerShell profile — potential startup persistence',
    type: FsRuleType.WRITE,
    target: Target.FILESYSTEM,
    severity: SeverityLevel.MEDIUM,
    // Unix shell profiles + Windows PowerShell profile
    pathPattern:
      /[/\\](\.(bashrc|zshrc|bash_profile|zprofile|profile|bash_logout)|Microsoft\.PowerShell_profile\.ps1)$/i,
    operations: ['write', 'append'],
    confidence: 0.8,
  },
];

export function getRuleById(id: string): FsRule | undefined {
  return FS_RULES.find((rule) => rule.id === id);
}

export function getRulesByType(type: FsRuleType): FsRule[] {
  return FS_RULES.filter((rule) => rule.type === type);
}

export function getRulesBySeverity(severity: SeverityLevel): FsRule[] {
  return FS_RULES.filter((rule) => rule.severity === severity);
}

export function getAllRules(): FsRule[] {
  return [...FS_RULES];
}
