#!/usr/bin/env python3
"""FANZA ランキング自動ツイートスクリプト

投稿タイプ:
  rank    - 本日のランキング作品 (08:00 JST)  ← 上位20件から毎日ローテーション
  actress - 人気女優TOP5       (12:00 JST)
  new     - 新着・セール作品   (21:00 JST)  ← 毎日違う作品をローテーション

ポイント:
  - 日付+saltのSHA256シードで「毎日違う作品・毎日違う文体」を自動選択
  - 続きが気になる煽り文体の複数テンプレートからランダム選択
  - セール品は自動で優先表示
"""

import hashlib
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


# ===== 日付シードによる再現可能なランダム選択 =====
# 同じ日・同じsaltなら必ず同じ結果、日が変わると自動で変わる

def date_pick(items, salt=""):
    """日付+saltでシードし、毎日違うアイテムを1つ選ぶ"""
    today = datetime.now(JST).strftime("%Y-%m-%d") + "|" + salt
    seed = int(hashlib.sha256(today.encode()).hexdigest()[:8], 16)
    return random.Random(seed).choice(items)


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


# ===== テンプレート集 =====

RANK_TEMPLATES = [
    """\
🔥 今日みんなが一番観てる作品がこれ

「{title}」{actress}

なぜこれが1位なのか…サンプルを見れば一発でわかる👀
今日だけで何千人も再生してます

▼ 無料サンプルはこちら
{url}

#FANZA #AV動画 #ランキング""",

    """\
👀 これ知らないの？今1番ヤバい作品

「{title}」{actress}

サンプル観た瞬間に続きが見たくなる仕上がり🔥
気になってるなら今すぐチェックして

▼ サンプル動画・詳細はこちら
{url}

#FANZA #AV動画 #ランキング""",

    """\
😮 ランキング1位の作品、見た？

「{title}」{actress}

これ1回観たら最後まで止まれない系です…
気になる人は損しないうちに確認を✅{price}
▼ 詳細・無料サンプルはこちら
{url}

#FANZA #AV動画 #ランキング""",

    """\
💥 今日のFANZA最注目作品

「{title}」{actress}

「これは予想外だった」と話題沸騰中🌊
サンプルだけでも絶対後悔しないやつ

▼ 今すぐチェック
{url}

#FANZA #ランキング #AV動画""",

    """\
🎬 今日もこれが1位…納得の理由がある

「{title}」{actress}

観た人全員が「思ってたより全然いい」と言う作品👀
あなたも確かめてみて

▼ 無料サンプルを今すぐ再生
{url}

#FANZA #AV動画 #ランキング""",
]

ACTRESS_TEMPLATES = [
    """\
👑 今SNSで話題の人気女優ランキング

{ranking}

この中で一番気になるのは誰？🔥
コメントで教えて！

▼ 出演作品・サンプル動画はこちら
{url}

#FANZA #人気女優 #AV #ランキング""",

    """\
💥 今週チェックすべき女優TOP5がこれ

{ranking}

あなたの推しは入ってる？❤️
気になる作品はサイトでサンプル視聴できます

▼ 全員の最新作はこちら
{url}

#FANZA #人気女優 #AV #ランキング""",

    """\
🌸 今1番アツい女優はこの5人

{ranking}

どの作品も完成度が高すぎて選べない問題🔥
まずサンプルで確認してみて

▼ 作品一覧・無料サンプルはこちら
{url}

#FANZA #人気女優 #ランキング #AV""",

    """\
😍 要チェック！人気女優ランキングTOP5

{ranking}

今週このランキングが話題になってます👀
推しを見つけたらコメントで！

▼ 最新作・サンプル動画はこちら
{url}

#FANZA #人気女優 #AV #ランキング""",
]

NEW_TEMPLATES = [
    """\
🆕 これ発掘した？こっそり人気急上昇中

「{title}」{actress}

サンプルが話題になってます…
気になる人は早めにチェックして✅{date_line}
▼ 無料サンプル動画はこちら
{url}

#FANZA #新着 #AV動画""",

    """\
🎬 発見した？今話題の新着作品がこれ

「{title}」{actress}

最後まで目が離せないと評判🔥
観た人が口を揃えて「期待以上」と言ってる{date_line}
▼ サンプル動画・詳細はこちら
{url}

#FANZA #新着 #AV動画""",

    """\
😮 知らなかった？新着でこれが凄い

「{title}」{actress}

見た人みんなリピートしてるらしい…👀{date_line}
まずはサンプルで確認してみて

▼ 無料サンプルはこちら
{url}

#FANZA #新着 #AV動画""",

    """\
💫 新着の中でこれが断トツでヤバい

「{title}」{actress}

「なんでもっと早く知らなかったんだ」って絶対なる🔥{date_line}
▼ サンプル動画・詳細はこちら
{url}

#FANZA #新着 #AV動画""",
]

SALE_TEMPLATES = [
    """\
🔥 今だけ！これセール中なの知ってた？

「{title}」{actress}

{campaign}終わったら元値に戻るから急いで👀
サンプルで確認してから損なし

▼ セール価格で今すぐチェック
{url}

#FANZA #セール #AV動画""",

    """\
⏰ セール終了前に急いで！

「{title}」{actress}

{campaign}これ逃したら絶対後悔するやつです…🔥
サンプル観たら止まらない系

▼ 期間限定セール中・詳細はこちら
{url}

#FANZA #セール #AV動画""",

    """\
💥 これセール価格になってるの今だけ

「{title}」{actress}

{campaign}この価格で観れるのは今だけ⚡
気になってた人は今がチャンス

▼ セール詳細・サンプルはこちら
{url}

#FANZA #セール #AV動画""",
]


# ===== ツイート生成 =====

def build_rank_tweet():
    """🏆 本日のランキング — 上位20件から毎日ローテーション"""
    data = load_json("data/rank.json")
    if not data:
        return None

    items = data["result"].get("items", [])
    if not items:
        return None

    # 上位20件からその日の作品を選ぶ（毎日変わる）
    pool = items[:min(20, len(items))]
    item = date_pick(pool, salt="rank_item")

    title    = item.get("title", "")[:28]
    names    = [a["name"] for a in (item.get("iteminfo") or {}).get("actress", [])[:2]]
    actress  = ("\n出演：" + "・".join(names)) if names else ""
    price    = (item.get("prices") or {}).get("price", "")
    price_ln = (f"\n💰 ¥{price}〜\n") if price else "\n"

    tmpl = date_pick(RANK_TEMPLATES, salt="rank_tmpl")
    return tmpl.format(title=title, actress=actress, price=price_ln, url=SITE_URL)


def build_actress_tweet():
    """👑 人気女優TOP5"""
    data = load_json("data/actress_popular.json")
    if not data:
        return None

    actresses = data["result"].get("actress", [])[:5]
    if not actresses:
        return None

    medals  = ["🥇", "🥈", "🥉", "4位", "5位"]
    ranking = "\n".join(f"{medals[i]} {a.get('name','')}" for i, a in enumerate(actresses))

    tmpl = date_pick(ACTRESS_TEMPLATES, salt="actress_tmpl")
    return tmpl.format(ranking=ranking, url=SITE_URL)


def build_new_tweet():
    """🆕 新着 or 🔥 セール作品 — 毎日違う作品をローテーション"""
    data = load_json("data/new.json")
    if not data:
        return None

    items = data["result"].get("items", [])
    if not items:
        return None

    # セール品があれば優先
    sale_items = [i for i in items if i.get("campaign")]
    is_sale    = bool(sale_items)
    pool       = sale_items if is_sale else items

    # 毎日違う作品を選ぶ（先頭30件から）
    item = date_pick(pool[:min(30, len(pool))], salt="new_item")

    title    = item.get("title", "")[:28]
    names    = [a["name"] for a in (item.get("iteminfo") or {}).get("actress", [])[:2]]
    actress  = ("\n出演：" + "・".join(names)) if names else ""
    date_str = (item.get("date") or "")[:10]
    campaign = item.get("campaign") or {}

    if is_sale:
        camp_title = campaign.get("title", "セール開催中！")
        tmpl = date_pick(SALE_TEMPLATES, salt="sale_tmpl")
        return tmpl.format(
            title=title, actress=actress,
            campaign=f"🎉 {camp_title}\n",
            url=SITE_URL,
        )
    else:
        date_line = (f"\n📅 発売：{date_str}") if date_str else ""
        tmpl = date_pick(NEW_TEMPLATES, salt="new_tmpl")
        return tmpl.format(
            title=title, actress=actress,
            date_line=date_line,
            url=SITE_URL,
        )


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
    now_jst    = datetime.now(JST)
    print(f"[INFO] Tweet type: {tweet_type}  ({now_jst.strftime('%Y-%m-%d %H:%M JST')})")

    builders = {
        "rank":    build_rank_tweet,
        "actress": build_actress_tweet,
        "new":     build_new_tweet,
    }
    builder = builders.get(tweet_type, build_rank_tweet)
    text    = builder()

    if not text:
        print("[ERROR] Could not build tweet content. Data file may be missing.")
        sys.exit(1)

    # Twitter はURLを23文字換算、安全側で260文字でカット
    if len(text) > 260:
        text = text[:257] + "..."

    print(f"[INFO] Tweet ({len(text)} chars):\n{'─'*40}\n{text}\n{'─'*40}")

    if os.environ.get("DRY_RUN", "").lower() == "true":
        print("[DRY RUN] Skipping actual post.")
        return

    client   = get_client()
    response = client.create_tweet(text=text)
    tweet_id = response.data["id"]
    print(f"[OK] Posted! https://twitter.com/i/web/status/{tweet_id}")


if __name__ == "__main__":
    main()
