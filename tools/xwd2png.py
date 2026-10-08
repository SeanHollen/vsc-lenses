#!/usr/bin/env python3
"""Convert an X11 window dump (xwd -silent output, 24/32-bit TrueColor) to PNG."""
import struct, sys
from PIL import Image

data = open(sys.argv[1], 'rb').read()
h = struct.unpack('>25I', data[:100])
header_size, depth, width, height = h[0], h[3], h[4], h[5]
byte_order, bpp, bpl, ncolors = h[7], h[11], h[12], h[19]
# XWayland reports bits_per_pixel=24 but pads pixels to 4 bytes; trust the row stride.
bytes_pp = bpl // width
if bytes_pp not in (3, 4):
    sys.exit(f'unsupported pixel size {bytes_pp} bytes (bpp {bpp})')
pixels = data[header_size + ncolors * 12:]
raw = {(4, 0): 'BGRX', (4, 1): 'XRGB', (3, 0): 'BGR', (3, 1): 'RGB'}[(bytes_pp, byte_order)]
Image.frombytes('RGB', (width, height), pixels[:bpl * height], 'raw', raw, bpl).save(sys.argv[2])
print(f'{width}x{height}')
