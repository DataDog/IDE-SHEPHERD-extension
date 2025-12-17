# IDE Shepherd Extension

IDE Shepherd is a Visual Studio Code and Cursor extension capable of securely monitoring the IDE activity in real time, protecting your workspace from malicious extensions and network requests.

## Installation

### Installing from GitHub Releases

1. **Download the latest release**

   Go to the [Releases page](https://github.com/DataDog/IDE-SHEPHERD-extension/releases) and download the latest `.vsix` file (e.g., `ide-shepherd-extension-2.0.0.vsix`).

2. **Install the extension**

   For VS Code:

   ```bash
   code --install-extension ide-shepherd-extension-2.0.0.vsix
   ```

   For Cursor:

   ```bash
   cursor --install-extension ide-shepherd-extension-2.0.0.vsix
   ```

3. **Reload your IDE**

   Restart VS Code/Cursor or reload the window (`Ctrl+Shift+P` or `Cmd+Shift+P` -> "Developer: Reload Window")

4. **Verify installation**

   The IDE Shepherd icon should appear in the Activity Bar (left sidebar).

## Development

### Prerequisites

- Node.js (20.x recommended)
- VS Code (1.99.3) or Cursor

### Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/DataDog/IDE-SHEPHERD-extension
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

### Installation

1. **Install from VSIX file**

   For VS Code:

   ```bash
   code --install-extension /path/to/ide-shepherd-1.0.0.vsix
   ```

   For Cursor:

   ```bash
   cursor --install-extension /path/to/ide-shepherd-1.0.0.vsix
   ```

2. **Reload your IDE**
   - Restart VS Code/Cursor or reload the window (`Ctrl+Shift+P` or `Cmd+Shift+P` → "Developer: Reload Window")

## Usage

### Security Monitoring

The extension automatically starts monitoring when VS Code (Cursor) loads:

- **Module Patching**: Intercepts and monitors HTTP requests and child process executions
- **Real-time Analysis**: Analyzes network traffic and process spawning for security threats

### Datadog Telemetry Integration

IDE Shepherd supports sending telemetry data to Datadog via the Datadog Agent for centralized monitoring and analysis:

- **Extension Repository Data**: User-installed extensions with metadata.
- **Security Events**: Real-time reporting of detected threats and IoCs
- **Metadata Analysis**: Risk scores and suspicious patterns from heuristic analysis

#### Quick Setup

**1. Install and Start Datadog Agent**

First, ensure the Datadog Agent is installed and running on your system. See [Datadog Agent Installation Guide](https://docs.datadoghq.com/agent/).

**2. Enable Telemetry in IDE Shepherd**

IDE Shepherd now **automatically configures the Datadog Agent** when you enable telemetry for the first time:

1. Open the IDE Shepherd sidebar in VS Code or Cursor
2. Navigate to **Settings → Datadog Telemetry**
3. Click on **Telemetry: Disabled** to enable it
4. IDE Shepherd will automatically:
   - Create the configuration directory: `/opt/datadog-agent/etc/conf.d/ide-shepherd.d/`
   - Write the configuration file: `conf.yaml` with the appropriate settings
   - Configure the agent to listen on the specified port

**3. Restart Datadog Agent**

After the automatic configuration, restart the Datadog Agent for changes to take effect:

```bash
# macOS
launchctl stop com.datadoghq.agent
launchctl start com.datadoghq.agent
```

See [Datadog Agent Commands](https://docs.datadoghq.com/agent/guide/agent-commands/) for more details.

**4. Verify Telemetry Status**

Telemetry is now **sent automatically** in real-time:

- Extension installed/updated/uninstalled -> OCSF event sent immediately
- Security threat detected -> OCSF event sent immediately

You can verify the connection from the sidebar:

- **Agent Status**: Shows if the Datadog Agent is up and running running
- **Agent Port**: Shows the port on which the agent is listening

**5. View in Datadog**

- Go to [Datadog Logs Explorer](https://app.datadoghq.com/logs)
- Filter: `source:ide-shepherd service:ide-shepherd-telemetry`

#### Manual Configuration (Optional)

If you prefer to manually configure the Datadog Agent, create `/opt/datadog-agent/etc/conf.d/ide-shepherd.d/conf.yaml`:

```yaml
logs:
  - type: tcp
    port: 10518
    service: 'ide-shepherd-telemetry'
    source: 'ide-shepherd'
```

Then restart the agent and configure the same port in IDE Shepherd settings.

#### Disabling Telemetry

When you disable telemetry in IDE Shepherd, you'll be asked whether to:

- **Remove the agent configuration**: Automatically deletes the IDE Shepherd configuration from Datadog Agent
- **Keep the configuration**: Leaves the agent configuration in place for future use

### Viewing Status & Logs

#### IDE Status Command

Command Palette (`Ctrl+Shift+P`) > `IDE Shepherd: Show Status` > View monitoring status, uptime, and recent security events

#### Extension Logs

Command Palette (`Ctrl+Shift+P`) > `Developer: Show Logs` > `IDE Shepherd Extension` > View detailed logs of all monitoring activity

## Security Detection Rules

IDE Shepherd employs multiple layers of security detection to identify potentially malicious extensions, network activity, process execution, and workspace tasks:

### Metadata Heuristics

| Rule ID               | Detection Name      | Category   | Severity | Description                                                          |
| --------------------- | ------------------- | ---------- | -------- | -------------------------------------------------------------------- |
| `void_description`    | Void Description    | Metadata   | Medium   | Extensions with no description or very short description (<10 chars) |
| `missing_repository`  | Missing Repository  | Metadata   | Low      | Extensions without repository or homepage links                      |
| `suspicious_version`  | Suspicious Version  | Metadata   | Low      | Suspicious version patterns (0.0.0, 99.99.99, etc.)                  |
| `generic_category`    | Generic Category    | Metadata   | Medium   | Extensions categorized as "Other"                                    |
| `wildcard_activation` | Wildcard Activation | Activation | Medium   | Extensions that activate on all events (\*)                          |
| `hidden_commands`     | Hidden Commands     | Commands   | Low      | Registered commands not exposed in UI                                |

### Network Monitoring

| Rule ID                    | Detection Name           | Type | Severity | Description                                          |
| -------------------------- | ------------------------ | ---- | -------- | ---------------------------------------------------- |
| `suspicious_domains`       | Suspicious Domains       | URL  | High     | Request to known suspicious domain (tunneling, etc.) |
| `exfiltration_domains`     | Exfiltration Domains     | URL  | High     | Request to potential data exfiltration service       |
| `malware_download_domains` | Malware Download Domains | URL  | High     | Request to known malware distribution domain         |
| `intel_domains`            | Intel Domains            | URL  | Medium   | Request to IP intelligence service                   |
| `external_ip`              | Unknown External IP      | IP   | Medium   | Request to external IP address                       |

### Process Monitoring

| Rule ID                | Detection Name       | Type    | Severity | Description                                      |
| ---------------------- | -------------------- | ------- | -------- | ------------------------------------------------ |
| `powershell_execution` | PowerShell Execution | SCRIPT  | High     | Suspicious PowerShell execution with flags       |
| `command_injection`    | Command Injection    | COMMAND | High     | Command injection attempt (sh, bash, curl, etc.) |

### Task Detection

VS Code and Cursor workspace tasks are monitored for potentially dangerous operations:

| Rule ID                   | Detection Name             | Type                 | Severity | Description                                         |
| ------------------------- | -------------------------- | -------------------- | -------- | --------------------------------------------------- |
| `task_curl_download`      | Network Download (curl)    | NETWORK              | High     | Task downloads content from the internet using curl |
| `task_wget_download`      | Network Download (wget)    | NETWORK              | High     | Task downloads content from the internet using wget |
| `task_powershell_encoded` | PowerShell Encoded Command | ENCODED_COMMAND      | High     | Task uses PowerShell with encoded command           |
| `task_eval`               | Dynamic Code Evaluation    | ENCODED_COMMAND      | High     | Task uses eval() for dynamic code execution         |
| `task_sudo`               | Sudo Execution             | PRIVILEGE_ESCALATION | High     | Task uses sudo for privilege escalation             |
| `task_temp_script`        | Temporary Script Execution | REMOTE_SCRIPT        | Medium   | Task executes a script from the temporary directory |
| `task_base64_decode`      | Base64 Decode              | ENCODED_COMMAND      | Medium   | Task uses base64 decoding (potential obfuscation)   |
| `task_rm_rf`              | Recursive File Deletion    | DESTRUCTIVE          | Medium   | Task attempts to recursively delete files           |
| `task_chmod_executable`   | Make File Executable       | PRIVILEGE_ESCALATION | Medium   | Task makes a file executable (potential backdoor)   |

## Limitations

### Extension Development Host

- **Deactivate Before Development**: You must deactivate IDE Shepherd before opening the Extension Development Host (`F5` or "Run Extension"). The module patching system can interfere with the extension development environment. Therefore it is recommended to disable the extension in VS Code or Cursor settings before running extension development.

### Security Posture

- **Blocks by Default**: IDE Shepherd takes a conservative approach and may flag legitimate extensions with suspicious patterns
- **False Positives**: Some legitimate extensions may trigger heuristic rules (e.g., extensions with minimal descriptions)
- **Manual Review**: High-risk detections should be manually reviewed before taking action
- **Extension Kind**: IDE Shepherd's monitoring is limited to workspace and ui extensions and doesn't extend to "web"

### Known Limitations

- **Activation Event Race Condition**: IDE Shepherd uses `*` activation events to load as early as possible during the IDE startup and patch the Node.js environment. In rare cases, smaller extensions with the same activation event may load faster and evade hook instrumentation
- **Task Blocking Race Condition**: If task verification takes too long, a task may be executed before IDE Shepherd can terminate it. This is a timing-dependent limitation of the task blocking mechanism
