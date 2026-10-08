#!/usr/bin/env bash
# Remove the `lenses` command. With --purge, also delete Lenses' data folder (its settings,
# extensions and state). Your normal VS Code is never touched.
set -euo pipefail
LENSES_HOME="${LENSES_HOME:-$HOME/.local/share/lenses}"
COMMAND="${LENSES_COMMAND:-lenses}"
BIN_DIR="${LENSES_BIN_DIR:-$HOME/.local/bin}"
rm -f "$BIN_DIR/$COMMAND" && echo "Removed $BIN_DIR/$COMMAND"
if [ "${1:-}" = "--purge" ]; then
  rm -rf "$LENSES_HOME" && echo "Deleted $LENSES_HOME"
else
  echo "Kept $LENSES_HOME (settings and state). Run with --purge to delete it."
fi
