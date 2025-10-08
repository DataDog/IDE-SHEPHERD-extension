import { Verdict, SecurityEvent } from '../../lib/events/sec-events';
import { AllowListService } from '../../lib/services/allowlist-service';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { Logger } from '../../lib/logger';

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
