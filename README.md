# IDE Shepherd Extension

IDE Shepherd is a Visual Studio Code extension capable of securely monitoring the IDE activity in real time, protecting your workspace from malicious extensions and network requests.

## Development

### Prerequisites

- Node.js (20.x recommended)
- VS Code (1.99.3)

### Development Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd IDE-SHEPHERD-extension
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Install VS Code Extension Manager (optional, for packaging)**
   ```bash
   npm install -g @vscode/vsce
   ```

### Development Workflow

1. **Compile TypeScript**

   ```bash
   npm run compile
   # Or for continuous compilation during development:
   npm run watch
   ```

2. **Run formatting**

   ```bash
   npm run format
   npm run format:check
   ```

3. **Type checking**

   ```bash
   npm run typecheck
   ```

4. **Run tests**

   ```bash
   npm test
   ```

5. **Package the extension into a VSIX file**
   ```bash
   vsce package
   ```

### Testing the Extension

1. **Install from local package**

   ```bash
   code --install-extension ide-shepherd-extension-*.vsix
   ```

2. **Reload VS Code**
   - Restart VS Code or reload the window (`Ctrl+Shift+P` → "Developer: Reload Window")

### Installation

1. **Install from VSIX file**

   ```bash
   code --install-extension /path/to/ide-shepherd-1.0.0.vsix
   ```

2. **Reload VS Code**
   - Restart VS Code or reload the window (`Ctrl+Shift+P` → "Developer: Reload Window")

## Usage

### Security Monitoring

The extension automatically starts monitoring when VS Code loads:

- **Module Patching**: Intercepts and monitors HTTP requests and child process executions
- **Real-time Analysis**: Analyzes network traffic and process spawning for security threats

### Datadog Telemetry Integration

IDE Shepherd supports sending telemetry data to Datadog via the Datadog Agent for centralized monitoring and analysis:

- **Extension Repository Data**: User-installed extensions with metadata.
- **Security Events**: Real-time reporting of detected threats and IoCs
- **Metadata Analysis**: Risk scores and suspicious patterns from heuristic analysis

#### Quick Setup

**1. Configure Datadog Agent TCP Listener**

Create `/opt/datadog-agent/etc/conf.d/ide-shepherd.d/conf.yaml`:

```yaml
logs:
  - type: tcp
    port: 10518
    service: ide-shepherd
    source: ide-shepherd
    tags:
      - env:dev
      - project:ide-shepherd
```

**2. Restart Datadog Agent**

```bash
# macOS
launchctl stop com.datadoghq.agent
launchctl start com.datadoghq.agent
```

**3. Enable Telemetry in the side bar**

- Settings -> Search "Datadog telemetry"
- Enable by selecting Telemetry: Disabled

**4. Test & Send**

You can test the connection's status and send telemetry data either from the sidebar or the command palette.

- Command Palette -> `IDE Shepherd: Test Datadog Agent Connection`
- Command Palette -> `IDE Shepherd: Send Telemetry Data to Datadog`

**5. View in Datadog Security**

- Go to [Logs Explorer](https://app.datadoghq.com/logs)
- Filter: `source:ide-shepherd`

### Viewing Status & Logs

#### IDE Status Command

Command Palette (`Ctrl+Shift+P`) > `IDE Shepherd: Show Status` > View monitoring status, uptime, and recent security events

#### Extension Logs

Command Palette (`Ctrl+Shift+P`) > `Developer: Show Logs` > `IDE Shepherd Extension` > View detailed logs of all monitoring activity

## Security Detection Rules

IDE Shepherd employs multiple layers of security detection to identify potentially malicious extensions and network activity:

### Metadata Heuristics

| Rule ID               | Detection Name      | Category   | Severity | Description                                                          |
| --------------------- | ------------------- | ---------- | -------- | -------------------------------------------------------------------- |
| `missing_repository`  | Missing Repository  | Metadata   | Low      | Extensions without repository or homepage links                      |
| `suspicious_version`  | Suspicious Version  | Metadata   | Low      | Suspicious version patterns (0.0.0, 99.99.99, etc.)                  |
| `hidden_commands`     | Hidden Commands     | Commands   | Low      | Registered commands not exposed in UI                                |
| `generic_category`    | Generic Category    | Metadata   | Medium   | Extensions categorized as "Other"                                    |
| `wildcard_activation` | Wildcard Activation | Activation | Medium   | Extensions that activate on all events (\*)                          |
| `void_description`    | Void Description    | Metadata   | Medium   | Extensions with no description or very short description (<10 chars) |

### Network Monitoring

| Detection Type     | Severity | Description                                       |
| ------------------ | -------- | ------------------------------------------------- |
| Suspicious Domains | High     | Requests to known malicious or suspicious domains |

### Process Monitoring

| Detection Type      | Severity | Description                                        |
| ------------------- | -------- | -------------------------------------------------- |
| Suspicious Commands | High     | Execution of potentially dangerous system commands |

## Limitations

### Extension Development Host

- **Deactivate Before Development**: You must deactivate IDE Shepherd before opening the Extension Development Host (`F5` or "Run Extension"). The module patching system can interfere with the extension development environment. Therefore it is recommended to disable the extension in VS Code settings before running extension development.

### Security Posture

- **Blocks by Default**: IDE Shepherd takes a conservative approach and may flag legitimate extensions with suspicious patterns
- **False Positives**: Some legitimate extensions may trigger heuristic rules (e.g., extensions with minimal descriptions)
- **Manual Review**: High-risk detections should be manually reviewed before taking action
- **Extension Kind**: IDE Shepherd's monitoring is limited to workspace and ui extensions and doesn't extend to "web"
