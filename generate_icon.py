"""Generates assets/icon.png (512x512) and assets/icon.ico (multi-size).
Uses only Python stdlib — no Pillow required.
"""
import struct, zlib, os

# Ember orange / dark bg
BG = (15,  15,  15,  255)
FG = (196, 92,  26,  255)   # #C45C1A

# ── pixel helpers ────────────────────────────────────────────────────────────

def make_grid(size, color):
    return [color] * (size * size)

def draw_rect(grid, size, x0, y0, x1, y1, color):
    for y in range(max(0,y0), min(size,y1)):
        for x in range(max(0,x0), min(size,x1)):
            grid[y*size+x] = color

def draw_rounded_rect(grid, size, x0, y0, x1, y1, r, color):
    # Fill interior
    draw_rect(grid, size, x0+r, y0,   x1-r, y1,   color)
    draw_rect(grid, size, x0,   y0+r, x1,   y1-r, color)
    # Rounded corners via quarter-circle
    for cx, cy, sx, sy in [(x0+r,y0+r,-1,-1),(x1-r,y0+r,1,-1),
                            (x0+r,y1-r,-1,1),(x1-r,y1-r,1,1)]:
        for dy in range(r+1):
            for dx in range(r+1):
                if dx*dx + dy*dy <= r*r:
                    grid[(cy+sy*dy)*size+(cx+sx*dx)] = color

def draw_flame(grid, size, color):
    """Simple procedural flame shape centred in the icon."""
    cx = size // 2
    # Main body: slightly tapered column
    for y in range(size):
        t = y / size                         # 0=top, 1=bottom
        if t > 0.85:
            continue                          # base cutoff
        progress = 1.0 - t                   # 0 at top, 1 at bottom
        # flame narrows toward top
        half_w = int(size * 0.18 * (0.3 + 0.7 * progress))
        row_y = int(size * 0.08) + y
        if row_y >= size:
            break
        for x in range(cx - half_w, cx + half_w + 1):
            if 0 <= x < size:
                grid[row_y*size+x] = color

    # Inner bright tip — a taller, narrower version
    for y in range(size):
        t = y / size
        if t > 0.55:
            continue
        progress = 1.0 - t
        half_w = int(size * 0.08 * (0.2 + 0.8 * progress))
        row_y = int(size * 0.08) + y
        if row_y >= size:
            break
        for x in range(cx - half_w, cx + half_w + 1):
            if 0 <= x < size:
                grid[row_y*size+x] = (min(255, color[0]+40),
                                       min(255, color[1]+20),
                                       color[2], 255)

def make_icon_pixels(size):
    grid = make_grid(size, BG)
    # Rounded background card
    pad = size // 10
    r   = size // 6
    draw_rounded_rect(grid, size, pad, pad, size-pad, size-pad, r, (30,30,30,255))
    # Flame
    draw_flame(grid, size, FG)
    return grid

# ── PNG writer (no Pillow) ───────────────────────────────────────────────────

def png_chunk(tag, data):
    payload = tag + data
    crc = zlib.crc32(payload) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + payload + struct.pack('>I', crc)

def write_png(path, size):
    pixels = make_icon_pixels(size)
    ihdr = struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0])  # 8bpp RGBA
    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            raw += bytes(pixels[y*size+x])
    compressed = zlib.compress(raw, 9)
    png = (b'\x89PNG\r\n\x1a\n'
           + png_chunk(b'IHDR', ihdr)
           + png_chunk(b'IDAT', compressed)
           + png_chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(f'  wrote {path}  ({len(png)//1024}KB)')

# ── BMP-in-ICO writer ────────────────────────────────────────────────────────

def make_bmp_for_ico(size):
    """Return a raw BMP blob (BITMAPINFOHEADER + pixels + AND mask) for ICO."""
    pixels = make_icon_pixels(size)
    # BITMAPINFOHEADER
    bpp = 32
    stride = size * 4
    pixel_bytes = size * stride
    and_stride = ((size + 31) // 32) * 4   # DWORD-aligned row of 1bpp AND mask
    and_bytes = size * and_stride
    hdr = struct.pack('<IiiHHIIiiII',
        40,          # header size
        size,        # width
        size*2,      # height (doubled for ICO XOR+AND masks)
        1,           # planes
        bpp,
        0,           # BI_RGB
        pixel_bytes,
        0, 0, 0, 0)
    # Pixel data — BMP rows are bottom-up, BGRA
    px_data = b''
    for y in range(size-1, -1, -1):
        for x in range(size):
            r,g,b,a = pixels[y*size+x]
            px_data += bytes([b, g, r, a])
    # AND mask — all zero (fully opaque), bottom-up, DWORD-padded
    and_data = b'\x00' * and_bytes
    return hdr + px_data + and_data

def write_ico(path, sizes=(16, 32, 48, 256)):
    blobs = [make_bmp_for_ico(s) for s in sizes]
    n = len(sizes)
    header = struct.pack('<HHH', 0, 1, n)
    offset = 6 + n * 16
    entries = b''
    for i, s in enumerate(sizes):
        blob = blobs[i]
        w = s if s < 256 else 0
        h = s if s < 256 else 0
        entries += struct.pack('<BBBBHHII',
            w, h, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    ico = header + entries + b''.join(blobs)
    with open(path, 'wb') as f:
        f.write(ico)
    print(f'  wrote {path}  ({len(ico)//1024}KB, sizes={sizes})')

# ── main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs('assets', exist_ok=True)
    print('Generating Pyre placeholder icons…')
    write_png('assets/icon.png', 512)
    write_ico('assets/icon.ico', sizes=(16, 32, 48, 256))
    print('Done.')
