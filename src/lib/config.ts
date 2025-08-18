/**
 * Extension configuration constants; they can be linked to a UI and manually adjusted by the user
 */

export const CONFIG = {
    EXTENSION: {
        ID: 'datadog.ide-shepherd-extension',
        NAME: 'IDE Shepherd',
        OUTPUT_CHANNEL_NAME: 'IDE Shepherd Extension',
    },
    MODULES: {
        HTTP_MODULES: ['http', 'https', 'node:http', 'node:https']
    },
    LOGGER: {
        MAX_TRUNCATE_LENGTH: 1000,
        LEVELS: {
            INFO: 'INFO',
            WARN: 'WARN', 
            ERROR: 'ERROR',
            DEBUG: 'DEBUG'
        }
    },
    NETWORK: {
        MAX_CAPTURE_BYTES: 256 * 1024, // 256 kB
        NBR_WORKERS: 4,  // worker pool size
        TIMEOUT_MS: 500,
    },
    FILESYSTEM: { 
        NBR_WORKERS: 2,
        TIMEOUT_MS: 200,
    },
    WORKSPACE: { 
        NBR_WORKERS: 2,
        TIMEOUT_MS: 200,
    },
    CHANNELS: {
        NETWORK: 'sec:network',
        FILESYSTEM: 'sec:filesystem',
        WORKSPACE: 'sec:workspace'
    }
};
