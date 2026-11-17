#!/usr/bin/env python3
"""Offline product discovery data regression tests."""
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
import build_discovery_indexes as gen

def example(i, price, floor="book", series=None):
    return {
        "content_id": f"comic{i:05d}", "title": f"作品{i}",
        "date": f"2026-11-{i%28+1:02d}", "prices":{"price":price},
        "imageURL":{"list":"https://example.org/pic.jpg"},
        "iteminfo":{
            "series":[{"id": series or 123,"name":"サンプル作品群"}],
            "maker":[{"id":99,"name":"メーカー"}],
            "actress":[]
        }
    }

class IndexTests(unittest.TestCase):
    def test_exact_prices_only(self):
        for value, expected in [(907,907),("1,650",1650),("¥1000",1000),
                                ("1,200円",1200),("2100~",None),("2000〜",None),
                                ("50%OFF",None),("無料",None),("",None),("¥0",None),
                                (None,None),("～2100",None)]:
            self.assertEqual(gen.fixed_price(value), expected, value)

    def test_daily_history_retention_and_series_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)
            old=gen.DATA
            old_index, old_history=gen.INDEX_FILE,gen.HISTORY_FILE
            src=gen.SOURCE_LIMITS
            try:
                gen.DATA=path
                gen.INDEX_FILE=path/"discovery_index.json"
                gen.HISTORY_FILE=path/"price_history.json"
                gen.SOURCE_LIMITS={
                    "videoa":("rank.json",2),
                    "book":("manga.json",3),
                    "anime":("anime.json",2)
                }
                for floor,(source,count) in gen.SOURCE_LIMITS.items():
                    items=[example(i+10*(list(gen.SOURCE_LIMITS).index(floor)), "907" if i%2==0 else "2000~")
                           for i in range(count)]
                    (path/source).write_text(json.dumps({"result":{"items":items}}),
                                             encoding="utf-8")
                # Temporarily lower the minimum size requirement with an expanded dataset.
                for floor,(source,count) in list(gen.SOURCE_LIMITS.items()):
                    items=json.loads((path/source).read_text())["result"]["items"]
                    items=items+[example(i+100+20*list(gen.SOURCE_LIMITS).index(floor),"990") for i in range(10)]
                    (path/source).write_text(json.dumps({"result":{"items":items}}),encoding="utf-8")
                    gen.SOURCE_LIMITS[floor]=(source,len(items))
                a,b=gen.build(date(2026,11,17))
                self.assertGreaterEqual(a,20)
                self.assertGreater(b,0)
                index=json.loads((path/"discovery_index.json").read_text())
                self.assertEqual(len(index["items"]),a)
                self.assertEqual(index["items"][0]["series"][0]["id"],"123")
                history=json.loads((path/"price_history.json").read_text())
                key="book:comic00010"
                self.assertEqual(history["items"][key],[["2026-11-17",907]])
                gen.build(date(2026,11,17)) # same-day reruns deduplicate
                history=json.loads((path/"price_history.json").read_text())
                self.assertEqual(len(history["items"][key]),1)
                items=json.loads((path/"manga.json").read_text())["result"]["items"]
                items[0]["prices"]["price"]="790"
                (path/"manga.json").write_text(json.dumps({"result":{"items":items}}))
                gen.build(date(2026,11,18))
                history=json.loads((path/"price_history.json").read_text())
                self.assertEqual(history["items"][key],
                                 [["2026-11-17",907],["2026-11-18",790]])
                gen.build(date(2027,4,1))
                history=json.loads((path/"price_history.json").read_text())
                self.assertEqual(history["items"][key],[["2027-04-01",790]])
                self.assertNotIn("videoa:comic00001",history["items"]) # ranged price
            finally:
                gen.DATA=old
                gen.INDEX_FILE,gen.HISTORY_FILE=old_index,old_history
                gen.SOURCE_LIMITS=src

if __name__=="__main__":
    unittest.main()
