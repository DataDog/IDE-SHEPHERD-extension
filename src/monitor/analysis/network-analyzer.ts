import { IoC, SeverityLevel, SecurityEvent } from '../../lib/events/sec-events';
import { NetworkEvent } from '../../lib/events/network-events';
import { Logger } from '../../lib/logger';
import { IDEStatusService } from '../../lib/services/ide-status-service';
import { AnalysisResult } from './analyzer';
import {
  NETWORK_RULES,
  NetworkRuleType,
  EXCLUDED_IP_PATTERN,
  WILDCARD_IP_PATTERN,
  LOCALHOST_PATTERN,
} from '../../detection/network-rules';

export class NetworkAnalyzer {
  analyze(ev: NetworkEvent): AnalysisResult | undefined {
    const startTime = Date.now();

    try {
      let result = new AnalysisResult();

      if (ev.phase === 'request:pre') {
        result = this.analyzeUrl(ev);
      }

      if (!ev.extension) {
        Logger.error('NetworkAnalyzer: Network event missing extension info');
        return new AnalysisResult();
      }

      result = result.checkAgainstAllowList(ev.extension.id, ev.url, 'NetworkAnalyzer');

      const endTime = Date.now();
      const processingTime = endTime - startTime; // in ms
      IDEStatusService.updatePerformanceMetrics(processingTime).catch((error) => {
        Logger.error(`NetworkAnalyzer: Failed to record processing time: ${error.message}`);
      });

      return result;
    } catch (error) {
      Logger.error('NetworkAnalyzer: Error during analysis', error as Error);
      return new AnalysisResult();
    }
  }

  private analyzeUrl(ev: NetworkEvent): AnalysisResult {
    const url = ev.url;

    // Check all URL-based rules
    for (const rule of NETWORK_RULES) {
      if (rule.type === NetworkRuleType.URL) {
        const result = this.checkRule(url, ev, rule);
        if (result) {
          return result;
        }
      }
    }

    // Check IP-based rules (with special filtering)
    const ipRule = NETWORK_RULES.find((r) => r.id === 'external_ip');
    if (ipRule) {
      const result = this.checkExternalIp(url, ev, ipRule);
      if (result) {
        return result;
      }
    }

    return new AnalysisResult();
  }

  private checkRule(url: string, ev: NetworkEvent, rule: (typeof NETWORK_RULES)[0]): AnalysisResult | null {
    const match = url.match(rule.pattern);
    if (match && ev.extension) {
      const matchedValue = match[0];
      return new AnalysisResult(
        { allowed: false },
        new SecurityEvent(ev, ev.extension, rule.severity, rule.type, [
          {
            finding: matchedValue,
            rule: rule.name,
            description: `${rule.description}: ${matchedValue}`,
            confidence: rule.confidence,
            severity: rule.severity,
          },
        ]),
      );
    }

    return null;
  }

  private checkExternalIp(url: string, ev: NetworkEvent, rule: (typeof NETWORK_RULES)[0]): AnalysisResult | null {
    const ipMatch = url.match(rule.pattern);
    const localMatch = url.match(EXCLUDED_IP_PATTERN);
    const wildMatch = url.match(WILDCARD_IP_PATTERN);
    const localhostMatch = url.match(LOCALHOST_PATTERN);

    if (ipMatch && !localMatch && !wildMatch && !localhostMatch && ev.extension) {
      const matchedIp = ipMatch[0];
      return new AnalysisResult(
        { allowed: false },
        new SecurityEvent(ev, ev.extension, rule.severity, rule.type, [
          {
            finding: matchedIp,
            rule: rule.name,
            description: `${rule.description}: ${matchedIp}`,
            confidence: rule.confidence,
            severity: rule.severity,
          },
        ]),
      );
    }

    return null;
  }
}
