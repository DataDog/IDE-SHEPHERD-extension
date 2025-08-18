import { parentPort } from 'worker_threads';
import { NetworkEvent } from '../../lib/events/network-events';
import { NetworkAnalyzer } from '../analysis/network-analyzer';
import { Verdict } from '../../lib/events/sec-events';

parentPort?.on('message', (ev: NetworkEvent) => {
    const verdict: Verdict | undefined = new NetworkAnalyzer().analyze(ev);
    parentPort?.postMessage({ eventId: ev.eventId, verdict });
});