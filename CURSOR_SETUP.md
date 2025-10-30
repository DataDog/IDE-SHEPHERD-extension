# Cursor IDE Setup Guide

## The Problem

Cursor IDE uses a **horizontal Activity Bar** by default (at the top), and codicon references like `$(shield)` don't render properly for custom sidebar icons.

## The Solution

I've updated the extension to use an actual SVG icon file instead of a codicon reference. This will make the shield icon visible in Cursor.

## What Changed

**Before:**

```json
"icon": "$(shield)"  // ❌ Doesn't work in Cursor
```

**After:**

```json
"icon": "resources/icons/sidebar-icon.svg"  // ✅ Works in Cursor
```

## Testing in Cursor

### Step 1: Rebuild the Extension

```bash
cd /Users/tesnim.hamdouni/Documents/IDE-SHEPHERD-extension
npm run compile
vsce package
```

### Step 2: Install in Cursor

```bash
# Uninstall old version first
cursor --uninstall-extension datadog.ide-shepherd-extension

# Install new version
cursor --install-extension ide-shepherd-extension-*.vsix
```

### Step 3: Reload Cursor

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Developer: Reload Window"
3. Press Enter

### Step 4: Check for the Icon

**Option A: Horizontal Activity Bar (Cursor Default)**

- Look at the **top bar** of Cursor
- You should see a **shield icon** among the activity icons
- Click it to open the IDE Shepherd sidebar

**Option B: Make Activity Bar Vertical (Like VS Code)**

If you prefer the vertical layout:

1. Open Command Palette (`Cmd/Ctrl+Shift+P`)
2. Type: `Preferences: Open User Settings (JSON)`
3. Add this setting:
   ```json
   { "workbench.activityBar.orientation": "vertical" }
   ```
4. Restart Cursor

Now the shield icon will appear in the **left sidebar** (like VS Code).

## Verification Checklist

- [ ] Shield icon appears in Activity Bar (top or left)
- [ ] Clicking shield opens IDE Shepherd sidebar
- [ ] Sidebar shows 5 sections:
  - [ ] Security Status
  - [ ] Extensions Analysis
  - [ ] Allow Lists
  - [ ] Security Events
  - [ ] Settings
- [ ] All commands work from Command Palette
- [ ] Keyboard shortcuts work (`Cmd/Ctrl+Shift+S`)

## If Icon Still Doesn't Appear

### Method 1: Check Activity Bar Position

Your Activity Bar might be hidden or in a different position:

1. Try toggling Activity Bar visibility:
   - `Cmd+Shift+P` → "View: Toggle Activity Bar Visibility"

2. Check if it's in the right place:
   - Default Cursor: Top horizontal bar
   - VS Code style: Left vertical bar

### Method 2: Access via Command Palette

Even if the icon doesn't show, you can always access features via commands:

- `Cmd+Shift+P` → "IDE Shepherd: Show Security Status"
- `Cmd+Shift+P` → "IDE Shepherd: Scan Extensions"
- `Cmd+Shift+P` → "IDE Shepherd: Show Security Events"

### Method 3: Check Extension is Active

```bash
# List installed extensions
cursor --list-extensions | grep ide-shepherd

# Check for errors in Cursor
# Open Developer Tools: Cmd/Ctrl+Shift+P → "Developer: Toggle Developer Tools"
# Look for errors in Console tab
```

### Method 4: Verify Icon File Exists

```bash
ls -la resources/icons/sidebar-icon.svg
```

This file should exist. If not, the icon won't load.

## Alternative: Use Panel Commands

If the sidebar icon is still problematic, you can add the views to the Panel area:

Open `package.json` and add this under `"views"`:

```json
"panel": [
  {
    "id": "ide-shepherd-panel",
    "name": "IDE Shepherd",
    "when": "true"
  }
]
```

Then access via: `Cmd/Ctrl+Shift+P` → "View: Toggle Panel"

## Differences Between Cursor and VS Code

| Feature               | VS Code         | Cursor                      |
| --------------------- | --------------- | --------------------------- |
| Activity Bar Position | Vertical (left) | Horizontal (top) by default |
| Custom Icons          | Codicons work   | Need SVG/PNG files          |
| Sidebar Access        | Always visible  | May need to click icon      |
| Settings              | Standard        | Some UI differences         |

## Troubleshooting Commands

```bash
# Check Cursor version
cursor --version

# List all extensions
cursor --list-extensions

# Uninstall IDE Shepherd
cursor --uninstall-extension datadog.ide-shepherd-extension

# Force reinstall
cursor --install-extension ide-shepherd-extension-*.vsix --force

# Open Cursor logs directory
# macOS: ~/Library/Application Support/Cursor/logs
# Linux: ~/.config/Cursor/logs
# Windows: %APPDATA%\Cursor\logs
```

## Success Indicators

✅ **It's working if you see:**

- Shield icon in Activity Bar (top or left)
- Clicking it opens a sidebar with 5 sections
- Commands appear in Command Palette
- No errors in Developer Tools Console

❌ **It's NOT working if:**

- No shield icon anywhere
- Commands don't appear in Command Palette
- Errors in Console about missing files
- Extension not listed in Extensions view

## Getting Help

If issues persist:

1. **Check Developer Tools Console:**
   - `Cmd/Ctrl+Shift+P` → "Developer: Toggle Developer Tools"
   - Look for red errors
   - Screenshot and share

2. **Check Extension Host logs:**
   - `Cmd/Ctrl+Shift+P` → "Developer: Show Logs"
   - Select "Extension Host"
   - Look for IDE Shepherd messages

3. **Provide this info when reporting:**
   - Cursor version (`cursor --version`)
   - OS version
   - Activity Bar orientation (horizontal/vertical)
   - Screenshot of Activity Bar
   - Any error messages from Console

## Summary

The key fix was changing from a codicon `$(shield)` to an actual SVG file. After rebuilding and reinstalling:

- The shield icon should appear in your Activity Bar
- It works in both horizontal (default) and vertical layouts
- All functionality remains the same as in VS Code

**Next step:** Rebuild the extension with `vsce package` and reinstall it in Cursor!
