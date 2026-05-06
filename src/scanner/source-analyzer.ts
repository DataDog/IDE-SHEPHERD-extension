import * as fs from 'fs';
import * as path from 'path';

import { Logger } from '../lib/logger';
import { SuspiciousPattern } from '../lib/heuristics';
import { PatternCategory } from '../lib/heuristics';
import { SOURCE_RULES } from '../detection/source-rules';

// Large well-known safe packages — skip to bound scan time.
const SKIP_NODE_MODULES = new Set(['typescript', '@vscode', '@types', 'electron']);

const MAX_FILES = 500;
const MAX_FILE_BYTES = 1024 * 1024;

export class SourceAnalyzer {
  static async analyzeExtension(extensionId: string, extensionPath: string): Promise<SuspiciousPattern[]> {
    const patterns: SuspiciousPattern[] = [];
    const triggeredRules = new Set<string>();
    let fileCount = 0;

    const walk = async (dir: string): Promise<void> => {
      if (fileCount >= MAX_FILES || triggeredRules.size === SOURCE_RULES.length) {
        return;
      }

      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (fileCount >= MAX_FILES || triggeredRules.size === SOURCE_RULES.length) {
          break;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (shouldSkip(entry.name, fullPath, extensionPath)) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          fileCount++;
          await scanFile(fullPath, extensionPath, triggeredRules, patterns);
        }
      }
    };

    try {
      await walk(extensionPath);
    } catch (error) {
      Logger.warn(`SourceAnalyzer: failed scanning ${extensionId}: ${error}`);
    }

    if (patterns.length > 0) {
      Logger.info(
        `SourceAnalyzer: ${extensionId} — ${patterns.length} source pattern(s) found after scanning ${fileCount} file(s)`,
      );
    }

    return patterns;
  }
}

async function scanFile(
  filePath: string,
  extensionPath: string,
  triggeredRules: Set<string>,
  patterns: SuspiciousPattern[],
): Promise<void> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE_BYTES) {
      return;
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    const relPath = path.relative(extensionPath, filePath);

    for (const rule of SOURCE_RULES) {
      if (triggeredRules.has(rule.id)) {
        continue;
      }
      if (rule.detect(content)) {
        triggeredRules.add(rule.id);
        patterns.push({
          pattern: rule.name,
          severity: rule.severity,
          description: `${rule.description} (${relPath})`,
          category: PatternCategory.Source,
        });
      }
    }
  } catch {
    // binary file or encoding error — skip
  }
}

function shouldSkip(name: string, fullPath: string, extensionPath: string): boolean {
  if (name.startsWith('.')) {
    return true;
  }
  // Inside node_modules, skip known-safe large packages to bound scan time
  const rel = path.relative(extensionPath, fullPath);
  if (rel.startsWith('node_modules' + path.sep) || rel === 'node_modules') {
    const parts = rel.split(path.sep);
    // parts[0] = 'node_modules', parts[1] = package name (or @scope)
    if (parts.length >= 2) {
      const pkg = parts[1].startsWith('@') && parts.length >= 3 ? `${parts[1]}` : parts[1];
      if (SKIP_NODE_MODULES.has(pkg)) {
        return true;
      }
    }
  }
  return false;
}
