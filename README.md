# Lenses

A VS Code extension for JS/TS that tries out two ideas:

1. **[Syntax highlighting is a waste of an information channel](https://buttondown.com/hillelwayne/archive/syntax-highlighting-is-a-waste-of-an-information/)** (Hillel Wayne).
   Color shouldn't just restate the grammar. Each *highlight lens* uses color to answer one question about the code.
2. **[Formatting is a solved problem](https://maxleiter.com/blog/formatting)** (Max Leiter).
   Store one canonical format, and let each person read and edit the code in the layout they like.

There are two new icons in the activity bar: **Highlight Lenses** (highlighter) and **Format Lenses** (lines + arrow).
Each opens a panel of options. Every option has a live example and a legend for the current file.

## Install

Requires Node.js (22.5+ recommended) and VS Code, with its `code` command on PATH. Linux and macOS.

```bash
git clone git@github.com:SeanHollen/vsc-lenses.git && cd vsc-lenses
./install.sh        # or: npm run setup
lenses .            # open a folder in Lenses
```

Lenses runs as **its own editor**: VS Code with a separate data folder (`~/.local/share/lenses`), opened by a `lenses` command in `~/.local/bin`.

- Your normal `code` is untouched, and `lenses` and `code` can run side by side.
- On first install, your VS Code settings, keybindings and snippets are copied in, so it feels like your editor. After that the two are independent.
- Re-run `./install.sh` any time (e.g. after `git pull`) to rebuild and reinstall. It's safe to repeat.
- `./uninstall.sh` removes the `lenses` command. `./uninstall.sh --purge` also deletes `~/.local/share/lenses`.
- Overrides (environment variables): `LENSES_HOME`, `LENSES_COMMAND`, `LENSES_BIN_DIR`, `CODE`. See the top of `install.sh`.

What `install.sh` does: `npm ci`, build, package `dist/lenses.vsix`, install it into Lenses' data folder, apply the editor defaults below, and write the launcher.

### Editor defaults: no built-in AI, auto-save

Lenses is meant to be used alongside AI tools that live outside the editor (e.g. Claude Code), so VS Code's own AI features and their leftovers are turned off:

| | How |
|---|---|
| Copilot chat, agents, inline AI suggestions | `chat.disableAIFeatures: true` |
| Chat button in the title bar | `chat.commandCenter.enabled: false` |
| Right-hand side bar (the chat panel's home), never shown at startup | `workbench.secondarySideBar.defaultVisibility: "hidden"` |
| Accounts button (Copilot sign-in) | "Hide Accounts" UI state in Lenses' state database |
| Auto-save, held while code can't be canonicalized | `files.autoSave: "afterDelay"`, `files.autoSaveWhenNoErrors: true` |

These are written into Lenses' own `settings.json` (`tools/seed-settings.js`), because VS Code lays out the window before extensions load. Extension-provided defaults would let the side bar flash open. Only keys you haven't set are added, so your changes win, even across re-installs. Change them in Lenses' settings like any VS Code setting. Hiding Accounts is UI state rather than a setting, so `tools/seed-state.js` writes it to Lenses' state database. That's skipped if Lenses is running (close it and re-run); you can also right-click the Accounts icon → Hide.

You can also install `dist/lenses.vsix` into any VS Code yourself (Extensions → … → Install from VSIX). The extension ships the AI-off and auto-save settings as defaults, so they apply there too (without the side-bar and Accounts tweaks).

## Highlight lenses

| Lens | Question | What gets colored |
|---|---|---|
| Rainbow brackets | Which bracket closes which? | `() [] {}` by nesting depth |
| Nesting context | How deep am I? | Line background by number of enclosing blocks |
| Imports by source | Where did this name come from? | Every imported identifier, colored by its module (legend lists modules) |
| Argument flow | Does this come from the caller? | Arguments / values computed from arguments / other locals / module-level names |
| Types | What kind of value is this? | Identifiers by inferred type (number, string, array, function, promise, object, union, any). Dotted underline = may be null/undefined |
| Exceptions | Can this blow up? | Functions that can throw, including through calls into other files. Unguarded calls are wavy red, calls inside `try/catch` are green |
| Changed on branch | What did this branch touch? | Functions whose bodies differ from the merge-base with `main`/`master` (or HEAD), and every call to them |

While a lens is on, ordinary syntax colors are muted to plain text so the lens colors stand out. You can turn that off in the panel.
The analysis uses the TypeScript compiler API (symbols and types resolved across imports).

## Format lenses

The file on disk is always **canonical**: Prettier, using the project's own config (`.prettierrc`, `.editorconfig`) if there is one.
Pick a display style and JS/TS files open as a *styled view* (`lens-fmt:` URI):

| Style | |
|---|---|
| Canonical | The file itself |
| Wide | 120 columns |
| Narrow | 48 columns |
| Minimal punctuation | No semicolons, single quotes, no trailing commas |
| Tabs, 4 wide | Tab indentation |
| Allman braces | Block braces on their own lines |

- **Line numbers are canonical.** The gutter shows on-disk line numbers. `┆` marks a display line that continues the canonical line above, `56-58` means several canonical lines were joined, and `+` marks new lines you haven't saved yet.
- **Ctrl+G** (and the status bar item) go to a *canonical* line. The status bar shows the canonical line under the cursor.
- **Saving** converts your view back to canonical form, so diffs and teammates never see your style. The view then re-renders in your style (like format-on-save).
- Language features (hover, go-to-definition, diagnostics) work in styled views.
- *View raw file* / *View in this style* switch between the file and the styled view, keeping your place.

### Your own styles

Add styles in settings (`lenses.format.customStyles`), using [Prettier's options](https://prettier.io/docs/options). They're validated and auto-completed in settings.json:

```jsonc
"lenses.format.customStyles": [
  // start from a built-in and tweak it
  { "name": "Laptop", "extends": "narrow", "prettier": { "printWidth": 64, "semi": false, "singleQuote": true } },
  // reuse a Prettier config you already have, plus Allman braces
  { "name": "Mine", "prettierConfigFile": "~/.prettierrc.personal.json", "braces": "allman" },
  // operators first, Prettier's experimental ternaries
  { "name": "Ops first", "prettier": { "experimentalOperatorPosition": "start", "experimentalTernaries": true } }
],
"lenses.format.style": "custom:laptop"
```

- `extends`: a built-in style (`wide`, `narrow`, `minimal`, `tabs`, `allman`) or an earlier custom style's id.
- `prettier`: any of `printWidth`, `tabWidth`, `useTabs`, `semi`, `singleQuote`, `jsxSingleQuote`, `quoteProps`, `trailingComma`, `bracketSpacing`, `bracketSameLine`, `objectWrap`, `arrowParens`, `experimentalTernaries`, `experimentalOperatorPosition`, `singleAttributePerLine`.
- `prettierConfigFile`: load options from an existing `.prettierrc` (options in `prettier` override it).
- `braces`: `"allman"` or `"same-line"`.

Custom styles appear in the Format Lenses panel with live examples (a style with a bad option shows Prettier's error on its card). **Lenses: Create Custom Display Style…** scaffolds one from any existing style. Edits to the setting apply immediately.

### Auto-save

Lenses turns on `"files.autoSave": "afterDelay"` and `"files.autoSaveWhenNoErrors": true` by default. In another VS Code with auto-save on, the extension offers to turn on the latter:

- While you type, a timed auto-save writes canonical form to disk but doesn't reflow the view under your cursor. The view tidies into your style when you switch away or save manually.
- Half-typed code can't be canonicalized. Lenses marks it with a "Not saved yet" error, so auto-save waits until the code parses instead of failing.

### How it works

- `src/format/fsProvider.ts`: a `FileSystemProvider` for `lens-fmt:`. Reads project the canonical file into the style, and writes convert back.
- `src/format/align.ts`, `lineMap.ts`: aligns the token streams of both layouts with an LCS diff (ignoring optional punctuation like `;` `,` `()`) to map display lines ↔ canonical lines.
- `src/format/project.ts`: Prettier keeps an object literal expanded if there's a newline after `{` (`objectWrap: "preserve"`), which would make canonical form depend on the view it was saved from. Before canonicalizing, each brace's newline is reset to what the previous canonical text had there.

No separate language server was needed. Styled views are ordinary documents, so VS Code's built-in TypeScript server handles them.

## Development

```bash
npm install
npm run build      # bundle to out/extension.js
npm test           # round-trip + line-map invariants for every style (pass extra dirs to widen the corpus)
npm run typecheck
```

Press F5 ("Run Lenses") to open the `sample/` workspace with the extension loaded from source. `npm run package` builds `dist/lenses.vsix`.

`tools/launch.sh <workspace>` starts an isolated VS Code (auto-save on) with the Chrome DevTools Protocol on port 9333. `tools/cdp.mjs` drives it (`shot`, `keys`, `click`, `wheel`, `command`, `eval`), which is how the UI was tested. `tools/stop.sh` quits it.

`tools/watch-layout.mjs <port> <seconds>` samples the layout every 50 ms from the earliest moment it can attach. It reports whether the right side bar or the Accounts button was ever visible during startup, which catches flashes a screenshot would miss.

CDP only sees the page Electron renders, so native OS dialogs (save prompts, file pickers) are invisible in its screenshots. To cover that:

- After every `cdp.mjs` command, `tools/native.py` lists X11 windows owned by the test instance (VS Code runs under XWayland). If any exist, the command exits 3 with a warning, and `shot` saves an image of each dialog.
- `command` picks the palette entry whose title matches exactly, never just the top fuzzy hit.
- `stop.sh` reverts unsaved test edits, quits, and verifies the quit. If a dialog still blocks it, `stop.sh` reports and cancels the dialog (`tools/xclose.py`) instead of leaving it on screen.

## Known limitations

- Breadcrumbs in a styled view show the absolute path (VS Code only shortens paths for `file:` URIs inside the workspace).
- If a file on disk isn't in canonical form yet, the first save from a styled view reformats the whole file. The Format panel warns about this.
- A file with a syntax error can't be saved from a styled view until the error is fixed (it can't be canonicalized). Use *View raw file*.
- Exceptions and imports analysis is static and per-call-target. Dynamic dispatch and imported `.d.ts`-only functions aren't followed.
- When `install.sh` adds missing editor defaults to Lenses' `settings.json`, it rewrites the file as plain JSON, so comments in that file are dropped. Files that already have every key are left byte-for-byte alone.
- Hiding the Accounts button needs Node 22.5+ (`node:sqlite`) and Lenses closed during install. Otherwise it's skipped with a note.
- Windows isn't supported by `install.sh` (the extension itself works; install `dist/lenses.vsix` manually).
