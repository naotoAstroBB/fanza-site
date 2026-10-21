#!/usr/bin/env python3
"""Build crawlable, factual actress links from the existing local FANZA JSON.

The resulting navigation complements (and never replaces) the JavaScript UI.
Only basic names and IDs already present in the project's dataset are used.
"""
from __future__ import annotations

import html
import json
from pathlib import Path
from urllib.parse import urlencode

START = "<!-- SEO_ACTRESS_LINKS_START -->"
END = "<!-- SEO_ACTRESS_LINKS_END -->"
DATA = Path("data/actress_popular.json")


def render_nav() -> str:
    profiles = json.loads(DATA.read_text(encoding="utf-8")).get("result", {}).get("actress", [])
    links: list[str] = []
    seen: set[str] = set()
    for actress in profiles:
        aid = str(actress.get("id", ""))
        name = str(actress.get("name", "")).strip()
        if not aid.isdecimal() or not name or aid in seen:
            continue
        seen.add(aid)
        href = "actress.html?" + urlencode({"id": aid, "name": name})
        links.append(
            f'      <a href="{html.escape(href, quote=True)}" '
            'style="display:inline-block;padding:8px 12px;border:1px solid var(--border);'
            'border-radius:20px;color:var(--text);text-decoration:none">'
            f'{html.escape(name)}</a>'
        )
        if len(links) == 12:
            break
    if not links:
        raise RuntimeError("No usable profiles; refusing to overwrite navigation")
    return "\n".join([
        START,
        '<section aria-labelledby="seoActressHeading" style="margin:28px 0 18px">',
        '  <h2 id="seoActressHeading" style="font-size:1.05rem;margin:0 0 10px">人気作品の出演者を探す</h2>',
        '  <p style="font-size:.85rem;color:var(--mute);margin:0 0 12px">出演者別のプロフィール・関連作品ページへ移動できます。</p>',
        '  <nav aria-label="人気作品の出演者" style="display:flex;flex-wrap:wrap;gap:8px">',
        *links,
        '  </nav>',
        '</section>',
        END,
    ])


def update_file(path: Path, marker: str, block: str) -> None:
    existing = path.read_text(encoding="utf-8-sig")
    if START in existing or END in existing:
        if existing.count(START) != 1 or existing.count(END) != 1:
            raise RuntimeError(f"Malformed SEO markers: {path}")
        before, rest = existing.split(START, 1)
        _, after = rest.split(END, 1)
        updated = before + block + after
    else:
        if existing.count(marker) != 1:
            raise RuntimeError(f"Expected unique insertion point: {path}")
        updated = existing.replace(marker, marker + "\n" + block)
    if updated != existing:
        path.write_text(updated, encoding="utf-8")
        print(f"Updated {path}")


def main() -> None:
    block = render_nav()
    update_file(Path("home.html"), '    <div class="pagination" id="pagination"></div>', block)
    update_file(Path("actresses.html"), '  <div id="actressFullList">\n    <div class="loading"><div class="spinner"></div><p>読み込み中...</p></div>\n  </div>', block)


if __name__ == "__main__":
    main()
