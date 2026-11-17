#!/usr/bin/env python3
"""Produce evidence-based cross-item discovery and bounded daily price observations.

Uses downloaded FANZA product JSON only; does not invent prices, discounts,
ratings or series order. Missing and ranged prices are never recorded as exact.
"""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
INDEX_FILE = DATA / "discovery_index.json"
HISTORY_FILE = DATA / "price_history.json"
SOURCE_LIMITS = {"videoa": ("rank.json", 500), "book": ("manga.json", 400),
                 "anime": ("anime.json", 150)}
HISTORY_DAYS = 90
MAX_RECORDS = 2400
ALLOWED_ID = re.compile(r"^[a-zA-Z0-9_-]{1,100}$")
AMOUNT = re.compile(r"^(?:[¥￥]\s*)?([0-9]{1,8})(?:\s*円)?$")


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def fixed_price(value: object) -> int | None:
    """Accept explicit exact yen amounts; reject ranges, rates and free text."""
    if not isinstance(value, (int, str)) or isinstance(value, bool):
        return None
    s = str(value).replace(",", "").strip()
    match = AMOUNT.fullmatch(s)
    if not match:
        return None
    amount = int(match.group(1))
    return amount if 0 < amount <= 10_000_000 else None


def valid_items(path: Path) -> list[dict]:
    payload = read_json(path)
    result = payload.get("result") if isinstance(payload, dict) else None
    items = result.get("items") if isinstance(result, dict) else None
    if not isinstance(items, list):
        raise ValueError(f"{path}: invalid items")
    return [item for item in items if isinstance(item, dict)]


def persons(item: dict, key: str, limit: int = 6) -> list[str]:
    info = item.get("iteminfo") or {}
    values = info.get(key) or [] if isinstance(info, dict) else []
    if not isinstance(values, list):
        return []
    return [str(x["id"]) for x in values[:limit]
            if isinstance(x, dict) and x.get("id") is not None]


def series_info(item: dict) -> list[dict]:
    info = item.get("iteminfo") or {}
    values = info.get("series") or [] if isinstance(info, dict) else []
    if not isinstance(values, list):
        return []
    return [{"id": str(p.get("id")), "name": str(p.get("name") or "")[:80]}
            for p in values[:3] if isinstance(p, dict) and p.get("id") is not None]


def small(item: dict, floor: str) -> dict:
    img = item.get("imageURL") or {}
    if not isinstance(img, dict):
        img = {}
    cid = str(item.get("content_id") or "")
    return {
        "cid": cid,
        "floor": floor,
        "title": str(item.get("title") or "")[:150],
        "date": str(item.get("date") or "")[:24],
        "image": str(img.get("list") or img.get("large") or "")[:400],
        "series": series_info(item),
        "actress_ids": persons(item, "actress"),
        "maker_ids": persons(item, "maker", 3),
        "genre_ids": persons(item, "genre", 12),
    }


def atomic_write(path: Path, value: dict) -> None:
    content = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if not path.exists() or path.read_text(encoding="utf-8") != content:
        path.write_text(content, encoding="utf-8")


def build(on: date | None = None) -> tuple[int, int]:
    observed = on or date.today()
    all_items = []
    new_prices: dict[str, int] = {}
    seen = set()
    for floor, (source, count) in SOURCE_LIMITS.items():
        items = valid_items(DATA / source)
        for item in items[:count]:
            cid = str(item.get("content_id") or "")
            key = f"{floor}:{cid}"
            if not ALLOWED_ID.fullmatch(cid) or key in seen or not item.get("title"):
                continue
            seen.add(key)
            all_items.append(small(item, floor))
            prices = item.get("prices") or {}
            value = fixed_price(prices.get("price")) if isinstance(prices, dict) else None
            if value is not None:
                new_prices[key] = value

    if len(all_items) < 20:
        raise ValueError("Too few valid source records; refusing to publish a partial index")

    atomic_write(INDEX_FILE, {"version": 1, "source": "FANZA cached product JSON",
                              "items": all_items})
    old = {}
    if HISTORY_FILE.exists():
        payload = read_json(HISTORY_FILE)
        if isinstance(payload, dict) and isinstance(payload.get("items"), dict):
            old = payload["items"]
    start = (observed - timedelta(days=HISTORY_DAYS - 1)).isoformat()
    today = observed.isoformat()
    new_history = {}
    for key in list(dict.fromkeys([*new_prices, *old]))[:MAX_RECORDS]:
        points = old.get(key, [])
        clean: dict[str, int] = {}
        if isinstance(points, list):
            for point in points:
                if (isinstance(point, list) and len(point) == 2 and isinstance(point[0], str)
                        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", point[0])
                        and start <= point[0] <= today
                        and isinstance(point[1], int) and 0 < point[1] <= 10_000_000):
                    clean[point[0]] = point[1]
        # Never write a value when price is absent or presented as a range.
        if key in new_prices:
            clean[today] = new_prices[key]
        if clean:
            new_history[key] = [[day, clean[day]] for day in sorted(clean)]
    atomic_write(HISTORY_FILE, {"version": 1, "source": "FANZA cached product JSON",
                                "observation_date": today, "retention_days": HISTORY_DAYS,
                                "items": new_history})
    return len(all_items), len(new_prices)


if __name__ == "__main__":
    a, b = build()
    print(f"Discovery index: {a} records; exact price observations: {b}")
