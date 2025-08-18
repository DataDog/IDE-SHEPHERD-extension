/**
 * IDE Status Management : keeps track of the status of the IDE monitoring, security events, and performance metrics
 */

import { TargetEvent, Timestamp, ExtensionInfo, Target } from './events/ext-events';
import { SecurityEvent, SeverityLevel } from './events/sec-events';

/**
 * Global IDE status tracking
 */
export interface IDEStatus {
    // Extension tracking
    patchedExtensions: ExtensionInfo[];
    
    // Security monitoring
    totalSecurityEvents: number;
    securityEventsByTarget: Record<Target, number>;
    lastSecurityEvents: SecurityEvent[]; // better to have a queue of 10 events or introduce an interface for event summary
    
    // System state
    monitoringStartTime: Timestamp;
    lastUpdateTime: Timestamp;
    isMonitoringActive: boolean;
    
    // Performance metrics
    averageEventProcessingTime?: number;
    memoryUsage?: number;
}

/**
 * Goal: have a thread-safe IDE Status Manager for concurrent worker updates
 */
export class IDEStatusManager {
    private _status: IDEStatus;
    private _lock = false;
    private readonly MAX_RECENT_EVENTS = 10; // move to config file
    
    // Logger output channel
    public _outputChannel: any = null;

    constructor() {
        this._status = this.createInitialStatus();
    }

    private createInitialStatus(): IDEStatus {
        return {
            patchedExtensions: [],
            totalSecurityEvents: 0,
            securityEventsByTarget: {
                [Target.NETWORK]: 0,
                [Target.FILESYSTEM]: 0,
                [Target.WORKSPACE]: 0
            },
            lastSecurityEvents: [],
            monitoringStartTime: Date.now(),
            lastUpdateTime: Date.now(),
            isMonitoringActive: true
        };
    }

    /**
     * Simple spinlock for thread safety
     */
    private async acquireLock(): Promise<void> {
        while (this._lock) {
            await new Promise(resolve => setTimeout(resolve, 1));
        }
        this._lock = true;
    }

    private releaseLock(): void {
        this._lock = false;
    }

    async getStatus(): Promise<IDEStatus> {
        await this.acquireLock();
        try {
            return JSON.parse(JSON.stringify(this._status)); // deep copy of global status
        } finally {
            this.releaseLock();
        }
    }

    async updateExtension(extension: ExtensionInfo): Promise<void> {
        await this.acquireLock();
        try {
            // We update by removing and adding the extension - very rudimentary approach ...
            this._status.patchedExtensions = this._status.patchedExtensions.filter(ext => ext.id !== extension.id);
            if (extension.isPatched) {
                this._status.patchedExtensions.push(extension);
            }

            this._status.lastUpdateTime = Date.now();
        } finally {
            this.releaseLock();
        }
    }

    async recordSecurityEvent(event: SecurityEvent): Promise<void> {

    }

    async updatePerformanceMetrics(processingTime?: number, memoryUsage?: number): Promise<void> {
        await this.acquireLock();
        try {
            if (processingTime !== undefined) {
                if (this._status.averageEventProcessingTime !== undefined) { 
                    (this._status.averageEventProcessingTime + processingTime) / 2;
                } else {
                    this._status.averageEventProcessingTime = processingTime; // first initialization
                }
            }

            if (memoryUsage !== undefined) {
                this._status.memoryUsage = memoryUsage;
            }

            this._status.lastUpdateTime = Date.now();
        } finally {
            this.releaseLock();
        }
    }

    async setMonitoringStatus(isActive: boolean): Promise<void> {
        await this.acquireLock();
        try {
            this._status.isMonitoringActive = isActive;
            this._status.lastUpdateTime = Date.now();
        } finally {
            this.releaseLock();
        }
    }

    async reset(): Promise<void> {
        await this.acquireLock();
        try {
            this._status = this.createInitialStatus();
        } finally {
            this.releaseLock();
        }
    }

    /**
     * Bulk update multiple extensions, 
     * more efficient for initialization since we avoid multiple lock cycles
     */
    async updateExtensions(extensions: ExtensionInfo[]): Promise<void> {
        await this.acquireLock();
        try {
            // Clear existing lists
            this._status.patchedExtensions = [];

            // Populate with new data
            for (const extension of extensions) {
                if (extension.isPatched) {
                    this._status.patchedExtensions.push(extension);
                }
            }

            this._status.lastUpdateTime = Date.now();
        } finally {
            this.releaseLock();
        }
    }
}

export const ideStatusManager = new IDEStatusManager();