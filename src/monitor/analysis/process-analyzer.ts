import { SecurityEvent } from '../../lib/events/sec-events';
import { Logger } from '../../lib/logger';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { AnalysisResult } from './analyzer';
import { ExecEvent } from '../../lib/events/process-events';
import { PROCESS_RULES } from '../../detection/process-rules';

export class ProcessAnalyzer {
  analyze(ev: ExecEvent): AnalysisResult | undefined {
    const startTime = Date.now();

    try {
      let result = new AnalysisResult();

      // Check all process rules
      for (const rule of PROCESS_RULES) {
        const checkResult = this.checkRule(ev, rule);
        if (checkResult.securityEvent) {
          result = checkResult;
          break; // stop on first security event found
        }
      }

      if (!ev.extension) {
        Logger.error('ProcessAnalyzer: Process event missing extension info');
        return new AnalysisResult();
      }

      result = result.checkAgainstAllowList(ev.extension.id, ev.cmd, 'ProcessAnalyzer');

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      IDEStatusService.updatePerformanceMetrics(processingTime).catch((error) => {
        Logger.error(`ProcessAnalyzer: Failed to record processing time: ${error.message}`);
      });

      return result;
    } catch (error) {
      Logger.error('ProcessAnalyzer: Error during analysis', error as Error);
      return new AnalysisResult();
    }
  }

  private checkRule(ev: ExecEvent, rule: (typeof PROCESS_RULES)[0]): AnalysisResult {
    const fullCommand = `${ev.cmd} ${ev.args.join(' ')}`;

    // Check if command matches the rule's command pattern
    const commandMatches = rule.commandPattern.test(ev.cmd) || rule.commandPattern.test(fullCommand);

    if (!commandMatches) {
      return new AnalysisResult();
    }

    if (rule.flagPattern) {
      if (!rule.flagPattern.test(fullCommand)) {
        return new AnalysisResult();
      }
    }

    if (!ev.extension) {
      return new AnalysisResult();
    }

    return new AnalysisResult(
      { allowed: false },
      new SecurityEvent(ev, ev.extension, rule.severity, rule.type, [
        {
          finding: fullCommand,
          rule: rule.name,
          description: `${rule.description}: ${fullCommand}`,
          confidence: rule.confidence,
          severity: rule.severity,
        },
      ]),
    );
  }
}
