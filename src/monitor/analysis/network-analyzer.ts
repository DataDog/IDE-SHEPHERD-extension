import { BaseAnalyzer, AnalysisResult } from './analyzer';
import { NetworkEvent } from '../../lib/events/network-events';
import {
  NETWORK_RULES,
  NetworkRule,
  NetworkRuleType,
  LOCAL_IP_PATTERN,
  WILDCARD_IP_PATTERN,
} from '../../detection/network-rules';

export class NetworkAnalyzer extends BaseAnalyzer<NetworkEvent, NetworkRule> {
  protected readonly analyzerName = 'NetworkAnalyzer';

  protected getContext(event: NetworkEvent): string {
    return event.url; // TODO: extend this to include payload content
  }

  protected executeRuleChecks(event: NetworkEvent): AnalysisResult {
    if (event.phase === 'request:pre') {
      return this.analyzeUrl(event);
    }

    return new AnalysisResult();
  }

  private analyzeUrl(event: NetworkEvent): AnalysisResult {
    const url = event.url;

    // Check all URL-based rules
    for (const rule of NETWORK_RULES) {
      if (rule.type === NetworkRuleType.URL) {
        const result = this.checkUrlRule(url, event, rule);
        if (result) {
          return result;
        }
      }
    }

    // Check IP-based rules (with special filtering)
    const ipRule = NETWORK_RULES.find((r) => r.id === 'external_ip');
    if (ipRule) {
      const result = this.checkExternalIpRule(url, event, ipRule);
      if (result) {
        return result;
      }
    }

    return new AnalysisResult();
  }

  private checkUrlRule(url: string, event: NetworkEvent, rule: NetworkRule): AnalysisResult | null {
    const match = url.match(rule.pattern);
    if (!match) {
      return null;
    }

    const matchedValue = match[0];
    const description = `${rule.description}: ${matchedValue}`;
    return this.createViolation(event, event.extension, rule, matchedValue, description);
  }

  private checkExternalIpRule(url: string, event: NetworkEvent, rule: NetworkRule): AnalysisResult | null {
    const ipMatch = url.match(rule.pattern);
    const localMatch = url.match(LOCAL_IP_PATTERN);
    const wildMatch = url.match(WILDCARD_IP_PATTERN);

    if (!ipMatch || localMatch || wildMatch) {
      return null;
    }

    const matchedIp = ipMatch[0];
    const description = `${rule.description}: ${matchedIp}`;
    return this.createViolation(event, event.extension, rule, matchedIp, description);
  }
}
