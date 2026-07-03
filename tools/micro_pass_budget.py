#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import math
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
from openpyxl import load_workbook

IN_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_curated_v3.xlsx")
OUT_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_curated_v4.xlsx")

TARGET_KEYS = ["lake hawea", "albert town", "tarras", "lake ohau"]


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_overpass(session: requests.Session, query: str, timeout_s: float = 15.0) -> list[dict[str, Any]]:
    for attempt in range(4):
        try:
            time.sleep(0.9)
            r = session.get(
                "https://overpass-api.de/api/interpreter",
                params={"data": query},
                timeout=timeout_s,
            )
            if r.status_code == 200:
                payload = r.json()
                elements = payload.get("elements") if isinstance(payload.get("elements"), list) else []
                return [e for e in elements if isinstance(e, dict)]
            if r.status_code in {429, 504} and attempt < 3:
                time.sleep(1.2 * (attempt + 1))
                continue
            return []
        except (requests.RequestException, ValueError):
            if attempt < 3:
                time.sleep(1.0 * (attempt + 1))
                continue
            return []
    return []


def element_lat_lon(elem: dict[str, Any]) -> tuple[float | None, float | None]:
    if "lat" in elem and "lon" in elem:
        return float(elem["lat"]), float(elem["lon"])
    center = elem.get("center") if isinstance(elem.get("center"), dict) else None
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None, None


def food_query(lat: float, lon: float, radius_m: int = 12000) -> str:
    around = f"around:{radius_m},{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({around})[shop=supermarket];"
        f"node({around})[shop=convenience];"
        f"way({around})[shop=supermarket];"
        f"way({around})[shop=convenience];"
        f"node({around})[amenity=cafe];"
        f"node({around})[amenity=restaurant];"
        f"way({around})[amenity=cafe];"
        f"way({around})[amenity=restaurant];"
        ");out tags center 30;"
    )


def stay_query(lat: float, lon: float, radius_m: int = 15000) -> str:
    around = f"around:{radius_m},{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({around})[tourism=camp_site];"
        f"node({around})[tourism=caravan_site];"
        f"node({around})[tourism=hostel];"
        f"node({around})[tourism=guest_house];"
        f"node({around})[tourism=motel];"
        f"node({around})[tourism=hotel];"
        f"way({around})[tourism=camp_site];"
        f"way({around})[tourism=caravan_site];"
        f"way({around})[tourism=hostel];"
        f"way({around})[tourism=guest_house];"
        f"way({around})[tourism=motel];"
        f"way({around})[tourism=hotel];"
        ");out tags center 30;"
    )


def score_food(elem: dict[str, Any], base_lat: float, base_lon: float) -> float:
    tags = elem.get("tags") if isinstance(elem.get("tags"), dict) else {}
    name = str(tags.get("name") or "").lower()
    shop = str(tags.get("shop") or "")
    amenity = str(tags.get("amenity") or "")

    lat, lon = element_lat_lon(elem)
    dist_score = 0.0
    if lat is not None and lon is not None:
        d = haversine_m(base_lat, base_lon, lat, lon)
        dist_score = max(0.0, 16000.0 - d) / 150.0

    s = dist_score
    if "4 square" in name or "four square" in name:
        s += 40
    if shop in {"supermarket", "convenience"}:
        s += 18
    if amenity in {"cafe", "restaurant"}:
        s += 8
    return s


def score_stay(elem: dict[str, Any], base_lat: float, base_lon: float) -> float:
    tags = elem.get("tags") if isinstance(elem.get("tags"), dict) else {}
    name = str(tags.get("name") or "").lower()
    tourism = str(tags.get("tourism") or "")

    lat, lon = element_lat_lon(elem)
    dist_score = 0.0
    if lat is not None and lon is not None:
        d = haversine_m(base_lat, base_lon, lat, lon)
        dist_score = max(0.0, 20000.0 - d) / 180.0

    s = dist_score
    if any(k in name for k in ["holiday park", "motor camp", "campground", "camp"]):
        s += 38
    if any(k in name for k in ["backpack", "hostel"]):
        s += 30
    if tourism in {"camp_site", "caravan_site"}:
        s += 30
    if tourism in {"hostel", "guest_house"}:
        s += 20
    if tourism in {"motel"}:
        s += 10
    if tourism in {"hotel"}:
        s += 2
    return s


def best_candidate(elements: list[dict[str, Any]], scorer, base_lat: float, base_lon: float) -> dict[str, Any] | None:
    best = None
    best_s = -1.0
    for e in elements:
        tags = e.get("tags") if isinstance(e.get("tags"), dict) else {}
        if not tags.get("name"):
            continue
        s = scorer(e, base_lat, base_lon)
        if s > best_s:
            best_s = s
            best = e
    return best


def addr_from_tags(tags: dict[str, Any]) -> str:
    parts = [
        tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:city"),
        tags.get("addr:country"),
    ]
    return ", ".join(str(p) for p in parts if p)


def extract_contact(tags: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    phone = tags.get("phone") or tags.get("contact:phone")
    website = tags.get("website") or tags.get("contact:website")
    hours = tags.get("opening_hours")
    return (
        str(phone) if phone else None,
        str(website) if website else None,
        str(hours) if hours else None,
    )


def add_source(src_ws, poi_name: str, query: str, tags: dict[str, Any]) -> None:
    src_url = "https://overpass-api.de/api/interpreter?data=" + quote_plus(query)
    src_ws.append(
        [
            poi_name,
            src_url,
            "Overpass API (OpenStreetMap)",
            f"name={tags.get('name')}; tourism={tags.get('tourism')}; amenity={tags.get('amenity')}; shop={tags.get('shop')}",
            dt.date.today().isoformat(),
        ]
    )


def main() -> None:
    wb = load_workbook(IN_FILE)
    ws = wb["POI Master Table"]
    src = wb["Research Sources"]

    headers = [c.value for c in ws[1]]
    idx = {h: i + 1 for i, h in enumerate(headers)}

    session = requests.Session()
    session.headers.update({"User-Agent": "wxtiles-budget-micropass/1.0"})

    updates = 0

    for r in range(2, ws.max_row + 1):
        poi_name = str(ws.cell(r, idx["POI Name"]).value or "")
        if not any(k in poi_name.lower() for k in TARGET_KEYS):
            continue

        lat = ws.cell(r, idx["Latitude"]).value
        lon = ws.cell(r, idx["Longitude"]).value
        if lat is None or lon is None:
            continue
        lat_f = float(lat)
        lon_f = float(lon)

        print(f"checking row {r}: {poi_name}", flush=True)

        fq = food_query(lat_f, lon_f)
        sq = stay_query(lat_f, lon_f)

        foods = fetch_overpass(session, fq)
        stays = fetch_overpass(session, sq)

        best_food = best_candidate(foods, score_food, lat_f, lon_f)
        best_stay = best_candidate(stays, score_stay, lat_f, lon_f)

        if "accomodation" in poi_name.lower() or "accommodation" in poi_name.lower():
            if best_stay:
                tags = best_stay.get("tags") if isinstance(best_stay.get("tags"), dict) else {}
                ws.cell(r, idx["POI Name"]).value = str(tags.get("name") or poi_name)
                ws.cell(r, idx["Primary Type"]).value = "Camping" if str(tags.get("tourism") or "") in {"camp_site", "caravan_site"} or "holiday park" in str(tags.get("name") or "").lower() else "Accommodation"
                ws.cell(r, idx["Secondary Type"]).value = "Accommodation"

                addr = addr_from_tags(tags)
                if addr:
                    ws.cell(r, idx["Address"]).value = addr
                phone, web, hours = extract_contact(tags)
                ws.cell(r, idx["Phone"]).value = phone or (ws.cell(r, idx["Phone"]).value or "Not confirmed")
                ws.cell(r, idx["Website"]).value = web or (ws.cell(r, idx["Website"]).value or "Not confirmed")
                ws.cell(r, idx["Opening Hours"]).value = hours or (ws.cell(r, idx["Opening Hours"]).value or "Not confirmed")
                ws.cell(r, idx["Services"]).value = "Accommodation, Camping, Toilets, Showers"
                ws.cell(r, idx["Route Notes"]).value = "Budget-focused accommodation match near this POI; confirm booking policy."
                ws.cell(r, idx["Confidence"]).value = "Medium"
                add_source(src, str(tags.get("name") or poi_name), sq, tags)
                updates += 1
            continue

        # Town/village landmark row: keep place name and add nearby budget service intelligence.
        services = []
        note_parts = []

        if best_food:
            f_tags = best_food.get("tags") if isinstance(best_food.get("tags"), dict) else {}
            f_name = str(f_tags.get("name") or "food option")
            services.append(f"Nearby grocery/food: {f_name}")
            add_source(src, poi_name, fq, f_tags)

        if best_stay:
            s_tags = best_stay.get("tags") if isinstance(best_stay.get("tags"), dict) else {}
            s_name = str(s_tags.get("name") or "budget stay")
            services.append(f"Nearby budget stay: {s_name}")
            add_source(src, poi_name, sq, s_tags)

        if services:
            ws.cell(r, idx["Services"]).value = "; ".join(services)
            note_parts.append("Budget-oriented services found around this village/town POI.")
            ws.cell(r, idx["Route Notes"]).value = " ".join(note_parts)
            ws.cell(r, idx["Confidence"]).value = "Medium"
            updates += 1

    wb.save(OUT_FILE)
    print(f"Updated rows: {updates}")
    print(f"Output: {OUT_FILE}")


if __name__ == "__main__":
    main()
