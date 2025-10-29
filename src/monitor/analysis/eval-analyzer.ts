import { SecurityEvent } from '../../lib/events/sec-events';
import { Logger } from '../../lib/logger';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { AnalysisResult } from './analyzer';
import { EvalEvent } from '../../lib/events/eval-events';
import { EVAL_RULES, EvalRule, EvalRuleType } from '../../detection/eval-rules';

export class EvalAnalyzer {
  analyze(ev: EvalEvent): AnalysisResult | undefined {
    const startTime = Date.now();

    try {
      let result = new AnalysisResult();

      for (const rule of EVAL_RULES) {
        // TODO: prioritize sever rules first when looping through rules
        const checkResult = this.checkRule(ev, rule);
        if (checkResult.securityEvent) {
          result = checkResult;
          break;
        }
      }

      result = result.checkAgainstAllowList(ev.extension.id, ev.code, 'EvalAnalyzer');

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      IDEStatusService.updatePerformanceMetrics(processingTime).catch((error) => {
        Logger.error(`EvalAnalyzer: Failed to record processing time: ${error.message}`);
      });

      return result;
    } catch (error) {
      Logger.error('EvalAnalyzer: Error during analysis', error as Error);
      return new AnalysisResult();
    }
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

  private checkCodeLength(ev: EvalEvent, rule: EvalRule): AnalysisResult {
    if (!rule.maxLength || ev.code.length <= rule.maxLength) {
      return new AnalysisResult();
    }

    return this.createViolation(
      ev,
      rule,
      `${rule.description}. Code length: ${ev.code.length} characters (max: ${rule.maxLength})`,
    );
  }

  private checkPattern(ev: EvalEvent, rule: EvalRule): AnalysisResult {
    if (!rule.pattern || !rule.pattern.test(ev.code)) {
      return new AnalysisResult();
    }

    return this.createViolation(ev, rule, `${rule.description}: ${ev.code.substring(0, 100)}`);
  }

  private createViolation(ev: EvalEvent, rule: EvalRule, description: string): AnalysisResult {
    return new AnalysisResult(
      { allowed: false },
      new SecurityEvent(ev, ev.extension, rule.severity, rule.type, [
        {
          finding: ev.code.substring(0, 100),
          rule: rule.name,
          description,
          confidence: rule.confidence,
          severity: rule.severity,
        },
      ]),
    );
  }
}
