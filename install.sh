#!/usr/bin/env bash
# Build Lenses and install it as its own editor: a `lenses` command that opens VS Code with
# a separate data folder where the extension is installed. Your normal `code` is untouched,
# and both can run at the same time. Safe to re-run (rebuilds and reinstalls).
#
#   ./install.sh            # or: npm run setup
#
# Overrides (environment variables):
#   LENSES_HOME      Lenses' VS Code data folder   (default: ~/.local/share/lenses)
#   LENSES_COMMAND   name of the launcher command   (default: lenses)
#   LENSES_BIN_DIR   where the launcher goes        (default: ~/.local/bin)
#   CODE             VS Code CLI to use             (default: code)
set -euo pipefail

LENSES_HOME="${LENSES_HOME:-$HOME/.local/share/lenses}"
COMMAND="${LENSES_COMMAND:-lenses}"
BIN_DIR="${LENSES_BIN_DIR:-$HOME/.local/bin}"
CODE="${CODE:-code}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || die "Node.js is required (https://nodejs.org)."
command -v npm >/dev/null || die "npm is required."
CODE_BIN="$(command -v "$CODE")" || die "VS Code's '$CODE' command isn't on PATH. Install VS Code, or set CODE=/path/to/code."
USER_DATA="$LENSES_HOME/user-data"
EXTENSIONS="$LENSES_HOME/extensions"

step "Installing dependencies"
npm ci --no-audit --no-fund

step "Building"
npm run --silent build

step "Packaging"
npm run --silent package

if [ ! -e "$USER_DATA/User/settings.json" ]; then
  step "Copying your VS Code settings into Lenses (first install only)"
  mkdir -p "$USER_DATA/User"
  for src in "$HOME/.config/Code/User" "$HOME/Library/Application Support/Code/User"; do
    [ -d "$src" ] || continue
    for f in settings.json keybindings.json snippets; do
      [ -e "$src/$f" ] && cp -R "$src/$f" "$USER_DATA/User/" && echo "  copied $f"
    done
    break
  done
  [ -e "$USER_DATA/User/settings.json" ] || echo '{}' > "$USER_DATA/User/settings.json"
fi

step "Applying Lenses editor settings (no AI features, no right side bar, auto-save)"
node "$HERE/tools/seed-settings.js" "$USER_DATA/User/settings.json"
node "$HERE/tools/seed-state.js" "$USER_DATA"

step "Installing the extension into $LENSES_HOME"
"$CODE_BIN" --user-data-dir "$USER_DATA" --extensions-dir "$EXTENSIONS" --install-extension "$HERE/dist/lenses.vsix" --force

step "Creating the '$COMMAND' command in $BIN_DIR"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/$COMMAND" <<LAUNCH
#!/usr/bin/env sh
# Lenses: VS Code with its own data folder ($LENSES_HOME). Created by $HERE/install.sh
exec "$CODE_BIN" --user-data-dir "$USER_DATA" --extensions-dir "$EXTENSIONS" "\$@"
LAUNCH
chmod +x "$BIN_DIR/$COMMAND"

printf '\n\033[32mDone.\033[0m Open a folder with:  %s .\n' "$COMMAND"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf '\nNote: %s is not on your PATH. Add this to your shell profile (~/.bashrc, ~/.zshrc):\n  export PATH="%s:$PATH"\n' "$BIN_DIR" "$BIN_DIR" ;;
esac
