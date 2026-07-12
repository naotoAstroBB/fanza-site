#!/usr/bin/env python3
"""
ローカルの商品JSONから女優別作品インデックスを生成する。
actress_profiles.json に登録された女優のみを対象とする。
"""
import json
import glob
from collections import defaultdict

# actress_profiles から対象IDを取得
profile_ids = set()
try:
    with open('data/actress_profiles.json') as f:
        data = json.load(f)
    for a in data.get('result', {}).get('actress', []):
        aid = str(a.get('id', ''))
        if aid:
            profile_ids.add(aid)
except Exception:
    pass
print(f"プロフィール対象: {len(profile_ids)}人")

# 全商品ファイルから女優別に作品を収集
items_by_actress = defaultdict(dict)
files = (
    glob.glob('data/rank.json') +
    glob.glob('data/new.json') +
    glob.glob('data/review.json') +
    glob.glob('data/genre_*.json') +
    glob.glob('data/anime*.json')
)
for fpath in files:
    try:
        with open(fpath) as fh:
            data = json.load(fh)
        for item in data.get('result', {}).get('items', []):
            cid = item.get('content_id')
            if not cid:
                continue
            for a in item.get('iteminfo', {}).get('actress', []):
                aid = str(a.get('id', ''))
                if aid and aid not in ('', 'None', 'null'):
                    if not profile_ids or aid in profile_ids:
                        items_by_actress[aid][cid] = item
    except Exception:
        pass

built = 0
for aid, works in items_by_actress.items():
    items = sorted(works.values(), key=lambda x: x.get('date', ''), reverse=True)
    out = {
        'result': {
            'status': 200,
            'items': items,
            'total_count': len(items),
            'result_count': len(items),
        }
    }
    with open(f'data/actress_works_{aid}.json', 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    built += 1

print(f"ローカルデータから {built} 人分の作品インデックスを生成")
