#!/usr/bin/env python3
"""Search Console indexability regression checks for the real static site."""
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
INDEXABLE = ["home.html", "product.html", "actress.html", "actresses.html"]
for filename in INDEXABLE:
    html = (ROOT / filename).read_text(encoding="utf-8-sig")
    assert 'js/age-gate.js?v=20261117' in html, filename
    assert 'css/age-gate.css?v=20261117' in html, filename
    assert "location.replace('index.html?next='" not in html, filename
    assert 'name="robots" content="noindex' not in html.lower(), filename
    assert 'name="rating" content="adult"' in html.lower(), filename
    assert "<title>" in html and "<main" in html, filename

app = (ROOT / "js/app.js").read_text(encoding="utf-8")
assert "location.replace('index.html?next='" not in app
age_script = (ROOT / "js/age-gate.js").read_text(encoding="utf-8")
assert "location.replace" not in age_script and "navigator.userAgent" not in age_script
assert "age_verified" in age_script and "aria-modal" in age_script
home = (ROOT / "home.html").read_text(encoding="utf-8")
assert 'js/app.js?v=20261117-discovery' in home
index = (ROOT / "index.html").read_text(encoding="utf-8-sig")
assert 'name="robots" content="noindex,follow"' in index, "Age-only landing must stay noindex"
robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
assert "Disallow: /" not in [line.strip() for line in robots.splitlines()], "Critical paths must remain crawlable"
urls = [item.text for item in ET.parse(ROOT / "sitemap.xml").getroot()
        .findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url/"
                 "{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
assert len(urls) == len(set(urls)) and len(urls) >= 4, "Sitemap URLs invalid"
assert "https://douga-adult.com/home.html" in urls
assert "https://douga-adult.com/actresses.html" in urls
assert "https://douga-adult.com/index.html" not in urls and "https://douga-adult.com/xpost.html" not in urls
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
assert "fanza-v41-discovery-20261117" in sw
print("SEO safeguards passed: no forced redirects, age verification maintained, sitemap and cache valid")
