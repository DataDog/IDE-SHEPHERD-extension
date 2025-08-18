import { Worker } from 'worker_threads';
import path from 'path';

import { CONFIG } from '../../lib/config';
import { AsyncTargetChannel } from '../channels';
import { NetworkEvent } from '../../lib/events/network-events';
import { Verdict } from '../../lib/events/sec-events';
import { Target, TargetEvent } from '../../lib/events/ext-events';

export function createWorkersPool(channel: AsyncTargetChannel<TargetEvent<Target>>, nbrWorkers: number = CONFIG.NETWORK.NBR_WORKERS) {
    const workers: Worker[] = [];
    const workerUrl = getWorkerUrl(channel.getTarget());
    let next = 0;

    for (let i = 0; i < nbrWorkers; i++) {
        const w = new Worker(workerUrl);
        w.on('message', (msg:{eventId:string; verdict:Verdict}) => {
          channel.resolve(msg.eventId, msg.verdict);
        });
        workers.push(w);
      }
    
      channel.on('enqueue', (ev: NetworkEvent) => {
        workers[next].postMessage(ev);
        next = (next + 1) % workers.length;
      });
}



function getWorkerUrl(target: Target): string {
    switch (target) {
        case Target.NETWORK:
            return path.join(__dirname, 'network-worker.js');
        default:
            throw new Error(`Unsupported target: ${target}`);
    }
}
