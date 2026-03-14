# Tabs Per Mode

VS Code extension that maintains separate tab sets for Explorer and Source Control sidebar modes.

When you switch to Explorer, only your file tabs are shown. When you switch to Source Control, only your diff tabs are shown. Each mode remembers which tabs were open, so you can toggle back and forth without losing your place.

## Features

- **Separate tab sets per mode** — Explorer tabs and Source Control tabs are tracked independently
- **Auto-navigate** — switching modes selects the equivalent file in the other mode (e.g., `foo.ts` in Explorer becomes `foo.ts (Working Tree)` in Source Control)
- **Preserves pinned and dirty tabs** across mode switches
- **Persists state** across VS Code restarts

## Setup

After installing, expand the **"Tabs Per Mode"** section in both the Explorer and Source Control sidebars at least once. This initializes the sidebar detection. The section can be small, but must not be fully collapsed.

## How It Works

Click the Explorer or Source Control icon in the activity bar as you normally would. The extension detects the sidebar switch and swaps your tabs automatically.

Manual commands are also available via the command palette:

- `Tabs Per Mode: Switch to Explorer Mode`
- `Tabs Per Mode: Switch to Source Control Mode`
- `Tabs Per Mode: Open Explorer`
- `Tabs Per Mode: Open Source Control`

## Settings

| Setting | Default | Description |
|---|---|---|
| `tabsPerMode.autoNavigate` | `true` | Auto-open the equivalent file when switching modes |
| `tabsPerMode.preservePinnedTabs` | `true` | Keep pinned tabs open across mode switches |
| `tabsPerMode.preserveNeutralTabs` | `true` | Keep non-file tabs (settings, output, etc.) open across mode switches |

## Development

```bash
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

### Tests

```bash
npm test
```
