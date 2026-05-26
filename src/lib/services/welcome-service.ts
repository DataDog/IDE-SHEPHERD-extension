import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../logger';

// Marker written into the extension's installation directory after showing the page.
// The extension directory is freshly extracted on every install (including reinstalls
// of the same version), so the marker is absent on every new install and present on
// plain restarts — no version comparison needed.
const SHOWN_MARKER = '.whats-new-shown';

export class WelcomeService {
  static handleActivation(context: vscode.ExtensionContext): void {
    const markerPath = path.join(context.extensionPath, SHOWN_MARKER);
    if (fs.existsSync(markerPath)) {
      return;
    }

    const version: string = context.extension.packageJSON.version;
    this.showWhatsNewPage(context.extensionPath, version);

    try {
      fs.writeFileSync(markerPath, '');
    } catch (err) {
      Logger.error('WelcomeService: Failed to write shown marker', err as Error);
    }
  }

  private static showWhatsNewPage(extensionPath: string, version: string): void {
    const notes = this.extractVersionNotes(extensionPath, version);
    const resourcesRoot = vscode.Uri.joinPath(vscode.Uri.file(extensionPath), 'resources');
    const panel = vscode.window.createWebviewPanel(
      'ideShepherdWhatsNew',
      `IDE Shepherd — What's New in v${version}`,
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [resourcesRoot] },
    );
    const logoUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(resourcesRoot, 'icons', 'icon.png'));
    panel.webview.html = this.buildWhatsNewHtml(version, notes, logoUri);
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === 'close') {
        panel.dispose();
      }
    });
    Logger.info(`WelcomeService: What's New page shown (updated to v${version})`);
  }

  private static extractVersionNotes(extensionPath: string, version: string): string {
    try {
      // vsce lowercases the filename when packaging, so the extracted file on disk
      // is changelog.md — on Linux (case-sensitive FS) CHANGELOG.md would not resolve.
      const candidates = ['CHANGELOG.md', 'changelog.md'];
      const changelogPath = candidates.map((n) => path.join(extensionPath, n)).find((p) => fs.existsSync(p));
      if (!changelogPath) {
        return '';
      }
      const content = fs.readFileSync(changelogPath, 'utf-8');
      const start = content.indexOf(`## [${version}]`);
      if (start === -1) {
        return '';
      }
      const end = content.indexOf('\n## [', start + 1);
      return end === -1 ? content.slice(start) : content.slice(start, end);
    } catch {
      return '';
    }
  }

  private static inlineMarkdown(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }

  private static changelogToHtml(md: string): string {
    const lines = md.split('\n');
    const parts: string[] = [];
    let inList = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line === '---') {
        if (inList) {
          parts.push('</ul>');
          inList = false;
        }
        continue;
      }
      if (line.startsWith('## [')) {
        continue;
      }
      if (line.startsWith('### ')) {
        if (inList) {
          parts.push('</ul>');
          inList = false;
        }
        parts.push(`<h3>${this.inlineMarkdown(line.slice(4))}</h3>`);
        continue;
      }
      if (line.startsWith('- ')) {
        if (!inList) {
          parts.push('<ul>');
          inList = true;
        }
        parts.push(`<li>${this.inlineMarkdown(line.slice(2))}</li>`);
        continue;
      }
    }

    if (inList) {
      parts.push('</ul>');
    }
    return parts.join('\n');
  }

  private static sharedStyles(): string {
    return `
      *, *::before, *::after { box-sizing: border-box; }
      body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        margin: 0;
        padding: 40px 32px;
        max-width: 740px;
        margin: 0 auto;
        line-height: 1.6;
      }
      strong { color: var(--vscode-foreground); font-weight: 600; }
      code {
        background: var(--vscode-textCodeBlock-background);
        color: var(--vscode-textPreformat-foreground);
        padding: 1px 5px;
        border-radius: 3px;
        font-family: var(--vscode-editor-font-family);
        font-size: 0.88em;
      }
      .btn {
        border: none;
        border-radius: 4px;
        padding: 9px 22px;
        font-size: 13px;
        cursor: pointer;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .btn:focus { outline: 2px solid var(--vscode-focusBorder); }
    `;
  }

  private static buildWhatsNewHtml(version: string, changelogBlock: string, logoUri?: vscode.Uri): string {
    const notesHtml = changelogBlock
      ? this.changelogToHtml(changelogBlock)
      : '<p style="color: var(--vscode-descriptionForeground)">No release notes found for this version.</p>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>What's New in IDE Shepherd v${version}</title>
  <style>
    ${this.sharedStyles()}
    .header {
      padding: 24px 0 24px;
      border-bottom: 1px solid var(--vscode-notifications-border);
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .header img { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
    .header h1 { margin: 0; font-size: 22px; }
    .version-tag {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: 600;
    }
    h3 {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.7px;
      color: var(--vscode-descriptionForeground);
      margin: 24px 0 10px;
    }
    ul { list-style: none; padding: 0; margin: 0; }
    li {
      padding: 12px 16px;
      background: var(--vscode-notifications-background);
      border: 1px solid var(--vscode-notifications-border);
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 13px;
      line-height: 1.55;
    }
    .actions { text-align: center; padding: 36px 0 8px; }
  </style>
</head>
<body>
  <div class="header">
    ${logoUri ? `<img src="${logoUri}" alt="IDE Shepherd" />` : ''}
    <h1>What's New in IDE Shepherd</h1>
    <span class="version-tag">v${version}</span>
  </div>

  ${notesHtml}

  <div class="actions">
    <button class="btn" onclick="onClose()">Got it</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function onClose() {
      vscode.postMessage({ command: 'close' });
    }
    document.querySelector('.btn').focus();
  </script>
</body>
</html>`;
  }
}
