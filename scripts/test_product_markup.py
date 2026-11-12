#!/usr/bin/env python3
"""Check detail-page DOM hooks, product actions and embedded JavaScript syntax."""
from html.parser import HTMLParser
from collections import Counter
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "product.html").read_text(encoding="utf-8-sig")
css = (ROOT / "css/product-redesign.css").read_text(encoding="utf-8")

class ProductParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = Counter()
        self.links = []
        self.scripts = []
        self.inline = []
        self.active_script = None

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids[d["id"]] += 1
        if tag == "link" and d.get("rel") == "stylesheet":
            self.links.append(d.get("href"))
        if tag == "script":
            if d.get("src"): self.scripts.append(d["src"])
            self.active_script = [] if not d.get("src") else None

    def handle_data(self, data):
        if self.active_script is not None:
            self.active_script.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.active_script is not None:
            self.inline.append("".join(self.active_script))
            self.active_script = None

p = ProductParser()
p.feed(html)
for name in ("searchInput", "content", "breadTitle", "mobileOfficialBtn", "mobilePurchaseBar",
             "canonicalUrl", "ogTitle", "floorLink"):
    assert p.ids[name] == 1, f"Missing or duplicate {name}: {p.ids[name]}"
assert len(p.ids) == len(set(p.ids)), "Duplicate IDs"
assert "css/product-redesign.css" in p.links
assert "js/dmm-api.js" in p.scripts and "js/storage.js" in p.scripts
assert 'class="detail-redesign"' in html
assert '<h1 class="detail-title">' in html and html.count('<h1 class="detail-title">') == 1
assert "detail-price-unavailable" in html
assert "bsky.app/intent/compose?text=" in html
assert 'rel="sponsored noopener noreferrer"' in html
assert "async function loadProduct()" in html
assert "loadRelated(item, floor)" in html
assert "@media(max-width:760px)" in css

for idx, script in enumerate(p.inline):
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", encoding="utf-8", delete=False) as temp:
        temp.write(script)
        name = temp.name
    try:
        proc = subprocess.run(["node", "--check", name], capture_output=True, text=True)
        assert proc.returncode == 0, f"Inline JS #{idx} syntax invalid: {proc.stderr}"
    finally:
        Path(name).unlink(missing_ok=True)
print(f"Detail page structure, external assets and {len(p.inline)} inline scripts verified")
