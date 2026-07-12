"""PWAアイコン生成スクリプト（シンプルなPNGを生成）"""
import os, struct, zlib

def make_png(size, r, g, b):
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(c[4:]) & 0xffffffff)
    pixel = bytes([r, g, b])
    row   = b'\x00' + pixel * size  # フィルタバイト0 + 1行分のピクセル
    raw   = row * size              # 全行
    sig   = b'\x89PNG\r\n\x1a\n'
    ihdr  = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    idat  = chunk(b'IDAT', zlib.compress(raw))
    iend  = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png')]:
    path = os.path.join('icons', name)
    if not os.path.exists(path):
        with open(path, 'wb') as f:
            f.write(make_png(size, 255, 51, 102))  # #ff3366 ピンク
        print(f'Generated {name}')
    else:
        print(f'Skip {name} (already exists)')
