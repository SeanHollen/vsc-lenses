# Tabs Per Mode

VS Code extension that maintains separate tab sets for Explorer and Source Control sidebar modes.

When you switch to Explorer, only your file tabs are shown. When you switch to Source Control, only your diff tabs are shown. Each mode remembers which tabs were open, so you can toggle back and forth without losing your place.

## How switching works

By default (`tabsPerMode.strategy: "groups"`), each mode has its own **editor group**: Explorer tabs live in group 1, Source Control tabs in group 2. Switching modes shows that mode's group maximized, and VS Code hides the other group completely. No tab is opened or closed, so the switch is instant and flicker-free. Each mode keeps its editors exactly as you left them (scroll position, selection, undo history).

- **Ctrl+Shift+E / Ctrl+Shift+G** (Cmd on macOS) and the status-bar buttons switch the sidebar and the tabs in the same frame.
- Clicking the Explorer / Source Control icons also works. The tabs follow about two frames (~25–35 ms) after the sidebar, because an extension only hears about the click after VS Code has drawn it.
- Files you open go to the current mode's group, so opening a change from Source Control puts the diff in the Source Control group.
- The "maximized" button in the editor toolbar is lit, because that's how the other group is hidden. Clicking it shows both groups side by side until the next switch.

`tabsPerMode.strategy: "reopen"` restores the original behaviour: one group, where switching closes the old mode's tabs and reopens the new mode's. It supports the auto-navigate and preserve options below, at the cost of visible tab churn.

## Features

- **Separate tab sets per mode** — Explorer tabs and Source Control tabs are tracked independently
- **Auto-navigate** — switching modes selects the equivalent file in the other mode (e.g., `foo.ts` in Explorer becomes `foo.ts (Working Tree)` in Source Control)
- **Preserves pinned and dirty tabs** across mode switches
- **Persists state** across VS Code restarts

## Setup

The **"Tabs Per Mode"** section in the Explorer and Source Control sidebars is how sidebar switches are detected (a collapsed view reports nothing). It's expanded automatically the first time you open a folder. It can be small, but keep it expanded; Ctrl+Shift+E / G work either way.

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
| `tabsPerMode.enabled` | `true` | Split tabs by mode. Turn off for plain VS Code tabs (the mode groups are merged into one); takes effect immediately |
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
