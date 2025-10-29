import { BaseAnalyzer, AnalysisResult } from './analyzer';
import { ExecEvent } from '../../lib/events/process-events';
import { PROCESS_RULES, ProcessRule } from '../../detection/process-rules';

export class ProcessAnalyzer extends BaseAnalyzer<ExecEvent, ProcessRule> {
  protected readonly analyzerName = 'ProcessAnalyzer';

  protected getContext(event: ExecEvent): string {
    return event.cmd;
  }

  protected executeRuleChecks(event: ExecEvent): AnalysisResult {
    for (const rule of PROCESS_RULES) {
      const checkResult = this.checkRule(event, rule);
      if (checkResult.securityEvent) {
        return checkResult;
      }
    }

    return new AnalysisResult();
  }

  private checkRule(event: ExecEvent, rule: ProcessRule): AnalysisResult {
    const fullCommand = `${event.cmd} ${event.args.join(' ')}`;

    // Check if command matches the rule's command pattern
    const commandMatches = rule.commandPattern.test(event.cmd) || rule.commandPattern.test(fullCommand);

    if (!commandMatches) {
      return new AnalysisResult();
    }

    if (rule.flagPattern && !rule.flagPattern.test(fullCommand)) {
      return new AnalysisResult();
    }

    const description = `${rule.description}: ${fullCommand}`;
    return this.createViolation(event, event.extension, rule, fullCommand, description);
  }
}
