"""检查 Droplet.png：尺寸、alpha 范围、不透明像素的亮度分布"""
import struct, zlib, os, sys

SRC = r"D:\yuruo2026\workbudddy\Personal Blog\images\Droplet.png"

def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    w = h = None; bitdepth = colortype = None
    idat = b''
    plte = None; trns = None
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        ctype = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        if ctype == b'IHDR':
            w, h, bitdepth, colortype = struct.unpack('>IIBB', chunk[:10])
        elif ctype == b'IDAT':
            idat += chunk
        elif ctype == b'PLTE':
            plte = chunk
        elif ctype == b'tRNS':
            trns = chunk
        pos += 12 + length
    raw = zlib.decompress(idat)
    ch = {0:1, 2:3, 3:1, 4:2, 6:4}[colortype]
    assert bitdepth == 8, f"bitdepth {bitdepth}"
    stride = w * ch
    recon = bytearray()
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i-ch]) & 0xFF
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                b = prev[i]
                c = prev[i-ch] if i >= ch else 0
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        recon += line
        prev = line
    return w, h, colortype, ch, bytes(recon)

w, h, ct, ch, px = read_png(SRC)
print(f"size {w}x{h} colortype {ct} channels {ch}")

# 亮度统计（不透明像素）
n_op = 0
sum_lum = 0
bright = 0   # lum > 100
mid = 0      # 40 < lum <= 100
dark = 0     # lum <= 40
maxl = 0
minx, miny, maxx, maxy = w, h, -1, -1

for y in range(h):
    row = y * w * ch
    for x in range(w):
        i = row + x * ch
        if ct == 6:
            r, g, b, a = px[i], px[i+1], px[i+2], px[i+3]
        elif ct == 2:
            r, g, b, a = px[i], px[i+1], px[i+2], 255
        else:
            print("unsupported for stats"); sys.exit()
        if a > 25:
            n_op += 1
            lum = (r * 299 + g * 587 + b * 114) // 1000
            sum_lum += lum
            if lum > maxl: maxl = lum
            if lum > 100: bright += 1
            elif lum > 40: mid += 1
            else: dark += 1
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y

print(f"opaque px: {n_op} ({n_op/(w*h)*100:.1f}%)")
print(f"bbox: x {minx}-{maxx} ({maxx-minx+1}px), y {miny}-{maxy} ({maxy-miny+1}px)")
if n_op:
    print(f"mean lum: {sum_lum/n_op:.1f}  max {maxl}")
    print(f"bright(>100): {bright/n_op*100:.1f}%  mid(40-100): {mid/n_op*100:.1f}%  dark(<=40): {dark/n_op*100:.1f}%")
