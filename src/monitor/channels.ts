import { EventEmitter } from 'events';
import type { Verdict, SecurityEvent } from '../lib/events/sec-events';
import { CONFIG } from '../lib/config';
import { TargetEvent, Target } from '../lib/events/ext-events';

const NETWORK_TIMEOUT_MS  = CONFIG.NETWORK.TIMEOUT_MS;

interface Pending {
  resolve(v: Verdict | undefined): void;
  reject(e: unknown): void;
  timer: NodeJS.Timeout;
}

/**
 * One asynchronous queue per monitoring target (network, fs, etc.)
 * instrumentation calls askAsync(event) -> Promise<Verdict>
 * then worker threads from each respective analyzer post back { eventId, verdict }
 */
export class AsyncTargetChannel<TEvent extends TargetEvent<Target>> extends EventEmitter {
  private pending = new Map<string, Pending>();
  private readonly target: Target;

  constructor(
    public readonly name: string,
    target: Target,
    private readonly timeoutMs: number = NETWORK_TIMEOUT_MS,
  ) {
    super();
    this.target = target;
  }

  getTarget(): Target {
    return this.target;
  }

  // instrumentation side
  askAsync(ev: TargetEvent<Target>): Promise<Verdict | undefined> {
    return new Promise<Verdict | undefined>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(ev.eventId);
        resolve(undefined);  // fail-open on timeout
      }, this.timeoutMs);

      this.pending.set(ev.eventId, { resolve, reject, timer });
      this.emit('enqueue', ev);  // dispatcher will pick it up
    });
  }

  // dispatcher side
  resolve(eventId: string, verdict: Verdict) {
    const p = this.pending.get(eventId);
    if (!p) {
      return; // already timed out
    }
    clearTimeout(p.timer);
    this.pending.delete(eventId);
    p.resolve(verdict);
  }
}

class Bus extends EventEmitter {
  publish(ev: SecurityEvent) { this.emit('security-event', ev); }
  onEvent(fn: (ev: SecurityEvent)=>void) { this.on('security-event', fn); }
}

export const securityEventBus = new Bus();