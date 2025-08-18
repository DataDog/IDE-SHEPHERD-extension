import { CONFIG } from "../../lib/config";
import { Verdict, IoC, SeverityLevel, SecurityEvent} from "../../lib/events/sec-events";
import { NetworkEvent } from "../../lib/events/network-events";

const NETWORK_TIMEOUT_MS  = CONFIG.NETWORK.TIMEOUT_MS;

export class NetworkAnalyzer {
    // extension of detection engines with a specific set of YARA rules? 
    // or should we go with a hardcoded set of rules for the first release? 

    analyze(ev: NetworkEvent): Verdict | undefined {
        // until it's implemented, allow all requests
        return {
            allowed: true,
        };

        // TODO: implement the analyzer, if a suspicious finding is reported create a security event and return a blocking verdict
    }

}