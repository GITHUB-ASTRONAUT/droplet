"""读取 png / jpeg 的尺寸（纯标准库，避免依赖 Pillow）"""
import struct, os, glob

D = r"D:\yuruo2026\workbudddy\Personal Blog\images"

def png_size(p):
    with open(p, 'rb') as f:
        d = f.read(33)
    if d[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    w, h = struct.unpack('>II', d[16:24])
    return w, h

def jpeg_size(p):
    with open(p, 'rb') as f:
        data = f.read()
    i = 2
    n = len(data)
    while i < n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seglen = struct.unpack('>H', data[i + 2:i + 4])[0]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                      0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack('>HH', data[i + 5:i + 9])
            return w, h
        i += 2 + seglen
    return None

for f in sorted(glob.glob(os.path.join(D, '*'))):
    name = os.path.basename(f)
    ext = os.path.splitext(name)[1].lower()
    if ext == '.png':
        s = png_size(f)
    elif ext in ('.jpg', '.jpeg'):
        s = jpeg_size(f)
    else:
        s = None
    if s:
        w, h = s
        print(f"{name:16s} {w:6d} x {h:6d}   ratio {w/h:.3f}")
    else:
        print(f"{name:16s} (unknown)")
