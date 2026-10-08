#!/usr/bin/env python3
"""Politely close an X11 window (WM_DELETE_WINDOW, like clicking its close button).
For a GTK message dialog this is the same as pressing Cancel. Usage: xclose.py <window-id>"""
import ctypes, ctypes.util, sys

x = ctypes.cdll.LoadLibrary(ctypes.util.find_library('X11'))
x.XOpenDisplay.restype = ctypes.c_void_p
x.XInternAtom.restype = ctypes.c_ulong
x.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
x.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
x.XFlush.argtypes = x.XCloseDisplay.argtypes = [ctypes.c_void_p]

class ClientMessage(ctypes.Structure):
    _fields_ = [('type', ctypes.c_int), ('serial', ctypes.c_ulong), ('send_event', ctypes.c_int),
                ('display', ctypes.c_void_p), ('window', ctypes.c_ulong), ('message_type', ctypes.c_ulong),
                ('format', ctypes.c_int), ('data', ctypes.c_long * 5)]

class XEvent(ctypes.Union):
    _fields_ = [('xclient', ClientMessage), ('pad', ctypes.c_long * 24)]

win = int(sys.argv[1], 16)
dpy = x.XOpenDisplay(None)
if not dpy:
    sys.exit('cannot open X display')
ev = XEvent()
ev.xclient.type = 33  # ClientMessage
ev.xclient.window = win
ev.xclient.message_type = x.XInternAtom(dpy, b'WM_PROTOCOLS', 0)
ev.xclient.format = 32
ev.xclient.data[0] = x.XInternAtom(dpy, b'WM_DELETE_WINDOW', 0)
x.XSendEvent(dpy, win, 0, 0, ctypes.byref(ev))
x.XFlush(dpy)
x.XCloseDisplay(dpy)
