#!/usr/bin/env python3
"""Synthetic, deterministic tests for compact FANZA homepage feeds."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import build_home_feed as gen


class FeedTests(unittest.TestCase):
    def test_trim_keeps_card_fields_without_large_unneeded_objects(self):
        item = {
            "content_id": "example000", "title": "サンプル作品", "date": "2026-11-12",
            "affiliateURL": "https://al.dmm.co.jp/test", "prices": {"price": "490", "extra": "ignore"},
            "imageURL": {"large": "https://example.org/large.jpg", "extra": "ignore"},
            "iteminfo": {"actress": [{"id": 123, "name": "サンプル"}],
                         "genre": [{"id": 4025, "name": "単体作品"}]},
            "sampleImageURL": {"sample_l": {"image": ["a", "b", "c", "d", "e"]}},
            "unusedLargeObject": "X" * 10000,
        }
        output = gen.trim(item)
        self.assertEqual(output["prices"], {"price": "490"})
        self.assertEqual(output["imageURL"], {"large": "https://example.org/large.jpg"})
        self.assertEqual(output["iteminfo"]["actress"][0]["id"], 123)
        self.assertEqual(len(output["sampleImageURL"]["sample_l"]["image"]), 3)
        self.assertNotIn("unusedLargeObject", output)

    def test_three_feeds_and_previous_rank_map(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            items = [
                {"content_id": f"example{i:05d}", "title": f"作品{i}",
                 "date": "2026-11-12", "affiliateURL": "https://al.dmm.co.jp/test",
                 "imageURL": {"list": "https://example.org/i.jpg"}, "prices": {"price": "500"},
                 "iteminfo": {"actress": [{"id": i + 10, "name": f"出演者{i}"}]}}
                for i in range(100)
            ]
            for name in ("rank.json", "new.json", "review.json", "rank_prev.json"):
                (data / name).write_text(
                    json.dumps({"result": {"items": items}}, ensure_ascii=False),
                    encoding="utf-8",
                )
            old = gen.DATA
            try:
                gen.DATA = data
                gen.build()
                for sort in gen.SOURCES:
                    payload = json.loads((data / f"home_{sort}.json").read_text(encoding="utf-8"))
                    result = payload["result"]
                    self.assertEqual(result["total_count"], 100)
                    self.assertEqual(result["result_count"], 72)
                    self.assertTrue(result["fast_feed"])
                    self.assertGreater(result["generated_at"], 0)
                    self.assertEqual(len(result["items"]), 72)
                    self.assertNotIn("unusedLargeObject", result["items"][0])
                previous = json.loads((data / "home_prev_ids.json").read_text(encoding="utf-8"))
                self.assertEqual(previous["result"]["ids"][0], "example00000")
                self.assertEqual(len(previous["result"]["ids"]), 100)
            finally:
                gen.DATA = old


if __name__ == "__main__":
    unittest.main()
