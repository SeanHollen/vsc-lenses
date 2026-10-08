#!/usr/bin/env bash
# Launch an isolated VS Code with this extension loaded and CDP on $PORT (for screenshots/tests).
# Usage: tools/launch.sh <workspace> [state-dir]
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WS="$1"; STATE="${2:-/tmp/lenses-test}"; PORT="${PORT:-9333}"
if curl -s "127.0.0.1:$PORT/json" >/dev/null; then
  echo "A VS Code is already listening on port $PORT; run tools/stop.sh first." >&2; exit 1
fi
mkdir -p "$STATE/ud/User" "$STATE/ext"
[ -f "$STATE/ud/User/settings.json" ] || cat > "$STATE/ud/User/settings.json" <<'JSON'
{
  "workbench.startupEditor": "none",
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "chat.disableAIFeatures": true,
  "workbench.tips.enabled": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "git.openRepositoryInParentFolders": "always",
  "window.zoomLevel": 0,
  "files.autoSave": "afterDelay",
  "files.autoSaveWhenNoErrors": true
}
JSON
code --user-data-dir "$STATE/ud" --extensions-dir "$STATE/ext" --extensionDevelopmentPath="$HERE" \
  --remote-debugging-port=$PORT --disable-workspace-trust --skip-welcome --new-window "$WS" >"$STATE/code.log" 2>&1 &
for i in $(seq 1 40); do curl -s 127.0.0.1:$PORT/json >/dev/null && break; sleep 0.5; done
