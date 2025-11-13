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
  ALLOWLIST: { DEFAULT_TRUSTED_PUBLISHERS: ['ms-vscode', 'ms-python', 'github', 'git', 'datadog', 'cursor'] },
  DATADOG: {
    SOURCE: 'ide-shepherd',
    SERVICE: 'ide-shepherd-telemetry',
    DEFAULT_AGENT_PORT: 10518,
    OCSF: { SCHEMA_VERSION: '1.6.0', PRODUCT_NAME: 'IDE Shepherd', VENDOR_NAME: 'Datadog' },
  },
};
