#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import math
import time
import traceback
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
from openpyxl import load_workbook

IN_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_curated_v2.xlsx")
OUT_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_curated_v3.xlsx")

# Prioritize high-value service placeholders for a reliable, fast pass.
KEY_TARGETS = {
    "Twizel Food",
    "Twizel Accomodation",
    "Omarama Food",
    "Omarama Accomodation",
    "Wanaka Food",
    "Wanaka Accomodation",
    "Queenstown Food",
    "Queenstown Accomodation",
    "Alexandra Food",
    "Alexandra Accomodation",
    "Ranfurly Food",
    "Ranfurly Accomodation",
    "Naseby Food",
    "Naseby Accomodation",
    "Mossburn Food",
    "Mossburn Accomodation",
    "Lake Hawea Accomodation",
    "Cardrona Food",
    "Cardrona Accommodation",
    "Arrowtown Food",
    "Arrowtown Accomodation",
    "Franklin Food",
    "Clyde Accomodation",
}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def infer_intent(name: str) -> str | None:
    n = name.lower()
    if any(k in n for k in ["food", "cafe", "supermarket", "grocery", "4 square"]):
        return "food"
    if any(k in n for k in ["accomodation", "accommodation", "motel", "hotel", "hostel"]):
        return "accommodation"
    if any(k in n for k in ["campground", "camping", "campsite", "doc camp"]):
        return "camping"
    return None


def build_query(lat: float, lon: float, intent: str, radius_m: int = 3500) -> str:
    around = f"around:{radius_m},{lat},{lon}"
    if intent == "food":
        clauses = [
            f"node({around})[shop=supermarket];",
            f"node({around})[shop=convenience];",
            f"way({around})[shop=supermarket];",
            f"way({around})[shop=convenience];",
            f"node({around})[amenity=cafe];",
            f"node({around})[amenity=restaurant];",
            f"way({around})[amenity=cafe];",
            f"way({around})[amenity=restaurant];",
        ]
    else:
        clauses = [
            f"node({around})[tourism=camp_site];",
            f"node({around})[tourism=caravan_site];",
            f"node({around})[tourism=hotel];",
            f"node({around})[tourism=motel];",
            f"node({around})[tourism=hostel];",
            f"way({around})[tourism=camp_site];",
            f"way({around})[tourism=caravan_site];",
            f"way({around})[tourism=hotel];",
            f"way({around})[tourism=motel];",
            f"way({around})[tourism=hostel];",
        ]
    return "[out:json][timeout:25];(" + "".join(clauses) + ");out tags center 20;"


def element_lat_lon(elem: dict[str, Any]) -> tuple[float | None, float | None]:
    if "lat" in elem and "lon" in elem:
        return float(elem["lat"]), float(elem["lon"])
    center = elem.get("center") if isinstance(elem.get("center"), dict) else None
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None, None


def score_candidate(elem: dict[str, Any], intent: str, base_lat: float, base_lon: float) -> float:
    tags = elem.get("tags") if isinstance(elem.get("tags"), dict) else {}
    name = str(tags.get("name") or "").lower()
    tourism = str(tags.get("tourism") or "").lower()
    amenity = str(tags.get("amenity") or "").lower()
    shop = str(tags.get("shop") or "").lower()

    c_lat, c_lon = element_lat_lon(elem)
    dist_score = 0.0
    if c_lat is not None and c_lon is not None:
        dist_m = haversine_m(base_lat, base_lon, c_lat, c_lon)
        dist_score = max(0.0, 5000.0 - dist_m) / 100.0

    s = dist_score
    if intent == "food":
        if "4 square" in name or "four square" in name:
            s += 45
        if shop in {"supermarket", "convenience"}:
            s += 20
        if amenity in {"cafe", "restaurant"}:
            s += 10
    else:
        if "holiday park" in name:
            s += 40
        if tourism in {"camp_site", "caravan_site"}:
            s += 25
        if tourism in {"motel", "hotel", "hostel"}:
            s += 10
        if "motor camp" in name:
            s += 12

    if tags.get("phone") or tags.get("contact:phone"):
        s += 4
    if tags.get("website") or tags.get("contact:website"):
        s += 4
    return s


def address_from_tags(tags: dict[str, Any]) -> str:
    bits = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
        tags.get("addr:country"),
    ]
    out = ", ".join(str(b) for b in bits if b)
    return out


def classify(tags: dict[str, Any], intent: str) -> tuple[str, str | None]:
    tourism = str(tags.get("tourism") or "")
    amenity = str(tags.get("amenity") or "")
    shop = str(tags.get("shop") or "")

    if intent == "food":
        if shop == "supermarket":
            return "Supermarket", "Grocery Store"
        if shop == "convenience":
            return "Grocery Store", "Food"
        if amenity == "cafe":
            return "Cafe", "Food"
        if amenity == "restaurant":
            return "Restaurant", "Food"
        return "Food", None

    if tourism in {"camp_site", "caravan_site"}:
        return "Camping", "Accommodation"
    if tourism == "motel":
        return "Motel", "Accommodation"
    if tourism == "hotel":
        return "Hotel", "Accommodation"
    if tourism == "hostel":
        return "Hostel", "Accommodation"
    if intent == "camping":
        return "Camping", "Accommodation"
    return "Accommodation", None


def services_for(tags: dict[str, Any], intent: str) -> str:
    vals: list[str] = []
    name = str(tags.get("name") or "").lower()
    if intent == "food":
        vals.extend(["Food available", "Grocery supplies"])
        if tags.get("amenity") == "cafe":
            vals.append("Coffee")
    else:
        vals.extend(["Accommodation", "Camping" if tags.get("tourism") in {"camp_site", "caravan_site"} else ""])
    if "shower" in str(tags).lower() or "holiday park" in name:
        vals.append("Showers")
    if "toilet" in str(tags).lower() or tags.get("tourism") in {"camp_site", "caravan_site"}:
        vals.append("Toilets")
    return ", ".join([v for v in dict.fromkeys(vals) if v])


def main() -> None:
    wb = load_workbook(IN_FILE)
    ws = wb["POI Master Table"]
    src = wb["Research Sources"]

    headers = [c.value for c in ws[1]]
    idx = {h: i + 1 for i, h in enumerate(headers)}

    session = requests.Session()
    session.headers.update({"User-Agent": "wxtiles-curated-overpass/1.0"})

    updates = 0
    attempts = 0
    for row in range(2, ws.max_row + 1):
        name = str(ws.cell(row, idx["POI Name"]).value or "")
        intent = infer_intent(name)
        if intent is None:
            continue

        lat = ws.cell(row, idx["Latitude"]).value
        lon = ws.cell(row, idx["Longitude"]).value
        if lat is None or lon is None:
            continue

        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            continue

        query = build_query(lat_f, lon_f, "food" if intent == "food" else "accommodation", radius_m=6000)
        if name not in KEY_TARGETS and intent != "camping":
            continue

        attempts += 1
        print(f"[{attempts}] checking: {name}", flush=True)

        payload = None
        for attempt in range(3):
            try:
                time.sleep(0.9)
                resp = session.get("https://overpass-api.de/api/interpreter", params={"data": query}, timeout=12)
                if resp.status_code == 200:
                    payload = resp.json()
                    break
                if resp.status_code in {429, 504} and attempt < 2:
                    time.sleep(1.2 * (attempt + 1))
                    continue
                print(f"  -> skipped (HTTP {resp.status_code})", flush=True)
                break
            except (requests.RequestException, ValueError):
                if attempt < 2:
                    time.sleep(0.8 * (attempt + 1))
                    continue
                print("  -> skipped (request/parse error)", flush=True)

        if payload is None:
            continue

        elems = payload.get("elements") if isinstance(payload.get("elements"), list) else []
        if not elems:
            print("  -> skipped (no candidates)", flush=True)
            continue

        best_elem = None
        best_score = -1.0
        for e in elems:
            score = score_candidate(e, intent, lat_f, lon_f)
            if score > best_score:
                best_score = score
                best_elem = e

        if not best_elem or best_score < 10:
            print("  -> skipped (low score)", flush=True)
            continue

        tags = best_elem.get("tags") if isinstance(best_elem.get("tags"), dict) else {}
        best_name = str(tags.get("name") or "").strip()
        if not best_name:
            print("  -> skipped (missing name)", flush=True)
            continue

        primary, secondary = classify(tags, intent)

        ws.cell(row, idx["POI Name"]).value = best_name
        ws.cell(row, idx["Primary Type"]).value = primary
        ws.cell(row, idx["Secondary Type"]).value = secondary or ""

        addr = address_from_tags(tags)
        if addr:
            ws.cell(row, idx["Address"]).value = addr

        phone = tags.get("phone") or tags.get("contact:phone")
        website = tags.get("website") or tags.get("contact:website")
        opening = tags.get("opening_hours")

        ws.cell(row, idx["Phone"]).value = str(phone) if phone else (ws.cell(row, idx["Phone"]).value or "Not confirmed")
        ws.cell(row, idx["Website"]).value = str(website) if website else (ws.cell(row, idx["Website"]).value or "Not confirmed")
        ws.cell(row, idx["Opening Hours"]).value = str(opening) if opening else (ws.cell(row, idx["Opening Hours"]).value or "Not confirmed")
        ws.cell(row, idx["Services"]).value = services_for(tags, intent) or (ws.cell(row, idx["Services"]).value or "Not confirmed")

        if intent == "food":
            ws.cell(row, idx["Route Notes"]).value = "Budget-friendly food/resupply option identified near route."
        else:
            ws.cell(row, idx["Route Notes"]).value = "Accommodation option identified near route; bookings may be required."

        confidence = "High" if (phone and website) else "Medium"
        ws.cell(row, idx["Confidence"]).value = confidence

        src_url = "https://overpass-api.de/api/interpreter?data=" + quote_plus(query)
        src.append(
            [
                best_name,
                src_url,
                "Overpass API (OpenStreetMap)",
                f"name={best_name}; tourism={tags.get('tourism')}; amenity={tags.get('amenity')}; shop={tags.get('shop')}",
                dt.date.today().isoformat(),
            ]
        )

        updates += 1
        print(f"  -> updated: {best_name}", flush=True)

    wb.save(OUT_FILE)
    print(f"Updated rows: {updates}")
    print(f"Output: {OUT_FILE}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
