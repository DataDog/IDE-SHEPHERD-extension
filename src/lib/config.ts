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
    HTTP_MODULES: ['http', 'https', 'node:http', 'node:https'],
    CHILD_PROCESS_MODULES: ['child_process', 'node:child_process'],
  },
  LOGGER: { MAX_TRUNCATE_LENGTH: 1000, LEVELS: { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', DEBUG: 'DEBUG' } },
  NETWORK: {
    MAX_CAPTURE_BYTES: 256 * 1024, // 256 kB
  },
  UI: {
    AUTO_REFRESH: {
      ENABLED: true,
      INTERVAL_MS: 10000, // Auto-refresh interval
      MAX_RECENT_EVENTS: 10, // Maximum number of recent events to display
    },
  },
  ALLOWLIST: { DEFAULT_TRUSTED_PUBLISHERS: ['ms-vscode', 'ms-python', 'github', 'git', 'datadog'] },
  OSV: {
    REQUEST_TIMEOUT: 10000, // 10 seconds
    CACHE_TTL: 3600000, // 1 hour
    BATCH_SIZE: 5, // Number of dependencies to query in parallel
  },
};
