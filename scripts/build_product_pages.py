#!/usr/bin/env python3
"""Publish a small, high-quality, crawler-readable catalogue from local FANZA data.

This job is additive: existing product.html and JS storefront remain untouched.
The generated /works/ directory contains only selected products and can be
rebuilt deterministically. Fail before writing if the source dataset is invalid.
"""
from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "works"
SITEMAP = ROOT / "sitemap.xml"
HOME = ROOT / "home.html"
BASE = "https://douga-adult.com"
START = "<!-- SEO_WORKS_START -->"
END = "<!-- SEO_WORKS_END -->"
LIMIT = min(max(int(os.environ.get("SEO_WORKS_LIMIT", "48")), 8), 100)
SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]{3,96}$")
ALLOWED_AFFILIATE_HOSTS = ("dmm.com", "dmm.co.jp", "fanza.com", "fanza.jp", "fanza.co.jp")


def esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def safe_url(value: object, affiliate: bool = False) -> str:
    value = str(value or "").strip()
    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or not host:
            return ""
        if affiliate and not any(host == domain or host.endswith("." + domain) for domain in ALLOWED_AFFILIATE_HOSTS):
            return ""
        return value
    except ValueError:
        return ""


def products(path: Path) -> list[dict]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    items = payload.get("result", {}).get("items", [])
    if not isinstance(items, list):
        raise ValueError(f"Invalid item list: {path}")
    return [item for item in items if isinstance(item, dict)]


def short(value: object, limit: int = 180) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def item_id(item: dict) -> str:
    cid = str(item.get("content_id") or "")
    return cid if SAFE_ID.fullmatch(cid) else ""


def pick() -> list[dict]:
    ranked = products(DATA / "rank.json")
    if len(ranked) < 48:
        raise ValueError("rank.json missing/too small: refusing to replace generated catalogue")
    seen = set()
    chosen = []
    for item in ranked:
        cid = item_id(item)
        title = short(item.get("title"))
        affiliate = safe_url(item.get("affiliateURL"), affiliate=True)
        if not cid or not title or not affiliate or cid in seen:
            continue
        seen.add(cid)
        chosen.append(item)
        if len(chosen) >= LIMIT:
            break
    if len(chosen) < 8:
        raise ValueError("Not enough valid, linkable products; refusing output")
    return chosen


def actresses(item: dict) -> list[tuple[str, str]]:
    people = (item.get("iteminfo") or {}).get("actress") or []
    result = []
    if not isinstance(people, list):
        return result
    for person in people[:8]:
        if not isinstance(person, dict):
            continue
        name = short(person.get("name"), 70)
        aid = str(person.get("id") or "")
        if name and aid.isdecimal():
            result.append((aid, name))
    return result


def render(item: dict, neighbors: list[dict], updated: str) -> str:
    cid = item_id(item)
    title = short(item["title"], 220)
    href = BASE + "/works/" + quote(cid) + ".html"
    img = safe_url((item.get("imageURL") or {}).get("large") or (item.get("imageURL") or {}).get("small"))
    affiliate = safe_url(item["affiliateURL"], affiliate=True)
    release = short(item.get("date"), 30)
    maker = ((item.get("iteminfo") or {}).get("maker") or [])
    makers = ", ".join(short(a.get("name"), 60) for a in maker[:4] if isinstance(a, dict))
    actors = actresses(item)
    description = short(f"{title}。FANZA掲載作品の作品情報、出演者、発売日、関連作品、公式配信ページを確認。", 150)
    actor_html = ("、".join(f'<a href="../actress.html?id={quote(aid)}&amp;name={quote(name)}">{esc(name)}</a>' for aid, name in actors) if actors else "公式商品ページでご確認ください")
    details = []
    for label, val in (("作品番号", cid), ("発売日", release), ("メーカー", makers)):
        if val:
            details.append(f'<div><dt>{esc(label)}</dt><dd>{esc(val)}</dd></div>')
    image_html = (f'<img src="{esc(img)}" alt="{esc(title)}の公式掲載画像" loading="lazy" width="320" decoding="async">' if img else "")
    related = "".join(f'<li><a href="{quote(item_id(x))}.html">{esc(short(x["title"], 85))}</a></li>' for x in neighbors if item_id(x) != cid)
    schema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "ホーム", "item": BASE + "/home.html"},
            {"@type": "ListItem", "position": 2, "name": "作品一覧", "item": BASE + "/works/index.html"},
            {"@type": "ListItem", "position": 3, "name": title, "item": href},
        ],
    }
    json_ld = json.dumps(schema, ensure_ascii=False).replace("<", "\\u003c")
    dynamic = "../product.html?cid=" + quote(cid) + "&floor=videoa"
    return f"""<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="rating" content="adult">
<title>{esc(title)}（{esc(cid)}）｜作品情報・出演者｜AV動画ランキング</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(href)}">
<meta property="og:type" content="article"><meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{esc(href)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<script type="application/ld+json">{json_ld}</script>
<link rel="stylesheet" href="../css/style.css"><link rel="stylesheet" href="../css/seo-works.css">
</head><body>
<header class="site-header"><div class="header-inner"><div class="site-logo"><a href="../home.html">AV動画ランキング</a></div></div></header>
<main class="seo-container">
<nav aria-label="パンくず"><a href="../home.html">ホーム</a> › <a href="index.html">作品一覧</a> › {esc(cid)}</nav>
<h1>{esc(title)}</h1>
<p class="seo-muted">作品番号：{esc(cid)}　|　データ更新：{esc(updated)}（UTC）</p>
<div class="seo-detail"><div>{image_html}</div><div><h2>作品の基本情報</h2>
<dl class="seo-details">{"".join(details)}</dl>
<p>出演者：{actor_html}</p>
<a class="seo-buy" href="{esc(affiliate)}" target="_blank" rel="sponsored noopener noreferrer">FANZA公式で詳細・最新価格を確認</a>
<a class="seo-secondary" href="{esc(dynamic)}">サイト内の詳しい商品情報・サンプルを見る</a>
<p class="seo-muted">配信条件、価格、在庫、サンプルの有無はFANZA公式の最新情報が優先されます。</p>
</div></div>
<section><h2>関連する掲載作品</h2><ul class="seo-related">{related}</ul></section>
<section><h2>購入前に確認したいこと</h2><p>商品番号や出演者、配信形式、利用条件を確認しましょう。<a href="../guide.html">作品の探し方・購入前の確認事項</a>も参考にできます。</p></section>
</main><footer class="site-footer"><p>当サイトはFANZA（DMM.com）のアフィリエイトプログラムを利用しています。18歳未満（高校生を含む）の方は利用できません。</p><a href="../disclaimer.html">免責事項</a></footer>
<div class="seo-age-overlay" id="ageLayer" hidden role="dialog" aria-modal="true" aria-labelledby="ageTitle">
<div class="seo-age-card"><h2 id="ageTitle">年齢確認</h2><p>このサイトは成人向け情報を含みます。18歳以上（高校生不可）ですか？</p>
<button id="ageYes" type="button">18歳以上です</button>
<a href="https://www.google.co.jp/" rel="nofollow">18歳未満・退出する</a></div></div>
<script src="../js/seo-works.js" defer></script>
</body></html>
"""


def render_index(items: list[dict], updated: str) -> str:
    cards = []
    for item in items:
        cid = item_id(item)
        title = short(item["title"], 140)
        image = safe_url((item.get("imageURL") or {}).get("small"))
        thumb = f'<img src="{esc(image)}" alt="" loading="lazy" width="160">' if image else ""
        cards.append(f'<li><a href="{quote(cid)}.html">{thumb}<span>{esc(title)}</span></a></li>')
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="rating" content="adult">
<title>FANZA作品一覧｜作品番号・出演者から探す｜AV動画ランキング</title>
<meta name="description" content="FANZAの掲載作品を、商品番号・出演者・発売情報から探せる作品一覧。公式商品情報へのリンク付き。">
<link rel="canonical" href="{BASE}/works/index.html">
<link rel="stylesheet" href="../css/style.css"><link rel="stylesheet" href="../css/seo-works.css">
</head><body>
<header class="site-header"><div class="header-inner"><div class="site-logo"><a href="../home.html">AV動画ランキング</a></div></div></header>
<main class="seo-container"><nav aria-label="パンくず"><a href="../home.html">ホーム</a> › 作品一覧</nav>
<h1>FANZA掲載作品一覧</h1><p>作品番号やタイトルを確認して、詳細ページへ進めます。掲載順は取得元のランキングデータによります。順位は作品の品質を保証するものではありません。</p>
<p class="seo-muted">データ更新：{esc(updated)}（UTC）</p>
<ul class="seo-grid">{"".join(cards)}</ul>
<p><a href="../guide.html">作品の探し方を見る</a>　<a href="../actresses.html">出演者から探す</a></p>
</main><footer class="site-footer"><p>FANZA（DMM.com）アフィリエイトプログラムを利用しています。</p></footer>
<div class="seo-age-overlay" id="ageLayer" hidden role="dialog" aria-modal="true" aria-labelledby="ageTitle"><div class="seo-age-card">
<h2 id="ageTitle">年齢確認</h2><p>このサイトは成人向け情報を含みます。18歳以上（高校生不可）ですか？</p>
<button id="ageYes" type="button">18歳以上です</button><a href="https://www.google.co.jp/" rel="nofollow">18歳未満・退出する</a></div></div>
<script src="../js/seo-works.js" defer></script></body></html>"""


def write_changed(path: Path, content: str) -> None:
    if not path.exists() or path.read_text(encoding="utf-8") != content:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def sitemap(urls: list[str]) -> None:
    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", ns)
    tree = ET.parse(SITEMAP)
    root = tree.getroot()
    for child in list(root):
        loc = child.find(f"{{{ns}}}loc")
        if loc is not None and loc.text and loc.text.startswith(BASE + "/works/"):
            root.remove(child)
    for url in urls:
        node = ET.SubElement(root, f"{{{ns}}}url")
        ET.SubElement(node, f"{{{ns}}}loc").text = url
    payload = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"
    write_changed(SITEMAP, payload)


def main() -> None:
    selected = pick()
    OUT.mkdir(parents=True, exist_ok=True)
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    urls = [BASE + "/works/index.html"]
    expected = {"index.html"}
    for i, item in enumerate(selected):
        cid = item_id(item)
        filename = cid + ".html"
        expected.add(filename)
        neighbors = [selected[j] for j in range(max(0, i-2), min(len(selected), i+4)) if j != i][:4]
        write_changed(OUT / filename, render(item, neighbors, updated))
        urls.append(BASE + "/works/" + quote(filename))
    write_changed(OUT / "index.html", render_index(selected, updated))
    for old in OUT.glob("*.html"):
        if old.name not in expected:
            old.unlink()
    sitemap(urls)
    page = HOME.read_text(encoding="utf-8-sig")
    block = "\n".join([
        START,
        '<section aria-labelledby="seoWorksHeading" style="margin:26px 0;padding:16px;border:1px solid var(--border);border-radius:12px">',
        '<h2 id="seoWorksHeading" style="font-size:1.1rem;margin:0 0 10px">FANZA掲載作品を作品番号から探す</h2>',
        '<p style="color:var(--mute);font-size:.9rem">公式データを基に作品番号・出演者などの基本情報を確認できます。</p>',
        '<p><a href="works/index.html" style="color:var(--accent2)">作品一覧を見る →</a></p>',
        '</section>',
        END,
    ])
    if START in page and END in page:
        begin, rest = page.split(START, 1)
        _, after = rest.split(END, 1)
        page = begin + block + after
    else:
        marker = '    <div class="pagination" id="pagination"></div>'
        if page.count(marker) != 1:
            raise RuntimeError("home.html injection anchor missing; refusing home update")
        page = page.replace(marker, marker + "\n" + block)
    write_changed(HOME, page)
    print(f"Created {len(selected)} indexed product pages and catalogue")


if __name__ == "__main__":
    main()
