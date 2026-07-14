#!/usr/bin/env python3
"""
女優プロフィール・ランキング画像から顔検出してクロップ → data/faces/actress_{id}.jpg
GitHub Actionsで fetch-products 後に実行する。
既存ファイルはスキップするので差分だけ処理できる。
"""
import json, os, io, time, sys
import urllib.request
import cv2
import numpy as np
from PIL import Image

FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
OUTPUT_DIR   = 'data/faces'
ACTRESS_FILES = [
    'data/actress_profiles.json',
    'data/actress_popular.json',
    'data/actress_monthly.json',
    'data/actress_new.json',
]
os.makedirs(OUTPUT_DIR, exist_ok=True)

def download_image(url):
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.dmm.co.jp/',
        'Accept':     'image/webp,image/apng,image/*,*/*;q=0.8',
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read()

def crop_face(image_bytes):
    """
    顔検出 → 顔+余白でクロップ → 512x512にリサイズ。
    顔が見つからない場合は上部中央のポートレートクロップ（フォールバック）。
    返値: PIL.Image
    """
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    w, h = img.size
    img_np = np.array(img)
    gray   = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)

    faces = FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.08, minNeighbors=3, minSize=(25, 25)
    )

    if len(faces) > 0:
        # 最大の顔を使用
        fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
        # 余白: 左右60%、上80%（髪含む）、下50%（あご下）
        pad_x   = int(fw * 0.60)
        pad_top = int(fh * 0.80)
        pad_bot = int(fh * 0.50)
        x1 = max(0, fx - pad_x)
        y1 = max(0, fy - pad_top)
        x2 = min(w, fx + fw + pad_x)
        y2 = min(h, fy + fh + pad_bot)
        # 正方形に調整
        side = max(x2 - x1, y2 - y1)
        cx   = (x1 + x2) // 2
        cy   = (y1 + y2) // 2
        x1   = max(0, cx - side // 2)
        y1   = max(0, cy - side // 2)
        x2   = min(w, x1 + side)
        y2   = min(h, y1 + side)
        mode = f'face'
    else:
        # フォールバック: 画像上部70%を中央からクロップ
        side = int(min(w, h * 0.9))
        x1   = (w - side) // 2
        y1   = int(h * 0.02)
        x2   = x1 + side
        y2   = y1 + side
        mode = 'fallback'

    cropped = img.crop((x1, y1, x2, y2)).resize((512, 512), Image.LANCZOS)
    return cropped, mode

def load_actresses():
    """全ソースをIDで統合し、ランキング入りした新しい女優も自動処理する。"""
    by_id = {}
    for path in ACTRESS_FILES:
        try:
            with open(path) as f:
                data = json.load(f)
        except Exception as e:
            print(f'{path} 読み込み失敗: {e}')
            continue

        source_count = 0
        for actress in data.get('result', {}).get('actress', []):
            aid = str(actress.get('id', ''))
            if not aid:
                continue
            source_count += 1
            if aid not in by_id:
                by_id[aid] = actress
                continue

            current = by_id[aid]
            if not (current.get('imageURL') or {}).get('large') and not (current.get('imageURL') or {}).get('small'):
                current['imageURL'] = actress.get('imageURL') or {}
            if not current.get('name') and actress.get('name'):
                current['name'] = actress['name']
        print(f'読込: {path} → {source_count}人')

    return list(by_id.values())

def main():
    actresses = load_actresses()
    if not actresses:
        print('女優データを読み込めませんでした')
        sys.exit(1)

    print(f'対象: {len(actresses)}人')

    ok = skip = fail = 0
    for a in actresses:
        aid  = str(a.get('id', ''))
        name = a.get('name', '')
        if not aid:
            continue

        out_path = f'{OUTPUT_DIR}/actress_{aid}.jpg'
        if os.path.exists(out_path):
            skip += 1
            continue

        img_url = (a.get('imageURL') or {}).get('large') or (a.get('imageURL') or {}).get('small')
        if not img_url:
            fail += 1
            continue

        try:
            img_bytes    = download_image(img_url)
            cropped, mode = crop_face(img_bytes)
            cropped.save(out_path, 'JPEG', quality=88)
            ok += 1
            if ok % 100 == 0 or ok <= 5:
                print(f'  {ok}件完了 [{mode}] {name}')
            time.sleep(0.1)
        except Exception as e:
            fail += 1
            if fail <= 10:
                print(f'  失敗 {name}: {e}')

    total = len(os.listdir(OUTPUT_DIR))
    print(f'完了 → 成功:{ok} スキップ:{skip} 失敗:{fail} / 総計:{total}件')

if __name__ == '__main__':
    main()
