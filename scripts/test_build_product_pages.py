#!/usr/bin/env python3
"""Fast, fully offline smoke tests for the static-page generator."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_product_pages as gen


class GeneratorTests(unittest.TestCase):
    def test_security_and_html(self):
        self.assertEqual(gen.safe_url("javascript:alert(1)"), "")
        self.assertEqual(gen.safe_url("https://bad.example/fanza", affiliate=True), "")
        self.assertEqual(gen.safe_url("https://al.dmm.co.jp/?lurl=abc", affiliate=True), "https://al.dmm.co.jp/?lurl=abc")
        self.assertEqual(gen.esc('<script>'), "&lt;script&gt;")
        self.assertEqual(gen.item_id({"content_id": "../foo"}), "")

    def test_generation_preserves_existing_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = root / "data"
            data.mkdir()
            source = [
                {
                    "content_id": f"example{i:05d}",
                    "title": f"テスト作品 {i}",
                    "affiliateURL": "https://al.dmm.co.jp/?lurl=sample",
                    "imageURL": {"large": "https://pics.dmm.co.jp/test.jpg"},
                    "iteminfo": {"actress": [{"id": "123", "name": "出演者A"}]},
                }
                for i in range(60)
            ]
            (data / "rank.json").write_text(json.dumps({"result": {"items": source}}, ensure_ascii=False), encoding="utf-8")
            (root / "home.html").write_text(
                '<main><div class="pagination" id="pagination"></div></main>', encoding="utf-8"
            )
            (root / "sitemap.xml").write_text(
                '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                '<url><loc>https://douga-adult.com/home.html</loc></url></urlset>',
                encoding="utf-8",
            )
            original = gen.ROOT, gen.DATA, gen.OUT, gen.SITEMAP, gen.HOME, gen.LIMIT
            try:
                gen.ROOT, gen.DATA, gen.OUT = root, data, root / "works"
                gen.SITEMAP, gen.HOME, gen.LIMIT = root / "sitemap.xml", root / "home.html", 8
                gen.main()
                page = (root / "works/example00000.html").read_text(encoding="utf-8")
                self.assertIn('rel="canonical"', page)
                self.assertIn('href="https://al.dmm.co.jp/', page)
                self.assertIn("年齢確認", page)
                self.assertIn("テスト作品", page)
                self.assertIn("home.html", (root / "sitemap.xml").read_text(encoding="utf-8"))
                self.assertEqual(len(list((root / "works").glob("*.html"))), 9)
                self.assertEqual((root / "home.html").read_text(encoding="utf-8").count(gen.START), 1)
                gen.main()  # rerun must not duplicate navigation
                self.assertEqual((root / "home.html").read_text(encoding="utf-8").count(gen.START), 1)
            finally:
                gen.ROOT, gen.DATA, gen.OUT, gen.SITEMAP, gen.HOME, gen.LIMIT = original


if __name__ == "__main__":
    unittest.main()
