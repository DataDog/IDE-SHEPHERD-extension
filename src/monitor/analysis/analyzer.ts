import { Verdict, SecurityEvent } from '../../lib/events/sec-events';

export class AnalysisResult {
  verdict: Verdict;
  securityEvent?: SecurityEvent;

  constructor(verdict?: Verdict, securityEvent?: SecurityEvent) {
    this.verdict = verdict ?? { allowed: true };
    this.securityEvent = securityEvent;
  }
}
