#!/usr/bin/env python3
"""Fast static contract tests for the product-first homepage structure."""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
home = (ROOT / "home.html").read_text(encoding="utf-8-sig")
styles = (ROOT / "css/home-redesign.css").read_text(encoding="utf-8")

class Auditor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = Counter()
        self.tags = Counter()
        self.links = []
        self.scripts = []
        self.buttons = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        self.tags[tag] += 1
        if values.get("id"):
            self.ids[values["id"]] += 1
        if tag == "link" and values.get("rel") == "stylesheet":
            self.links.append(values.get("href", ""))
        if tag == "script" and values.get("src"):
            self.scripts.append(values["src"])
        if tag == "button":
            self.buttons.append(values)

parser = Auditor()
parser.feed(home)
required = [
    "searchInput", "suggestDropdown", "favPanel", "favBadge",
    "heroMain", "heroTitle", "heroBtn", "heroSubGrid",
    "catalogue", "sectionTitle", "rankTabs", "productGrid", "pagination",
    "sortSelect", "actressList", "genreDrawer", "genreOverlay",
]
for element in required:
    assert parser.ids[element] == 1, f"Expected one #{element}, found {parser.ids[element]}"
assert all(v == 1 for v in parser.ids.values()), "Duplicate IDs in homepage"
assert "css/home-redesign.css" in parser.links
assert "js/app.js" in parser.scripts and "js/dmm-api.js" in parser.scripts
assert home.index('id="catalogue"') < home.index('id="actressList"')
assert home.index('id="heroMain"') < home.index('id="catalogue"')
assert "seo-guide-intro" not in home, "Oversized SEO copy should not be above content"
assert 'class="explore-rail"' in home
for category in ("videoa", "anime", "book", "goods"):
    assert f'data-floor="{category}"' in home
assert home.count("SEO_ACTRESS_LINKS_START") == home.count("SEO_ACTRESS_LINKS_END") == 1
for onclick in ("App.doSearch()", "App.openGenreDrawer()", "App.setSale("):
    assert onclick in home, onclick
assert "@media(max-width:768px)" in styles
assert ".home-redesign .product-grid" in styles
assert ".home-redesign .site-search-button" in styles
assert "button" in parser.tags and "main" in parser.tags and "nav" in parser.tags
print("Homepage structure verified: dynamic hooks, mobile navigation, product-first flow and SEO markers are intact.")
