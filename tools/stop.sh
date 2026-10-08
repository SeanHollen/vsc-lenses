#!/usr/bin/env bash
# Quit the VS Code instance started by launch.sh, via its own UI over CDP.
# Unsaved test edits are reverted first so the quit can't raise a native save prompt; if a
# native dialog still blocks the quit, it is reported, cancelled, and the script fails.
PORT="${PORT:-9333}"
HERE="$(cd "$(dirname "$0")" && pwd)"
CDP="node $HERE/cdp.mjs $PORT"
running() { curl -s "127.0.0.1:$PORT/json" >/dev/null; }
running || exit 0

dirty() { $CDP eval 'document.querySelectorAll(".tabs-container .tab.dirty").length' 2>/dev/null | tail -1; }
for i in $(seq 1 20); do
  n="$(dirty)"; [ "$n" = "0" ] && break
  $CDP click '.tabs-container .tab.dirty' >/dev/null && sleep 0.3
  $CDP command "File: Revert File" >/dev/null; sleep 0.5
done
[ "$(dirty)" = "0" ] || echo "warning: could not revert all unsaved editors" >&2

$CDP command "Close Window" >/dev/null 2>&1
for i in $(seq 1 20); do running || exit 0; sleep 0.5; done

echo "VS Code on port $PORT did not exit." >&2
if ! python3 "$HERE/native.py" >&2; then
  echo "A native dialog is blocking the quit; cancelling it so it doesn't linger on screen." >&2
  for w in $(python3 "$HERE/native.py" | grep -o '0x[0-9a-f]*'); do python3 "$HERE/xclose.py" "$w"; done
fi
exit 1
