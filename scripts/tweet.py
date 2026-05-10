#!/usr/bin/env python3
"""FANZA ランキング自動ツイートスクリプト
投稿タイプ:
  rank    - 本日のランキング1位 (08:00 JST)
  actress - 人気女優TOP5       (12:00 JST)
  new     - 新着・セール作品   (21:00 JST)
"""

import json
import os
import random
import sys
from datetime import datetime, timezone, timedelta

try:
    import tweepy
except ImportError:
    print("tweepy not installed. Run: pip install tweepy")
    sys.exit(1)

JST = timezone(timedelta(hours=9))
SITE_URL = "https://naotoastrobb.github.io/fanza-site/home.html"

# ===== データ読み込み =====

def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("result", {}).get("status") == 404:
            return None
        return data
    except Exception as e:
        print(f"[WARN] Failed to load {path}: {e}")
        return None

# ===== Twitterクライアント =====

def get_client():
    required = [
        "TWITTER_API_KEY",
        "TWITTER_API_SECRET",
        "TWITTER_ACCESS_TOKEN",
        "TWITTER_ACCESS_TOKEN_SECRET",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"[ERROR] Missing secrets: {', '.join(missing)}")
        sys.exit(1)

    return tweepy.Client(
        consumer_key=os.environ["TWITTER_API_KEY"],
        consumer_secret=os.environ["TWITTER_API_SECRET"],
        access_token=os.environ["TWITTER_ACCESS_TOKEN"],
        access_token_secret=os.environ["TWITTER_ACCESS_TOKEN_SECRET"],
    )

# ===== ツイート生成 =====

def build_rank_tweet():
    """🏆 本日のランキング1位"""
    data = load_json("data/rank.json")
    if not data:
        return None

    items = data["result"].get("items", [])
    if not items:
        return None

    item = items[0]  # 1位
    title = item.get("title", "")[:35]
    actresses = [a["name"] for a in (item.get("iteminfo") or {}).get("actress", [])[:2]]
    actress = "・".join(actresses)
    price = (item.get("prices") or {}).get("price", "")
    total = data["result"].get("total_count", 0)

    lines = ["🏆 FANZAランキング1位", "", f"「{title}」"]
    if actress:
        lines.append(f"\n出演：{actress}")
    if price:
        lines.append(f"💰 ¥{price}〜")
    lines += [
        "",
        f"👇 サンプル動画・全{int(total):,}件",
        SITE_URL,
        "",
        "#FANZA #AV動画 #ランキング",
    ]
    return "\n".join(lines)


def build_actress_tweet():
    """👑 人気女優TOP5"""
    data = load_json("data/actress_popular.json")
    if not data:
        return None

    actresses = data["result"].get("actress", [])[:5]
    if not actresses:
        return None

    medals = ["🥇", "🥈", "🥉", "4位", "5位"]
    lines = ["👑 今日の人気女優ランキング", ""]
    for i, a in enumerate(actresses):
        lines.append(f"{medals[i]} {a.get('name', '')}")
    lines += ["", "🔗 作品をチェック", SITE_URL, "", "#FANZA #人気女優 #AV #ランキング"]
    return "\n".join(lines)


def build_new_tweet():
    """🆕 新着 or 🔥 セール作品"""
    data = load_json("data/new.json")
    if not data:
        return None

    items = data["result"].get("items", [])
    if not items:
        return None

    # セール品があれば優先、なければ新着からランダム
    sale_items = [i for i in items if i.get("campaign")]
    pool = sale_items if sale_items else items[:15]
    item = random.choice(pool)

    title = item.get("title", "")[:35]
    actresses = [a["name"] for a in (item.get("iteminfo") or {}).get("actress", [])[:2]]
    actress = "・".join(actresses)
    date_str = (item.get("date") or "")[:10]
    campaign = item.get("campaign") or {}
    is_sale = bool(campaign)

    header = "🔥 セール中！" if is_sale else "🆕 新着作品"
    lines = [header, "", f"「{title}」"]
    if actress:
        lines.append(f"\n出演：{actress}")
    if date_str and not is_sale:
        lines.append(f"📅 発売：{date_str}")
    if is_sale and campaign.get("title"):
        lines.append(f"🎉 {campaign['title']}")
    lines += [
        "",
        "👇 サンプル動画はこちら",
        SITE_URL,
        "",
        "#FANZA #セール #AV動画" if is_sale else "#FANZA #新着 #AV動画",
    ]
    return "\n".join(lines)

# ===== 投稿タイプを時刻から自動判定 =====

def detect_type_by_hour():
    hour_utc = datetime.now(timezone.utc).hour
    # 23 UTC = 08 JST → rank
    # 03 UTC = 12 JST → actress
    # 12 UTC = 21 JST → new
    if hour_utc == 23:
        return "rank"
    elif hour_utc == 3:
        return "actress"
    else:
        return "new"

# ===== メイン =====

def main():
    tweet_type = os.environ.get("TWEET_TYPE", "").strip() or detect_type_by_hour()
    print(f"[INFO] Tweet type: {tweet_type}  ({datetime.now(JST).strftime('%Y-%m-%d %H:%M JST')})")

    builders = {
        "rank":    build_rank_tweet,
        "actress": build_actress_tweet,
        "new":     build_new_tweet,
    }
    builder = builders.get(tweet_type, build_rank_tweet)
    text = builder()

    if not text:
        print("[ERROR] Could not build tweet content. Data file may be missing.")
        sys.exit(1)

    # Twitter は URL を常に23文字換算、日本語は2文字換算
    # 280文字上限を安全側で確認（簡易）
    if len(text) > 260:
        text = text[:257] + "..."

    print(f"[INFO] Tweet ({len(text)} chars):\n{'─'*40}\n{text}\n{'─'*40}")

    # DRY_RUN=true の場合は投稿しない
    if os.environ.get("DRY_RUN", "").lower() == "true":
        print("[DRY RUN] Skipping actual post.")
        return

    client = get_client()
    response = client.create_tweet(text=text)
    tweet_id = response.data["id"]
    print(f"[OK] Posted! https://twitter.com/i/web/status/{tweet_id}")


if __name__ == "__main__":
    main()
