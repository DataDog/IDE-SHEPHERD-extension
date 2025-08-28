import { CONFIG } from "../../lib/config";
import { Verdict, IoC, SeverityLevel, SecurityEvent} from "../../lib/events/sec-events";
import { NetworkEvent } from "../../lib/events/network-events";
import { Logger } from "../../lib/logger";
import { IDEStatusService } from "../../lib/services/ide-status-service";
interface AnalysisResult {
    verdict: Verdict;
    securityEvent?: SecurityEvent;
}

export class NetworkAnalyzer {

    analyze(ev: NetworkEvent): AnalysisResult | undefined {
        try {
            const result = this.analyzeUrl(ev);
            
            if (result?.securityEvent) {
                IDEStatusService.emitSecurityEvent(result.securityEvent).catch((error) => {
                    Logger.error(`NetworkAnalyzer: Failed to record security event: ${error.message}`);
                });
            }
            
            return result;
        } catch (error) {
            Logger.error('NetworkAnalyzer: Error during analysis', error as Error);
            return { verdict: { allowed: true } };
        }
    }


    private analyzeUrl(ev: NetworkEvent): AnalysisResult {
        const url = ev.url;
        
        const suspiciousResult = this.checkSuspiciousDomains(url, ev);
        if (suspiciousResult) {
            return suspiciousResult;
        }

        const exfiltrationResult = this.checkExfiltrationDomains(url, ev);
        if (exfiltrationResult) {
            return exfiltrationResult;
        }

        const malwareResult = this.checkMalwareDownloadDomains(url, ev);
        if (malwareResult) {
            return malwareResult;
        }

        const intelResult = this.checkIntelDomains(url, ev);
        if (intelResult) {
            return intelResult;
        }

        const externalIpResult = this.checkExternalIp(url, ev);
        if (externalIpResult) {
            return externalIpResult;
        }

        // No threats detected
        return {
            verdict: { allowed: true }
        };
    }

    private checkSuspiciousDomains(url: string, ev: NetworkEvent): AnalysisResult | null {
        // Suspicious domains pattern 1
        const susDomainsPattern1 = /([a-zA-Z0-9\-\.\_]+)(bit\.ly|workers\.dev|appdomain\.cloud|ngrok\.io|termbin\.com|localhost\.run|webhook\.(site|cool)|oastify\.com|burpcollaborator\.(me|net)|trycloudflare\.com|oast\.(pro|live|site|online|fun|me)|ply\.gg|pipedream\.net|dnslog\.cn|webhook-test\.com|typedwebhook\.tools|beeceptor\.com|ngrok-free\.(app|dev))/;
        
        const match1 = url.match(susDomainsPattern1);

        if (match1) {
            const matchedDomain = match1[0];
            return {
                verdict: { allowed: false },
                securityEvent: this.createSecurityEvent(
                    ev,
                    SeverityLevel.HIGH,
                    [{
                        finding: matchedDomain,
                        rule: "Suspicious domains",
                        description: `Request to suspicious domain: ${matchedDomain}`,
                        confidence: 1,
                        severity: SeverityLevel.HIGH
                    }]
                )
            };
        }

        return null;
    }

    private checkExfiltrationDomains(url: string, ev: NetworkEvent): AnalysisResult | null {
        const exfiltrationPattern = /(discord\.com|transfer\.sh|filetransfer\.io|sendspace\.com|backblazeb2\.com|paste\.ee|pastebin\.com|hastebin\.com|ghostbin\.site|api\.telegram\.org|rentry\.co)/;
        
        const match = url.match(exfiltrationPattern);
        if (match) {
            const matchedDomain = match[0];
            return {
                verdict: { allowed: false },
                securityEvent: this.createSecurityEvent(
                    ev,
                    SeverityLevel.HIGH,
                    [{
                        finding: matchedDomain,
                        rule: "Exfiltration domains",
                        description: `Request to potential data exfiltration service: ${matchedDomain}`,
                        confidence: 1,
                        severity: SeverityLevel.HIGH
                    }]
                )
            };
        }

        return null;
    }

    private checkMalwareDownloadDomains(url: string, ev: NetworkEvent): AnalysisResult | null {
        const malwarePattern = /(files\.catbox\.moe|notif\.su|solidity\.bot)/;
        
        const match = url.match(malwarePattern);
        if (match) {
            const matchedDomain = match[0];
            return {
                verdict: { allowed: false },
                securityEvent: this.createSecurityEvent(
                    ev,
                    SeverityLevel.HIGH,
                    [{
                        finding: matchedDomain,
                        rule: "Malware download domains",
                        description: `Request to known malware distribution domain: ${matchedDomain}`,
                        confidence: 1,
                        severity: SeverityLevel.HIGH
                    }]
                )
            };
        }

        return null;
    }

    private checkIntelDomains(url: string, ev: NetworkEvent): AnalysisResult | null {
        const intelPattern = /.{0,50}(ipinfo\.io|checkip\.dyndns\.org|ip\.me|jsonip\.com|ipify\.org|ifconfig\.me)/;
        
        const match = url.match(intelPattern);
        if (match) {
            const matchedDomain = match[0];
            return {
                verdict: { allowed: false },
                securityEvent: this.createSecurityEvent(
                    ev,
                    SeverityLevel.MEDIUM,
                    [{
                        finding: matchedDomain,
                        rule: "Intel domains",
                        description: `Request to IP intelligence service: ${matchedDomain}`,
                        confidence: 1,
                        severity: SeverityLevel.MEDIUM
                    }]
                )
            };
        }

        return null;
    }

    private checkExternalIp(url: string, ev: NetworkEvent): AnalysisResult | null {
        const ipv4Pattern = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
        const localPattern = /(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)\d{1,3}\.\d{1,3}\.\d{1,3}/;
        const wildPattern = /[0\.0\.0\.0]/;

        const ipv4Match = url.match(ipv4Pattern);
        const localMatch = url.match(localPattern);
        const wildMatch = url.match(wildPattern);

        if (ipv4Match && !localMatch && !wildMatch) {
            const matchedIp = ipv4Match[0];
            return {
                verdict: { allowed: false },
                securityEvent: this.createSecurityEvent(
                    ev,
                    SeverityLevel.MEDIUM,
                    [{
                        finding: matchedIp,
                        rule: "Unknown External IP",
                        description: `Request to external IP address: ${matchedIp}`,
                        confidence: 1,
                        severity: SeverityLevel.MEDIUM
                    }]
                )
            };
        }

        return null;
    }

    private createSecurityEvent(
        ev: NetworkEvent,
        severity: SeverityLevel,
        iocs: IoC[]
    ): SecurityEvent {
        return new SecurityEvent(
            ev,
            ev.extension,
            severity,
            iocs
        );
    }
}