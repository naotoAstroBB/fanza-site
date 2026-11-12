#!/usr/bin/env python3
"""Build a small, complete-enough first-72-products feed for the FANZA homepage.

The original 10,000-record JSON files remain unchanged. A failed feed build must
not replace the existing API data or the public interface. No external requests.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PAGE_SIZE = 24
PREFETCH_PAGES = 3
LIMIT = PAGE_SIZE * PREFETCH_PAGES
SOURCES = {
    "rank": "rank.json",
    "date": "new.json",
    "review": "review.json",
}


def obj(value: object) -> dict:
    return value if isinstance(value, dict) else {}


def subset(value: object, keys: tuple[str, ...]) -> dict:
    source = obj(value)
    return {key: source[key] for key in keys if source.get(key) is not None}


def small_people(item: dict, category: str, limit: int = 4) -> list[dict]:
    source = obj(item.get("iteminfo")).get(category)
    if not isinstance(source, list):
        return []
    return [
        subset(person, ("id", "name"))
        for person in source[:limit]
        if isinstance(person, dict) and (person.get("id") or person.get("name"))
    ]


def trim(item: dict) -> dict:
    """Keep only the fields currently consumed by App.cardHTML / hero / filters."""
    image = subset(item.get("imageURL"), ("list", "small", "large"))
    sample = subset(item.get("sampleMovieURL"), ("size_560_360", "size_476_306", "size_644_414"))
    sample_images = obj(item.get("sampleImageURL"))
    images = obj(sample_images.get("sample_l")).get("image") or obj(sample_images.get("sample_s")).get("image") or []
    if isinstance(images, str):
        images = [images]
    if not isinstance(images, list):
        images = []
    out = subset(item, ("content_id", "title", "date", "affiliateURL", "URL", "volume"))
    out.update({
        "imageURL": image,
        "prices": subset(item.get("prices"), ("price", "list_price")),
        "review": subset(item.get("review"), ("average", "count")),
        "iteminfo": {
            "actress": small_people(item, "actress", 5),
            "genre": small_people(item, "genre", 12),
            "maker": small_people(item, "maker", 3),
            "series": small_people(item, "series", 3),
        },
    })
    if sample:
        out["sampleMovieURL"] = sample
    if images:
        out["sampleImageURL"] = {"sample_l": {"image": images[:3]}}
    campaign = subset(item.get("campaign"), ("title",))
    if campaign:
        out["campaign"] = campaign
    return out


def load_items(path: Path) -> tuple[list[dict], int]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    raw = obj(payload.get("result")).get("items")
    if not isinstance(raw, list) or len(raw) < LIMIT:
        raise ValueError(f"{path.name}: not enough valid source records")
    return [item for item in raw if isinstance(item, dict)], len(raw)


def build() -> None:
    # Compute all outputs in memory first. No partial or incomplete feed updates.
    outputs: dict[Path, str] = {}
    for sort, filename in SOURCES.items():
        original = DATA / filename
        items, total = load_items(original)
        top = [trim(item) for item in items[:LIMIT]]
        if len(top) != LIMIT or any(not x.get("content_id") or not x.get("title") for x in top):
            raise ValueError(f"{filename}: malformed first {LIMIT} product records")
        payload = {"result": {
            "status": 200, "fast_feed": True,
            "sort": sort, "items": top,
            "total_count": total, "result_count": len(top),
        }}
        outputs[DATA / f"home_{sort}.json"] = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    previous = DATA / "rank_prev.json"
    if previous.exists():
        source, _ = load_items(previous)
        ids = [str(item.get("content_id") or "") for item in source[:100]]
        outputs[DATA / "home_prev_ids.json"] = json.dumps(
            {"result": {"status": 200, "ids": ids}}, ensure_ascii=False, separators=(",", ":")
        )
    for filename, content in outputs.items():
        if not filename.exists() or filename.read_text(encoding="utf-8") != content:
            filename.write_text(content, encoding="utf-8")
        print(f"Ready {filename.name}: {len(content):,} bytes")


if __name__ == "__main__":
    build()
