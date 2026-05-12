#!/usr/bin/env python3
"""FANZA ランキング自動ツイートスクリプト

投稿タイプ:
  rank    - ランキング作品   (08:00 JST) ← 上位20件から毎回ローテーション
  actress - 人気女優TOP5    (12:00 JST)
  manga   - マンガランキング (15:00 JST) ← ランキング/新着/人気を自動切替
  new     - 新着・セール作品 (21:00 JST) ← 毎回違う作品をローテーション

ポイント:
  - 日時(年月日時)のSHA256シードで「毎回違う作品・毎回違う文体」を自動選択
  - 大人向けの含みある煽り文体で続きが気になるコピーに統一
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

JST      = timezone(timedelta(hours=9))
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


# ===== 時刻シードによる毎回異なる選択 =====
# 年月日+時まで含めるので、1日4回投稿しても毎回違う結果になる

def now_pick(items, salt=""):
    """投稿ごとに異なるアイテムを選ぶ（日時+saltをシードに使用）"""
    now_str = datetime.now(JST).strftime("%Y-%m-%d-%H") + "|" + salt
    seed    = int(hashlib.sha256(now_str.encode()).hexdigest()[:8], 16)
    return random.Random(seed).choice(items)


# ===== Twitterクライアント =====

def get_client():
    required = [
        "TWITTER_API_KEY", "TWITTER_API_SECRET",
        "TWITTER_ACCESS_TOKEN", "TWITTER_ACCESS_TOKEN_SECRET",
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


# ============================================================
#  テンプレート集 — 動画ランキング
# ============================================================

RANK_TEMPLATES = [
    """\
🔥 今日みんなが一番観てる作品がこれ

「{title}」{actress}

なぜ1位なのかはサンプルを観れば秒でわかる👀
イヤホン推奨です🎧

▼ 無料サンプルを今すぐ再生
{url}

#FANZA #AV動画 #ランキング""",

    """\
👀 これ知らないのはもったいない

「{title}」{actress}

観始めたら最後まで止まれない仕上がり🔞
深夜に観るやつです…

▼ サンプル動画・詳細はこちら
{url}

#FANZA #AV動画 #ランキング""",

    """\
😮 ランキング1位、見た？

「{title}」{actress}

家族には見せられないけど全力でおすすめする作品🔥{price}
▼ 無料サンプルでまず確認
{url}

#FANZA #AV動画 #ランキング""",

    """\
💥 これが今日の最注目作品

「{title}」{actress}

「思ってたより全然すごかった」と話題沸騰中🌊
音量注意で観てみて🎧

▼ 今すぐチェック
{url}

#FANZA #ランキング #AV動画""",

    """\
🎬 正直、これは予想外だった

「{title}」{actress}

観た人全員が「続きが気になる」と言ってる🔞
夜中に観ると後悔する（いい意味で）

▼ 無料サンプルを再生する
{url}

#FANZA #AV動画 #ランキング""",

    """\
⚡ 今日のFANZA、これを観ないと損

「{title}」{actress}

サンプルだけで鼓動が速くなる系です…😳
気になってるなら今すぐ確認して{price}
▼ 詳細・無料サンプルはこちら
{url}

#FANZA #AV動画 #ランキング""",
]


# ============================================================
#  テンプレート集 — 女優
# ============================================================

ACTRESS_TEMPLATES = [
    """\
👑 今SNSで話題の人気女優ランキング

{ranking}

この中で一番気になるのは誰？🔥
コメントで教えて！

▼ 出演作品・無料サンプルはこちら
{url}

#FANZA #人気女優 #AV #ランキング""",

    """\
💥 今週チェックすべき女優TOP5がこれ

{ranking}

どの作品も完成度が高すぎて選べない問題🔞
まずサンプルで確認してみて

▼ 全員の最新作はこちら
{url}

#FANZA #人気女優 #AV #ランキング""",

    """\
🌸 今1番アツい女優はこの5人

{ranking}

あなたの推しは入ってる？❤️
気になる作品はサンプル動画で無料確認できます

▼ 作品一覧・無料サンプルはこちら
{url}

#FANZA #人気女優 #ランキング #AV""",

    """\
😍 要チェック！人気女優ランキングTOP5

{ranking}

今週このランキングが話題になってます👀
イヤホンして観てみて🎧

▼ 最新作・サンプル動画はこちら
{url}

#FANZA #人気女優 #AV #ランキング""",

    """\
🔥 正直に言う。この5人は全員ヤバい

{ranking}

それぞれの作品、サンプルだけでも鼓動が速くなる😳
あなたが気になるのはどの人？

▼ 全員の最新作・無料サンプルはこちら
{url}

#FANZA #人気女優 #AV #ランキング""",
]


# ============================================================
#  テンプレート集 — 新着
# ============================================================

NEW_TEMPLATES = [
    """\
🆕 これ発掘した？こっそり人気急上昇中

「{title}」{actress}

サンプルが話題になってます…🔞
気になる人は早めにチェックして✅{date_line}
▼ 無料サンプル動画はこちら
{url}

#FANZA #新着 #AV動画""",

    """\
🎬 発見した？今話題の新着がこれ

「{title}」{actress}

最後まで目が離せないと評判🔥
観た人が口を揃えて「期待以上」と言ってる{date_line}
▼ サンプル動画・詳細はこちら
{url}

#FANZA #新着 #AV動画""",

    """\
😮 これ、知らなかった？

「{title}」{actress}

見た人みんなリピートしてるらしい…😳{date_line}
まずはサンプルで確認してみて🎧

▼ 無料サンプルはこちら
{url}

#FANZA #新着 #AV動画""",

    """\
💫 新着の中でこれが断トツでヤバい

「{title}」{actress}

「なんでもっと早く知らなかったんだ」ってなるやつ🔥{date_line}
▼ サンプル動画・詳細はこちら
{url}

#FANZA #新着 #AV動画""",

    """\
⚡ 正直これは当たりだった

「{title}」{actress}

サンプル観た瞬間に全部観たくなる系です🎬🔞{date_line}
▼ 詳細・無料サンプルはこちら
{url}

#FANZA #新着 #AV動画""",
]


# ============================================================
#  テンプレート集 — セール
# ============================================================

SALE_TEMPLATES = [
    """\
🔥 今だけ！これセール中なの知ってた？

「{title}」{actress}

{campaign}終わったら元値に戻るから今が狙い目👀
サンプルで確認してから後悔なし🎧

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
💥 この価格はバグってるかと思った

「{title}」{actress}

{campaign}鼓動が速くなる作品がこの値段で観れるのは今だけ⚡
気になってた人は今がチャンス🔞

▼ セール詳細・サンプルはこちら
{url}

#FANZA #セール #AV動画""",

    """\
😳 これ、家族には内緒でチェックして

「{title}」{actress}

{campaign}こっそりセールになってたやつ🔥
イヤホン必須で観てみて🎧

▼ セール中・詳細はこちら
{url}

#FANZA #セール #AV動画""",
]


# ============================================================
#  テンプレート集 — マンガ
# ============================================================

MANGA_RANK_TEMPLATES = [
    """\
📚 今日みんなが読んでるマンガがこれ

「{title}」{author}

読み始めたら絶対に止まれないやつ🔥
深夜に読むと後悔する（いい意味で）🌙

▼ 試し読み・詳細はこちら
{url}

#FANZA #マンガ #電子書籍 #ランキング""",

    """\
🔞 これ、夜中に読むやつです

「{title}」{author}

なぜ1位なのか読み始めた瞬間にわかる👀
イヤホン推奨です🎧

▼ 試し読みはこちら
{url}

#FANZA #マンガ #電子書籍 #ランキング""",

    """\
💥 FANZAマンガランキング1位がヤバい

「{title}」{author}

読んだ人全員が「続きが気になって眠れない」と言ってる🌊
家族には見せられないけど全力でおすすめ

▼ 試し読み・詳細はこちら
{url}

#FANZA #マンガ #電子書籍 #ランキング""",

    """\
😳 これを知らないのはもったいない

「{title}」{author}

読み始めたら最後まで止まれない仕上がり🔞
深夜に読んだら後悔するやつです

▼ 試し読みで確認
{url}

#FANZA #マンガ #電子書籍 #ランキング""",
]

MANGA_NEW_TEMPLATES = [
    """\
🆕 これ発掘した？マンガで今話題の新作

「{title}」{author}

読んだ人が「予想外の展開だった」と続々報告中🔥{date_line}
▼ 試し読み・詳細はこちら
{url}

#FANZA #マンガ #新着 #電子書籍""",

    """\
📖 新着マンガの中でこれがダントツでヤバい

「{title}」{author}

「なんでもっと早く知らなかった」ってなるやつ😳{date_line}
▼ 試し読みはこちら
{url}

#FANZA #マンガ #新着 #電子書籍""",

    """\
🌙 深夜に読むなら絶対これ

「{title}」{author}

読み始めたら止まれない新着マンガ🔞{date_line}
気になる人は試し読みで確認して

▼ 詳細・試し読みはこちら
{url}

#FANZA #マンガ #新着 #電子書籍""",
]


# ============================================================
#  ツイート生成関数
# ============================================================

def build_rank_tweet():
    """🏆 ランキング作品 — 上位20件から毎回ローテーション"""
    data = load_json("data/rank.json")
    if not data:
        return None
    items = data["result"].get("items", [])
    if not items:
        return None

    pool    = items[:min(20, len(items))]
    item    = now_pick(pool, salt="rank_item")

    title   = item.get("title", "")[:28]
    names   = [a["name"] for a in (item.get("iteminfo") or {}).get("actress", [])[:2]]
    actress = ("\n出演：" + "・".join(names)) if names else ""
    price   = (item.get("prices") or {}).get("price", "")
    price_s = (f"\n💰 ¥{price}〜\n") if price else "\n"

    tmpl = now_pick(RANK_TEMPLATES, salt="rank_tmpl")
    return tmpl.format(title=title, actress=actress, price=price_s, url=SITE_URL)


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

    tmpl = now_pick(ACTRESS_TEMPLATES, salt="actress_tmpl")
    return tmpl.format(ranking=ranking, url=SITE_URL)


def build_new_tweet():
    """🆕 新着 or 🔥 セール作品 — 毎回違う作品をローテーション"""
    data = load_json("data/new.json")
    if not data:
        return None
    items = data["result"].get("items", [])
    if not items:
        return None

    sale_items = [i for i in items if i.get("campaign")]
    is_sale    = bool(sale_items)
    pool       = sale_items if is_sale else items

    item    = now_pick(pool[:min(30, len(pool))], salt="new_item")

    title   = item.get("title", "")[:28]
    names   = [a["name"] for a in (item.get("iteminfo") or {}).get("actress", [])[:2]]
    actress = ("\n出演：" + "・".join(names)) if names else ""
    campaign = item.get("campaign") or {}
    date_str = (item.get("date") or "")[:10]

    if is_sale:
        camp_line = f"🎉 {campaign.get('title', 'セール開催中！')}\n"
        tmpl = now_pick(SALE_TEMPLATES, salt="sale_tmpl")
        return tmpl.format(title=title, actress=actress, campaign=camp_line, url=SITE_URL)
    else:
        date_line = (f"\n📅 発売：{date_str}") if date_str else ""
        tmpl = now_pick(NEW_TEMPLATES, salt="new_tmpl")
        return tmpl.format(title=title, actress=actress, date_line=date_line, url=SITE_URL)


def build_manga_tweet():
    """📚 マンガ — ランキング/新着を自動切替、毎回違う作品"""
    data_rank = load_json("data/manga.json")
    data_new  = load_json("data/new.json")  # new.jsonにもbook floor作品が混じる場合あり

    # manga.jsonを優先使用
    if data_rank:
        items_rank = data_rank["result"].get("items", [])
    else:
        items_rank = []

    # 投稿時刻の時間帯でランキング/新着を切替（偶数時=ランキング、奇数時=新着）
    hour_jst = datetime.now(JST).hour
    use_new  = (hour_jst % 2 == 1) and len(items_rank) > 0

    if use_new and items_rank:
        # 新着寄りの作品（後半から）
        pool = items_rank[len(items_rank)//2:]
        if not pool:
            pool = items_rank
        item = now_pick(pool, salt="manga_new_item")

        title   = item.get("title", "")[:28]
        authors = [a["name"] for a in (item.get("iteminfo") or {}).get("author", [])[:1]]
        author  = ("\n著者：" + "・".join(authors)) if authors else ""
        date_str = (item.get("date") or "")[:10]
        date_line = (f"\n📅 発売：{date_str}") if date_str else ""

        tmpl = now_pick(MANGA_NEW_TEMPLATES, salt="manga_new_tmpl")
        return tmpl.format(title=title, author=author, date_line=date_line, url=SITE_URL)

    elif items_rank:
        # ランキング上位から選択
        pool = items_rank[:min(20, len(items_rank))]
        item = now_pick(pool, salt="manga_rank_item")

        title   = item.get("title", "")[:28]
        authors = [a["name"] for a in (item.get("iteminfo") or {}).get("author", [])[:1]]
        author  = ("\n著者：" + "・".join(authors)) if authors else ""

        tmpl = now_pick(MANGA_RANK_TEMPLATES, salt="manga_rank_tmpl")
        return tmpl.format(title=title, author=author, url=SITE_URL)

    else:
        print("[WARN] manga.json not found or empty, skipping manga tweet")
        return None


# ============================================================
#  投稿タイプ自動判定
# ============================================================

def detect_type_by_hour():
    hour_utc = datetime.now(timezone.utc).hour
    # 23 UTC = 08 JST → rank
    # 03 UTC = 12 JST → actress
    # 06 UTC = 15 JST → manga
    # 12 UTC = 21 JST → new
    if hour_utc == 23:
        return "rank"
    elif hour_utc == 3:
        return "actress"
    elif hour_utc == 6:
        return "manga"
    else:
        return "new"


# ============================================================
#  メイン
# ============================================================

def main():
    tweet_type = os.environ.get("TWEET_TYPE", "").strip() or detect_type_by_hour()
    now_jst    = datetime.now(JST)
    print(f"[INFO] Tweet type: {tweet_type}  ({now_jst.strftime('%Y-%m-%d %H:%M JST')})")

    builders = {
        "rank":    build_rank_tweet,
        "actress": build_actress_tweet,
        "new":     build_new_tweet,
        "manga":   build_manga_tweet,
    }
    text = builders.get(tweet_type, build_rank_tweet)()

    if not text:
        print("[ERROR] Could not build tweet content. Data file may be missing.")
        sys.exit(1)

    # URLは23文字換算。安全側で260文字でカット
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
