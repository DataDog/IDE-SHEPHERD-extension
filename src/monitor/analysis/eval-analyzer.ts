import { BaseAnalyzer, AnalysisResult } from './analyzer';
import { EvalEvent } from '../../lib/events/eval-events';
import { EVAL_RULES, EvalRule, EvalRuleType } from '../../detection/eval-rules';

export class EvalAnalyzer extends BaseAnalyzer<EvalEvent, EvalRule> {
  protected readonly analyzerName = 'EvalAnalyzer';

  protected getContext(event: EvalEvent): string {
    return event.code;
  }

  protected executeRuleChecks(event: EvalEvent): AnalysisResult {
    // TODO: prioritize severe rules first when looping through rules
    for (const rule of EVAL_RULES) {
      const checkResult = this.checkRule(event, rule);
      if (checkResult.securityEvent) {
        return checkResult;
      }
    }

    return new AnalysisResult();
  }

  private checkRule(ev: EvalEvent, rule: EvalRule): AnalysisResult {
    if (rule.type === EvalRuleType.CODE_LENGTH) {
      return this.checkCodeLength(ev, rule);
    }

    if (rule.type === EvalRuleType.SUSPICIOUS_PATTERN) {
      return this.checkPattern(ev, rule);
    }

    return new AnalysisResult();
  }

  private checkCodeLength(event: EvalEvent, rule: EvalRule): AnalysisResult {
    if (!rule.maxLength || event.code.length <= rule.maxLength) {
      return new AnalysisResult();
    }

    const description = `${rule.description}. Code length: ${event.code.length} characters (max: ${rule.maxLength})`;
    return this.createViolation(event, event.extension, rule, event.code.substring(0, 100), description);
  }

  private checkPattern(event: EvalEvent, rule: EvalRule): AnalysisResult {
    if (!rule.pattern || !rule.pattern.test(event.code)) {
      return new AnalysisResult();
    }

    const description = `${rule.description}: ${event.code.substring(0, 100)}`;
    return this.createViolation(event, event.extension, rule, event.code.substring(0, 100), description);
  }
}
