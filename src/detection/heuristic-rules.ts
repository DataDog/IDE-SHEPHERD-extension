/**
 * Heuristic Rules - Rule definitions for extension security analysis
 */

import { HeuristicRule, PatternCategory } from '../lib/heuristics';
import { SeverityLevel } from '../lib/events/sec-events';
import { ExtensionPackageJSON } from '../lib/extensions';

/**
 * Heuristic rules for extension analysis
 */
export const HEURISTIC_RULES: HeuristicRule[] = [
  // Metadata Quality Rules
  {
    id: 'void_description',
    name: 'Void Description',
    description: 'no description or very short description',
    category: PatternCategory.Metadata,
    severity: SeverityLevel.MEDIUM,
    check: (pkg: ExtensionPackageJSON) => {
      const description = pkg.description || '';
      return !description || description.length < 10;
    },
  },
  {
    id: 'missing_repository',
    name: 'Missing Repository',
    description: 'no repository or homepage link',
    category: PatternCategory.Metadata,
    severity: SeverityLevel.LOW,
    check: (pkg: ExtensionPackageJSON) => {
      return !pkg.repository && !pkg.homepage;
    },
  },
  {
    id: 'suspicious_version',
    name: 'Suspicious Version',
    description: 'suspicious version pattern (0.0.0, 99.99.99, etc.)',
    category: PatternCategory.Metadata,
    severity: SeverityLevel.LOW,
    check: (pkg: ExtensionPackageJSON) => {
      const version = pkg.version || '';
      return /^(0\.0\.|99\.|999\.)/.test(version);
    },
  },
  {
    id: 'generic_category',
    name: 'Generic Category',
    description: 'Extension has generic category Other',
    category: PatternCategory.Metadata,
    severity: SeverityLevel.MEDIUM,
    check: (pkg: ExtensionPackageJSON) => {
      const category = pkg.category || '';
      return category === 'other';
    },
  },

  // Activation Event Rules
  {
    id: 'wildcard_activation',
    name: 'Wildcard Activation',
    description: 'activates on all events (*)',
    category: PatternCategory.Activation,
    severity: SeverityLevel.MEDIUM,
    check: (pkg: ExtensionPackageJSON) => {
      const activationEvents = pkg.activationEvents || [];
      return activationEvents.includes('*');
    },
  },
  {
    id: 'hidden_commands',
    name: 'Hidden Commands',
    description: 'registeredcommands not exposed in UI',
    category: PatternCategory.Commands,
    severity: SeverityLevel.LOW,
    check: (pkg: ExtensionPackageJSON) => {
      const contributes = pkg.contributes || {};
      const commands = contributes.commands || [];
      const hiddenCommands = commands.filter((cmd) => !cmd.title || cmd.when === 'false');
      return hiddenCommands.length > 0;
    },
  },
];

export function getRuleById(id: string): HeuristicRule | undefined {
  return HEURISTIC_RULES.find((rule) => rule.id === id);
}

export function getRulesByCategory(category: PatternCategory): HeuristicRule[] {
  return HEURISTIC_RULES.filter((rule) => rule.category === category);
}

export function getRulesBySeverity(severity: SeverityLevel): HeuristicRule[] {
  return HEURISTIC_RULES.filter((rule) => rule.severity === severity);
}

export function getAllRules(): HeuristicRule[] {
  return [...HEURISTIC_RULES];
}
