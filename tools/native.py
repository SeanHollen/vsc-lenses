#!/usr/bin/env python3
"""Find native (non-web) windows opened by the test VS Code: save prompts, file pickers, etc.

CDP screenshots only show the page Electron renders, so OS dialogs are invisible to them.
VS Code runs under XWayland, so its dialogs are X11 windows we can list and dump.

Usage: native.py [png-prefix]   prints one line per dialog; with a prefix, also saves
       <prefix>-<n>.png (screen region of the dialog; other windows on top will show).
Exit status: 0 = no dialogs, 3 = dialogs found.
"""
import os, re, subprocess, sys

def xprop(*args):
    return subprocess.run(['xprop', *args], capture_output=True, text=True).stdout

def prop(win, name):
    out = xprop('-id', win, name)
    m = re.search(r'=\s*(.*)', out) or re.search(r'#\s*(0x[0-9a-f]+)', out)
    return m.group(1).strip().strip('"') if m else ''

clients = re.findall(r'0x[0-9a-f]+', xprop('-root', '_NET_CLIENT_LIST'))
info = {w: {'title': prop(w, '_NET_WM_NAME'), 'pid': prop(w, '_NET_WM_PID'), 'type': prop(w, '_NET_WM_WINDOW_TYPE')} for w in clients}
mains = {w for w, i in info.items() if i['title'].startswith('[Extension Development Host]')}
pids = {info[w]['pid'] for w in mains}
dialogs = [w for w, i in info.items() if i['pid'] in pids and w not in mains]

here = os.path.dirname(os.path.abspath(__file__))
for n, w in enumerate(dialogs, 1):
    line = f"NATIVE WINDOW {w} type={info[w]['type'].replace('_NET_WM_WINDOW_TYPE_', '')} title={info[w]['title']!r}"
    if len(sys.argv) > 1:
        png = f'{sys.argv[1]}-{n}.png'
        xwd = png[:-4] + '.xwd'
        with open(xwd, 'wb') as f:
            subprocess.run(['xwd', '-id', w, '-silent'], stdout=f, check=False)
        subprocess.run([sys.executable, os.path.join(here, 'xwd2png.py'), xwd, png], capture_output=True)
        os.remove(xwd)
        line += f' -> {png}'
    print(line)
sys.exit(3 if dialogs else 0)
