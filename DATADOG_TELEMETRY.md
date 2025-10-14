# Datadog Telemetry Integration

IDE Shepherd now supports sending telemetry data to Datadog for centralized monitoring and analysis of extension security events and metadata.

## Features

The Datadog telemetry integration provides the following capabilities:

### 1. **Extension Repository Data**

- Collects and sends information about all installed VS Code extensions
- Includes extension metadata (publisher, version, description)
- Tracks active vs inactive extensions
- Distinguishes between built-in and user-installed extensions

### 2. **Security Events**

- Real-time reporting of security events detected by IDE Shepherd
- Includes IoCs (Indicators of Compromise)
- Severity levels (low, medium, high)
- Extension information for each security event

### 3. **Extensions Metadata Analysis**

- Results from heuristic rule analysis
- Risk scores and risk levels for each extension
- Suspicious patterns detected
- Summary statistics (high/medium/low risk counts)

## Architecture

IDE Shepherd uses **Direct HTTP Log Intake** to send telemetry data to Datadog. This means:

- ✅ No Datadog Agent installation required
- ✅ Works on all platforms (Windows, macOS, Linux)
- ✅ Simple configuration (just API key + endpoint)
- ✅ Uses official `@datadog/datadog-api-client` package
- ✅ Direct HTTPS connection to Datadog's intake endpoints

This approach is ideal for VS Code extensions where users may not have a Datadog Agent running locally.

## Setup

### Step 1: Get Your Datadog API Key

1. Log in to your [Datadog account](https://app.datadoghq.com/)
2. Navigate to **Organization Settings** → **API Keys**
3. Create a new API key or copy an existing one
4. Keep this key secure - you'll need it for configuration

### Step 2: Configure API Key in IDE Shepherd

You can set your Datadog API key using one of these methods:

#### Method 1: Command Palette

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac)
2. Search for `IDE Shepherd: Set Datadog API Key`
3. Enter your API key when prompted
4. The key will be securely stored in VS Code's secret storage

#### Method 2: Manual Configuration

The API key is stored securely using VS Code's Secret Storage API and cannot be manually configured through settings.

### Step 3: Enable Telemetry

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,` on Mac)
2. Search for `IDE Shepherd Datadog`
3. Enable `ide-shepherd.datadog.enabled`
4. (Optional) Configure additional settings:
   - `ide-shepherd.datadog.apiEndpoint` - Default: `https://http-intake.logs.datadoghq.com`
   - `ide-shepherd.datadog.telemetryInterval` - Default: 300000ms (5 minutes)

## Configuration Options

| Setting                                  | Type    | Default                                  | Description                                     |
| ---------------------------------------- | ------- | ---------------------------------------- | ----------------------------------------------- |
| `ide-shepherd.datadog.enabled`           | boolean | `false`                                  | Enable/disable Datadog telemetry                |
| `ide-shepherd.datadog.apiEndpoint`       | string  | `https://http-intake.logs.datadoghq.com` | Datadog HTTP log intake endpoint (US1 region)   |
| `ide-shepherd.datadog.telemetryInterval` | number  | `300000`                                 | Interval for periodic telemetry (ms, 5 minutes) |

## Available Commands

All Datadog-related commands are available through the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

### `IDE Shepherd: Set Datadog API Key`

Register or update your Datadog API key. The key is stored securely and encrypted.

### `IDE Shepherd: Clear Datadog API Key`

Remove the stored API key. This will stop all telemetry transmission.

### `IDE Shepherd: Test Datadog Connection`

Send a test event to Datadog to verify your configuration is working correctly.

### `IDE Shepherd: Send Test Event to Datadog`

Manually send a test event to Datadog (useful for testing and validation).

## Telemetry Data Structure

### Extension Repository Data

```json
{
  "timestamp": 1697234567890,
  "source": "ide-shepherd-extension",
  "service": "ide-shepherd",
  "event_type": "extension_repository",
  "extensions_count": 25,
  "user_extensions_count": 15,
  "active_extensions_count": 20,
  "extensions": [
    {
      "id": "publisher.extension-1.0.0",
      "displayName": "publisher.extension",
      "isActive": true,
      "isBuiltIn": false,
      "publisher": "publisher",
      "version": "1.0.0",
      "description": "Extension description"
    }
  ]
}
```

### Security Events

```json
{
  "timestamp": 1697234567890,
  "source": "ide-shepherd-extension",
  "service": "ide-shepherd",
  "event_type": "security_event",
  "security_event_id": "event-123",
  "severity": "high",
  "extension_id": "suspicious.extension",
  "extension_name": "Suspicious Extension",
  "iocs": [
    {
      "finding": "Suspicious network activity",
      "rule": "network-suspicious-domain",
      "description": "Connection to known malicious domain",
      "confidence": 0.9,
      "severity": "high"
    }
  ],
  "summary": "Security event details..."
}
```

### Metadata Analysis

```json
{
  "timestamp": 1697234567890,
  "source": "ide-shepherd-extension",
  "service": "ide-shepherd",
  "event_type": "metadata_analysis",
  "total_analyzed": 15,
  "high_risk_count": 2,
  "medium_risk_count": 5,
  "low_risk_count": 8,
  "results": [
    {
      "extension_id": "publisher.extension-1.0.0",
      "risk_score": 50,
      "risk_level": "medium",
      "suspicious_patterns_count": 2,
      "patterns": [{ "pattern": "Activation on all events", "severity": "medium", "category": "activation" }]
    }
  ]
}
```

## Usage Examples

### Basic Setup

```bash
1. Set API key via Command Palette
2. Enable telemetry in settings
3. Run "Scan Extensions" to trigger initial analysis
4. Security events will be automatically sent as they occur
```

### Testing Your Configuration

```bash
1. Set your API key
2. Run "Test Datadog Connection" command
3. Check Datadog Logs Explorer for the test event
4. Look for events with source: "ide-shepherd-extension"
```

### Viewing Data in Datadog

1. Log in to [Datadog](https://app.datadoghq.com/)
2. Navigate to **Logs** → **Explorer**
3. Use the following filters:
   - `source:ide-shepherd-extension`
   - `service:ide-shepherd`
   - `@event_type:security_event` (for security events)
   - `@event_type:extension_repository` (for extension data)
   - `@event_type:metadata_analysis` (for analysis results)

### Creating Dashboards

You can create custom dashboards in Datadog to visualize:

- Number of security events over time
- Risk distribution of installed extensions
- Most common suspicious patterns
- Extension installation trends

## Security and Privacy

### Data Security

- API keys are stored using VS Code's **Secret Storage API**
- Keys are encrypted at rest
- Keys are never logged or exposed in plaintext

### Data Transmission

- All data is sent over HTTPS
- Uses Datadog's official API endpoints
- No PII (Personally Identifiable Information) is collected
- Machine IDs are anonymized using VS Code's `machineId` hash

### What Data is Sent?

- Extension metadata (names, versions, publishers)
- Security events and IoCs
- Risk analysis results
- No source code or file contents
- No user credentials or tokens
- No workspace paths or file names

## Troubleshooting

### "API key not configured" Error

**Solution**: Run the "Set Datadog API Key" command and enter a valid API key.

### "Telemetry is disabled" Warning

**Solution**: Enable telemetry in VS Code settings: `ide-shepherd.datadog.enabled = true`

### Connection Failed

**Possible causes**:

1. Invalid API key - verify your key in Datadog
2. Network connectivity issues - check your internet connection
3. Firewall blocking - ensure `api.datadoghq.com` is not blocked
4. Wrong API endpoint - verify the endpoint in settings

### No Data Appearing in Datadog

**Steps to diagnose**:

1. Run "Test Datadog Connection" command
2. Check the Output panel (View → Output → "IDE Shepherd Extension")
3. Verify API key is correct
4. Ensure telemetry is enabled in settings
5. Try running "Scan Extensions" to trigger data collection

## Advanced Configuration

### Custom Datadog Regions

If you're using a different Datadog region, update the HTTP intake endpoint in settings:

- **US1** (default): `https://http-intake.logs.datadoghq.com`
- **US3**: `https://http-intake.logs.us3.datadoghq.com`
- **US5**: `https://http-intake.logs.us5.datadoghq.com`
- **EU1**: `https://http-intake.logs.datadoghq.eu`
- **AP1**: `https://http-intake.logs.ap1.datadoghq.com`
- **US1-FED** (GovCloud): `https://http-intake.logs.ddog-gov.com`

To change the region:

```json
{ "ide-shepherd.datadog.apiEndpoint": "https://http-intake.logs.datadoghq.eu" }
```

### Adjusting Telemetry Interval

The default interval is 5 minutes (300000ms). You can adjust this in settings:

```json
{
  "ide-shepherd.datadog.telemetryInterval": 600000 // 10 minutes
}
```

Valid range: 60000ms (1 minute) to 3600000ms (1 hour)

## API Reference

### DatadogTelemetryService

The main service class that handles all telemetry operations.

#### Methods

##### `initialize(context: vscode.ExtensionContext): Promise<void>`

Initialize the telemetry service with the VS Code extension context.

##### `setApiKey(apiKey: string): Promise<void>`

Store the Datadog API key securely.

##### `clearApiKey(): Promise<void>`

Remove the stored API key.

##### `isConfigured(): boolean`

Check if an API key is configured.

##### `testConnection(): Promise<{ success: boolean; message: string }>`

Test the connection to Datadog.

##### `sendExtensionRepositoryData(extensions: Extension[]): Promise<void>`

Send extension repository data to Datadog.

##### `sendSecurityEvent(securityEvent: SecurityEvent): Promise<void>`

Send a security event to Datadog.

##### `sendMetadataAnalysis(results: HeuristicResult[]): Promise<void>`

Send metadata analysis results to Datadog.

## Support

For issues, questions, or feature requests:

1. Check the [GitHub Issues](https://github.com/DataDog/IDE-Shepherd-extension/issues)
2. Review the extension logs (View → Output → "IDE Shepherd Extension")
3. Contact the Datadog support team

## License

This feature is part of the IDE Shepherd extension and follows the same license terms.
