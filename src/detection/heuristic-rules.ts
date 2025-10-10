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

  // Dependency Rules
  {
    id: 'many_dependencies',
    name: 'Many Dependencies',
    description: 'Extension has an unusually high number of dependencies',
    category: PatternCategory.Dependencies,
    severity: SeverityLevel.LOW,
    check: (pkg: ExtensionPackageJSON) => {
      const deps = pkg.dependencies || {};
      return Object.keys(deps).length > 20;
    },
    getDetails: (pkg: ExtensionPackageJSON) => {
      const count = Object.keys(pkg.dependencies || {}).length;
      return `Extension has ${count} dependencies`;
    },
  },
  {
    id: 'no_dependencies_lock',
    name: 'Missing Dependency Lock',
    description: 'Dependencies without lock file may be vulnerable to supply chain attacks',
    category: PatternCategory.Dependencies,
    severity: SeverityLevel.MEDIUM,
    check: (pkg: ExtensionPackageJSON) => {
      const deps = pkg.dependencies || {};
      // Check if versions use ranges instead of exact versions
      return Object.values(deps).some((version) => /^[~^]/.test(version));
    },
    getDetails: (pkg: ExtensionPackageJSON) => {
      const deps = pkg.dependencies || {};
      const rangedDeps = Object.entries(deps).filter(([_, version]) => /^[~^]/.test(version));
      return `${rangedDeps.length} dependencies use version ranges: ${rangedDeps.map(([name]) => name).join(', ')}`;
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
