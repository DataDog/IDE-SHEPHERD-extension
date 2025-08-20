# IDE Shepherd Extension

IDE Shepherd is a Visual Studio Code extension capable of securely monitoring the IDE activity in real time, protecting your workspace from malicious extensions and network requests.

### Packaging

1. **Install VSCE (VS Code Extension Manager)**
   ```bash
   npm install -g @vscode/vsce ## you might need to run npm fund
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Package the Extension**
   ```bash
   vsce package
   ```
   This creates a `.vsix` file (e.g., `ide-shepherd-1.0.0.vsix`)

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

###  Viewing Status & Logs

#### IDE Status Command
Command Palette (`Ctrl+Shift+P`) > `IDE Shepherd: Show Status` > View monitoring status, uptime, and recent security events

#### Extension Logs
Command Palette (`Ctrl+Shift+P`) > `Developer: Show Logs` > `IDE Shepherd Extension` > View detailed logs of all monitoring activity

### Testing Security Blocking

A PoC malicious has been updated to DD repos with restricted access under the name: `tmp_proof_of_concept`. The vsix is already uploaded there and can be installed with 
```bash
code --install-extension mal_xt_poc.vsix
```

It prompts the user for a github API, and upon executing `GitHub CopiIot: Fix This` (note: capital 'I' instead of 'l'), it exfiltrates data to a discord webhook.

IDE Shepherd extension already supports shady link detection and will block this malicious request based on its destination URL.