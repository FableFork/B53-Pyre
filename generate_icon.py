"""Generates assets/icon.png (512x512) and assets/icon.ico (multi-size).
Uses only Python stdlib — no Pillow required.
Transparent background so the flame looks sharp on any taskbar colour.
"""
import struct, zlib, os, math

TRANSPARENT = (0, 0, 0, 0)
FLAME_BASE  = (220, 100, 28, 255)   # bright ember orange
FLAME_INNER = (255, 185, 60, 255)   # warm yellow-orange core
SHADOW      = (0, 0, 0, 100)        # semi-transparent shadow for light bg visibility

# ── pixel helpers ────────────────────────────────────────────────────────────

def make_grid(size):
    return [TRANSPARENT] * (size * size)

def blend(dst, src):
    """Alpha-composite src over dst."""
    sa = src[3] / 255
    da = dst[3] / 255
    if sa == 0:
        return dst
    out_a = sa + da * (1 - sa)
    if out_a == 0:
        return TRANSPARENT
    r = int((src[0]*sa + dst[0]*da*(1-sa)) / out_a)
    g = int((src[1]*sa + dst[1]*da*(1-sa)) / out_a)
    b = int((src[2]*sa + dst[2]*da*(1-sa)) / out_a)
    return (min(255,r), min(255,g), min(255,b), int(out_a*255))

def set_px(grid, size, x, y, color):
    if 0 <= x < size and 0 <= y < size:
        idx = y * size + x
        grid[idx] = blend(grid[idx], color)

def draw_ellipse_filled(grid, size, cx, cy, rx, ry, color):
    for dy in range(-ry - 1, ry + 2):
        for dx in range(-rx - 1, rx + 2):
            if rx > 0 and ry > 0 and (dx/rx)**2 + (dy/ry)**2 <= 1.0:
                set_px(grid, size, cx + dx, cy + dy, color)

# ── flame shape ──────────────────────────────────────────────────────────────

def flame_alpha(t, x_norm):
    """t = 0..1 (top to bottom), x_norm = 0..1 (centre distance normalised).
    Returns 0..255 alpha for the flame body."""
    if t < 0.04:
        return 0
    # Width envelope: sine curve gives natural flame taper
    width = math.sin(math.pi * min(t / 0.75, 1.0)) ** 0.6
    if x_norm > width:
        return 0
    # Brightness falls off toward edge
    edge_falloff = 1.0 - (x_norm / width) ** 2
    # Fade the tip
    tip_fade = min(1.0, (t - 0.04) / 0.1)
    # Fade the base
    base_fade = 1.0 - max(0.0, (t - 0.72) / 0.18)
    return int(255 * edge_falloff * tip_fade * base_fade)

def inner_alpha(t, x_norm):
    if t < 0.1 or t > 0.65:
        return 0
    width = math.sin(math.pi * (t - 0.1) / 0.55) ** 0.5 * 0.5
    if width < 0.001 or x_norm > width:
        return 0
    edge_falloff = 1.0 - (x_norm / width) ** 2
    tip_fade = min(1.0, (t - 0.1) / 0.08)
    return int(255 * edge_falloff * tip_fade)

def draw_flame(grid, size):
    cx = size / 2
    half_w = size * 0.38   # maximum half-width of flame
    pad_top = int(size * 0.04)
    flame_h = int(size * 0.90)

    # Shadow pass — slightly wider, semi-transparent black beneath flame
    for y in range(pad_top, pad_top + flame_h + 1):
        t = (y - pad_top) / flame_h
        for dx in range(-int(half_w) - 2, int(half_w) + 3):
            x = int(cx) + dx
            x_norm = abs(dx) / (half_w * 1.12)
            a = flame_alpha(t, x_norm)
            if a > 20:
                shadow_a = min(120, int(a * 0.47))
                # offset shadow down-right 1 pixel
                set_px(grid, size, x + 1, y + 1, (0, 0, 0, shadow_a))

    # Base flame pass
    for y in range(pad_top, pad_top + flame_h + 1):
        t = (y - pad_top) / flame_h
        for dx in range(-int(half_w) - 1, int(half_w) + 2):
            x = int(cx) + dx
            x_norm = abs(dx) / half_w
            a = flame_alpha(t, x_norm)
            if a > 0:
                r = int(FLAME_BASE[0] + (FLAME_INNER[0] - FLAME_BASE[0]) * (1 - x_norm))
                g = int(FLAME_BASE[1] + (FLAME_INNER[1] - FLAME_BASE[1]) * (1 - x_norm) * 0.5)
                b = FLAME_BASE[2]
                set_px(grid, size, x, y, (r, g, b, a))

    # Inner bright core pass
    for y in range(pad_top, pad_top + flame_h + 1):
        t = (y - pad_top) / flame_h
        for dx in range(-int(half_w * 0.6), int(half_w * 0.6) + 1):
            x = int(cx) + dx
            x_norm = abs(dx) / (half_w * 0.5)
            a = inner_alpha(t, x_norm)
            if a > 0:
                set_px(grid, size, x, y, (FLAME_INNER[0], FLAME_INNER[1], FLAME_INNER[2], a))

def make_icon_pixels(size):
    grid = make_grid(size)
    draw_flame(grid, size)
    return grid

# ── PNG writer ───────────────────────────────────────────────────────────────

def png_chunk(tag, data):
    payload = tag + data
    crc = zlib.crc32(payload) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + payload + struct.pack('>I', crc)

def write_png(path, size):
    pixels = make_icon_pixels(size)
    ihdr = struct.pack('>II', size, size) + bytes([8, 6, 0, 0, 0])
    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            raw += bytes(pixels[y * size + x])
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
    pixels = make_icon_pixels(size)
    bpp = 32
    stride = size * 4
    pixel_bytes = size * stride
    and_stride = ((size + 31) // 32) * 4
    and_bytes = size * and_stride
    hdr = struct.pack('<IiiHHIIiiII',
        40, size, size * 2, 1, bpp, 0, pixel_bytes, 0, 0, 0, 0)
    px_data = b''
    for y in range(size - 1, -1, -1):
        for x in range(size):
            r, g, b, a = pixels[y * size + x]
            px_data += bytes([b, g, r, a])
    # AND mask: 0 = opaque (Windows uses per-pixel alpha from ARGB data for 32bpp)
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
        entries += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(blob), offset)
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
