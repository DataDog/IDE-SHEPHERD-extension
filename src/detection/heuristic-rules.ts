/**
 * Heuristic Rules - Rule definitions for extension security analysis
 */

import { HeuristicRule, MetadataSeverityLevel, PatternCategory } from '../lib/heuristics';

/**
 * Heuristic rules for extension analysis
 */
export class HeuristicRules {
  static readonly RULES: HeuristicRule[] = [
    // Metadata Quality Rules
    {
      id: 'void_description',
      name: 'Void Description',
      description: 'Extension has no description or very short description',
      category: 'metadata',
      severity: 'medium',
      check: (pkg: any) => {
        const description = pkg?.description || '';
        return !description || description.length < 10;
      }
    },
    {
      id: 'missing_publisher',
      name: 'Missing Publisher',
      description: 'Extension has no or suspicious publisher information',
      category: 'metadata',
      severity: 'medium',
      check: (pkg: any) => {
        const publisher = pkg?.publisher || '';
        return !publisher || publisher.length < 3;
      }
    },
    {
      id: 'missing_repository',
      name: 'Missing Repository',
      description: 'Extension has no repository or homepage link',
      category: 'metadata',
      severity: 'low',
      check: (pkg: any) => {
        return !pkg?.repository && !pkg?.homepage;
      }
    },
    {
      id: 'suspicious_version',
      name: 'Suspicious Version',
      description: 'Extension has suspicious version pattern',
      category: 'metadata',
      severity: 'low',
      check: (pkg: any) => {
        const version = pkg?.version || '';
        return /^(0\.0\.|99\.|999\.)/.test(version);
      }
    },
    {
        id: 'generic_category',
        name: 'Generic Category',
        description: 'Extension has generic category',
        category: 'metadata',
        severity: 'medium',
        check: (pkg: any) => {
          const category = pkg?.category || '';
          return category === 'other';
        }
    },

    // Activation Event Rules
    {
      id: 'wildcard_activation',
      name: 'Wildcard Activation',
      description: 'Extension activates on all events (*) - potential privacy risk',
      category: 'activation',
      severity: 'medium',
      check: (pkg: any) => {
        const activationEvents = pkg?.activationEvents || [];
        return activationEvents.includes('*');
      }
    },
    {
      id: 'startup_activation',
      name: 'Startup Activation',
      description: 'Extension activates on VS Code startup',
      category: 'activation',
      severity: 'low',
      check: (pkg: any) => {
        const activationEvents = pkg?.activationEvents || [];
        const startupEvents = ['onStartupFinished', 'onCommand:workbench.action.showCommands'];
        return activationEvents.some((event: string) => startupEvents.includes(event));
      }
    },

    // Permission Rules
    {
      id: 'shell_execution',
      name: 'Shell Execution',
      description: 'Extension can execute shell commands',
      category: 'permissions',
      severity: 'high',
      check: (pkg: any) => {
        const scripts = pkg?.scripts || {};
        return scripts.includes('child_process') ||
               scripts.includes('exec(') ||
               scripts.includes('spawn(');
      }
    },

    // Command Rules
    {
      id: 'hidden_commands',
      name: 'Hidden Commands',
      description: 'Extension has commands not exposed in UI',
      category: 'commands',
      severity: 'low',
      check: (pkg: any) => {
        const contributes = pkg?.contributes || {};
        const commands = contributes.commands || [];
        const hiddenCommands = commands.filter((cmd: any) => !cmd.title || cmd.when === "false");
        return hiddenCommands.length > 0;
      }
    },

    // Additional Security Rules
    {
      id: 'obfuscated_code',
      name: 'Obfuscated Code',
      description: 'Extension may contain obfuscated or minified code',
      category: 'permissions',
      severity: 'high',
      check: (pkg: any) => {
        const packageString = JSON.stringify(pkg).toLowerCase();
        return packageString.includes('webpack') || 
               packageString.includes('minify') ||
               packageString.includes('obfuscat') ||
               packageString.includes('uglify');
      }
    }
  ];

  static getRuleById(id: string): HeuristicRule | undefined {
    return this.RULES.find(rule => rule.id === id);
  }

  static getRulesByCategory(category: PatternCategory): HeuristicRule[] {
    return this.RULES.filter(rule => rule.category === category);
  }

  static getRulesBySeverity(severity: MetadataSeverityLevel): HeuristicRule[] {
    return this.RULES.filter(rule => rule.severity === severity);
  }

  static getAllRules(): HeuristicRule[] {
    return [...this.RULES];
  }
}
