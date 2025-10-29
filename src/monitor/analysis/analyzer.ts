import { Verdict, SecurityEvent, SeverityLevel, IoC, SecurityEventType } from '../../lib/events/sec-events';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { Logger } from '../../lib/logger';
import { TargetEvent, ExtensionInfo, Target } from '../../lib/events/ext-events';
import { BaseRule } from '../../detection/rules';

export class AnalysisResult {
  verdict: Verdict;
  securityEvent?: SecurityEvent;

  constructor(verdict?: Verdict, securityEvent?: SecurityEvent) {
    this.verdict = verdict ?? { allowed: true };
    this.securityEvent = securityEvent;
  }

  /**
   * If the extension is on the allowlist, logs a warning and marks as allowed.
   * Otherwise, emits the security event if one exists.
   */
  checkAgainstAllowList(extensionId: string, context: string, analyzerName: string): AnalysisResult {
    if (!this.securityEvent) {
      return this;
    }

    const allowListService = AllowListService.getInstance();
    const isAllowed = allowListService.isAllowed(extensionId);

    if (isAllowed) {
      Logger.warn(
        `${analyzerName}: Extension ${extensionId} is on allow list. Activity detected but not blocked: ${context}`,
      );
      return new AnalysisResult({ allowed: true });
    } else {
      IDEStatusService.emitSecurityEvent(this.securityEvent).catch((error) => {
        Logger.error(`${analyzerName}: Failed to record security event: ${error.message}`);
      });
      return this;
    }
  }
}

/**
 * Base analyzer class implementing the Template Method pattern
 * Provides common analysis flow and violation creation
 */
export abstract class BaseAnalyzer<TEvent extends TargetEvent<Target>, TRule extends BaseRule<SecurityEventType>> {
  protected abstract readonly analyzerName: string;

  analyze(event: TEvent): AnalysisResult | undefined {
    const startTime = Date.now();

    try {
      let result = this.executeRuleChecks(event);

      result = result.checkAgainstAllowList(event.extension.id, this.getContext(event), this.analyzerName);

      this.recordMetrics(startTime);

      return result;
    } catch (error) {
      Logger.error(`${this.analyzerName}: Error during analysis`, error as Error);
      return new AnalysisResult();
    }
  }

  protected abstract executeRuleChecks(event: TEvent): AnalysisResult;

  protected abstract getContext(event: TEvent): string;

  protected createViolation(
    event: TEvent,
    extension: ExtensionInfo,
    rule: TRule,
    finding: string,
    description: string,
  ): AnalysisResult {
    return new AnalysisResult(
      { allowed: false },
      new SecurityEvent(event, extension, rule.severity, rule.type, [
        { finding, rule: rule.name, description, confidence: rule.confidence, severity: rule.severity },
      ]),
    );
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(startTime: number): void {
    const processingTime = Date.now() - startTime;
    IDEStatusService.updatePerformanceMetrics(processingTime).catch((error) => {
      Logger.error(`${this.analyzerName}: Failed to record processing time: ${error.message}`);
    });
  }
}
