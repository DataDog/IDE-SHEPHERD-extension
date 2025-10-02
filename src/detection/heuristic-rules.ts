/**
 * Heuristic Rules - Rule definitions for extension security analysis
 */

import { HeuristicRule, PatternCategory } from '../lib/heuristics';
import { SeverityLevel } from '../lib/events/sec-events';

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
      category: PatternCategory.Metadata,
      severity: SeverityLevel.MEDIUM,
      check: (pkg: any) => {
        const description = pkg?.description || '';
        return !description || description.length < 10;
      },
    },
    {
      id: 'missing_publisher',
      name: 'Missing Publisher',
      description: 'Extension has no or suspicious publisher information',
      category: PatternCategory.Metadata,
      severity: SeverityLevel.MEDIUM,
      check: (pkg: any) => {
        const publisher = pkg?.publisher || '';
        return !publisher || publisher.length < 3;
      },
    },
    {
      id: 'missing_repository',
      name: 'Missing Repository',
      description: 'Extension has no repository or homepage link',
      category: PatternCategory.Metadata,
      severity: SeverityLevel.LOW,
      check: (pkg: any) => {
        return !pkg?.repository && !pkg?.homepage;
      },
    },
    {
      id: 'suspicious_version',
      name: 'Suspicious Version',
      description: 'Extension has suspicious version pattern',
      category: PatternCategory.Metadata,
      severity: SeverityLevel.LOW,
      check: (pkg: any) => {
        const version = pkg?.version || '';
        return /^(0\.0\.|99\.|999\.)/.test(version);
      },
    },
    {
      id: 'generic_category',
      name: 'Generic Category',
      description: 'Extension has generic category',
      category: PatternCategory.Metadata,
      severity: SeverityLevel.MEDIUM,
      check: (pkg: any) => {
        const category = pkg?.category || '';
        return category === 'other';
      },
    },

    // Activation Event Rules
    {
      id: 'wildcard_activation',
      name: 'Wildcard Activation',
      description: 'Extension activates on all events (*)',
      category: PatternCategory.Activation,
      severity: SeverityLevel.MEDIUM,
      check: (pkg: any) => {
        const activationEvents = pkg?.activationEvents || [];
        return activationEvents.includes('*');
      },
    },
    {
      id: 'hidden_commands',
      name: 'Hidden Commands',
      description: 'Extension has commands not exposed in UI',
      category: PatternCategory.Commands,
      severity: SeverityLevel.LOW,
      check: (pkg: any) => {
        const contributes = pkg?.contributes || {};
        const commands = contributes.commands || [];
        const hiddenCommands = commands.filter((cmd: any) => !cmd.title || cmd.when === 'false');
        return hiddenCommands.length > 0;
      },
    },
  ];

  static getRuleById(id: string): HeuristicRule | undefined {
    return this.RULES.find((rule) => rule.id === id);
  }

  static getRulesByCategory(category: PatternCategory): HeuristicRule[] {
    return this.RULES.filter((rule) => rule.category === category);
  }

  static getRulesBySeverity(severity: SeverityLevel): HeuristicRule[] {
    return this.RULES.filter((rule) => rule.severity === severity);
  }

  static getAllRules(): HeuristicRule[] {
    return [...this.RULES];
  }
}
