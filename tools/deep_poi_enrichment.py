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

IN_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_curated_v4.xlsx")
OUT_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_deep_v5.xlsx")


class OverpassClient:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "wxtiles-deep-enrichment/1.0"})
        self.cache: dict[str, list[dict[str, Any]]] = {}

    def query(self, q: str, timeout_s: float = 20.0) -> list[dict[str, Any]]:
        if q in self.cache:
            return self.cache[q]

        for attempt in range(5):
            try:
                time.sleep(0.85)
                r = self.session.get(
                    "https://overpass-api.de/api/interpreter",
                    params={"data": q},
                    timeout=timeout_s,
                )
                if r.status_code == 200:
                    payload = r.json()
                    elements = payload.get("elements") if isinstance(payload.get("elements"), list) else []
                    out = [e for e in elements if isinstance(e, dict)]
                    self.cache[q] = out
                    return out
                if r.status_code in {429, 504} and attempt < 4:
                    time.sleep(1.2 * (attempt + 1))
                    continue
                self.cache[q] = []
                return []
            except (requests.RequestException, ValueError):
                if attempt < 4:
                    time.sleep(1.0 * (attempt + 1))
                    continue
                self.cache[q] = []
                return []

        self.cache[q] = []
        return []


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def element_lat_lon(elem: dict[str, Any]) -> tuple[float | None, float | None]:
    if "lat" in elem and "lon" in elem:
        return float(elem["lat"]), float(elem["lon"])
    center = elem.get("center") if isinstance(elem.get("center"), dict) else None
    if center and "lat" in center and "lon" in center:
        return float(center["lat"]), float(center["lon"])
    return None, None


def tags(elem: dict[str, Any]) -> dict[str, Any]:
    return elem.get("tags") if isinstance(elem.get("tags"), dict) else {}


def q_places(lat: float, lon: float, radius: int = 8000) -> str:
    a = f"around:{radius},{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({a})[place~\"city|town|village|hamlet|suburb\"];"
        f"way({a})[place~\"city|town|village|hamlet|suburb\"];"
        ");out tags center 20;"
    )


def q_food(lat: float, lon: float, radius: int = 12000) -> str:
    a = f"around:{radius},{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({a})[shop=supermarket];"
        f"node({a})[shop=convenience];"
        f"way({a})[shop=supermarket];"
        f"way({a})[shop=convenience];"
        f"node({a})[amenity=cafe];"
        f"node({a})[amenity=restaurant];"
        f"way({a})[amenity=cafe];"
        f"way({a})[amenity=restaurant];"
        ");out tags center 30;"
    )


def q_stay(lat: float, lon: float, radius: int = 15000) -> str:
    a = f"around:{radius},{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({a})[tourism=camp_site];"
        f"node({a})[tourism=caravan_site];"
        f"node({a})[tourism=hostel];"
        f"node({a})[tourism=guest_house];"
        f"node({a})[tourism=motel];"
        f"node({a})[tourism=hotel];"
        f"way({a})[tourism=camp_site];"
        f"way({a})[tourism=caravan_site];"
        f"way({a})[tourism=hostel];"
        f"way({a})[tourism=guest_house];"
        f"way({a})[tourism=motel];"
        f"way({a})[tourism=hotel];"
        ");out tags center 30;"
    )


def q_support(lat: float, lon: float, radius: int = 9000) -> str:
    a = f"around:{radius},{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({a})[amenity=pharmacy];"
        f"node({a})[amenity=hospital];"
        f"node({a})[amenity=clinic];"
        f"node({a})[amenity=toilets];"
        f"node({a})[amenity=drinking_water];"
        f"node({a})[shop=bicycle];"
        f"way({a})[amenity=pharmacy];"
        f"way({a})[shop=bicycle];"
        ");out tags center 20;"
    )


def q_combined(lat: float, lon: float) -> str:
    a_place = f"around:8000,{lat},{lon}"
    a_food = f"around:12000,{lat},{lon}"
    a_stay = f"around:15000,{lat},{lon}"
    a_sup = f"around:9000,{lat},{lon}"
    return (
        "[out:json][timeout:25];("
        f"node({a_place})[place~\"city|town|village|hamlet|suburb\"];"
        f"way({a_place})[place~\"city|town|village|hamlet|suburb\"];"
        f"node({a_food})[shop=supermarket];"
        f"node({a_food})[shop=convenience];"
        f"way({a_food})[shop=supermarket];"
        f"way({a_food})[shop=convenience];"
        f"node({a_food})[amenity=cafe];"
        f"node({a_food})[amenity=restaurant];"
        f"way({a_food})[amenity=cafe];"
        f"way({a_food})[amenity=restaurant];"
        f"node({a_stay})[tourism=camp_site];"
        f"node({a_stay})[tourism=caravan_site];"
        f"node({a_stay})[tourism=hostel];"
        f"node({a_stay})[tourism=guest_house];"
        f"node({a_stay})[tourism=motel];"
        f"node({a_stay})[tourism=hotel];"
        f"way({a_stay})[tourism=camp_site];"
        f"way({a_stay})[tourism=caravan_site];"
        f"way({a_stay})[tourism=hostel];"
        f"way({a_stay})[tourism=guest_house];"
        f"way({a_stay})[tourism=motel];"
        f"way({a_stay})[tourism=hotel];"
        f"node({a_sup})[amenity=pharmacy];"
        f"node({a_sup})[amenity=hospital];"
        f"node({a_sup})[amenity=clinic];"
        f"node({a_sup})[amenity=toilets];"
        f"node({a_sup})[amenity=drinking_water];"
        f"node({a_sup})[shop=bicycle];"
        f"way({a_sup})[amenity=pharmacy];"
        f"way({a_sup})[shop=bicycle];"
        ");out tags center 40;"
    )


def nearest_named(elements: list[dict[str, Any]], base_lat: float, base_lon: float, preferred: set[str] | None = None) -> tuple[dict[str, Any] | None, float | None]:
    best = None
    best_d = None
    for e in elements:
        t = tags(e)
        n = str(t.get("name") or "").strip()
        if not n:
            continue
        if preferred is not None:
            key = str(t.get("shop") or t.get("amenity") or t.get("tourism") or "")
            if key and key not in preferred:
                pass
        lat, lon = element_lat_lon(e)
        if lat is None or lon is None:
            continue
        d = haversine_m(base_lat, base_lon, lat, lon)
        if best_d is None or d < best_d:
            best = e
            best_d = d
    return best, best_d


def budget_rank_food(e: dict[str, Any], base_lat: float, base_lon: float) -> float:
    t = tags(e)
    n = str(t.get("name") or "").lower()
    shop = str(t.get("shop") or "")
    amenity = str(t.get("amenity") or "")
    lat, lon = element_lat_lon(e)
    if lat is None or lon is None:
        return -1
    d = haversine_m(base_lat, base_lon, lat, lon)
    s = max(0.0, 20000 - d) / 180.0
    if "4 square" in n or "four square" in n:
        s += 45
    if shop in {"supermarket", "convenience"}:
        s += 20
    if amenity in {"cafe", "restaurant"}:
        s += 8
    return s


def budget_rank_stay(e: dict[str, Any], base_lat: float, base_lon: float) -> float:
    t = tags(e)
    n = str(t.get("name") or "").lower()
    tourism = str(t.get("tourism") or "")
    lat, lon = element_lat_lon(e)
    if lat is None or lon is None:
        return -1
    d = haversine_m(base_lat, base_lon, lat, lon)
    s = max(0.0, 22000 - d) / 200.0
    if any(k in n for k in ["holiday park", "motor camp", "campground", "campsite", "camp "]):
        s += 40
    if tourism in {"camp_site", "caravan_site"}:
        s += 32
    if tourism in {"hostel", "guest_house"}:
        s += 18
    if tourism == "motel":
        s += 10
    if tourism == "hotel":
        s += 2
    return s


def best_budget(elements: list[dict[str, Any]], ranker, base_lat: float, base_lon: float) -> tuple[dict[str, Any] | None, float | None]:
    best = None
    best_s = None
    best_d = None
    for e in elements:
        t = tags(e)
        if not t.get("name"):
            continue
        s = ranker(e, base_lat, base_lon)
        if s < 0:
            continue
        lat, lon = element_lat_lon(e)
        if lat is None or lon is None:
            continue
        d = haversine_m(base_lat, base_lon, lat, lon)
        if best_s is None or s > best_s:
            best_s = s
            best = e
            best_d = d
    return best, best_d


def address_from_tags(t: dict[str, Any]) -> str | None:
    parts = [
        t.get("addr:housenumber"),
        t.get("addr:street"),
        t.get("addr:suburb"),
        t.get("addr:city"),
        t.get("addr:country"),
    ]
    out = ", ".join(str(p) for p in parts if p)
    return out if out else None


def append_service(existing: str | None, addition: str) -> str:
    cur = (existing or "").strip()
    if not cur:
        return addition
    if addition in cur:
        return cur
    return cur + "; " + addition


def add_source(src_ws: Any, poi_name: str, query: str, t: dict[str, Any], source_name: str = "Overpass API (OpenStreetMap)") -> None:
    src_url = "https://overpass-api.de/api/interpreter?data=" + quote_plus(query)
    src_ws.append(
        [
            poi_name,
            src_url,
            source_name,
            f"name={t.get('name')}; place={t.get('place')}; tourism={t.get('tourism')}; amenity={t.get('amenity')}; shop={t.get('shop')}",
            dt.date.today().isoformat(),
        ]
    )


def main() -> None:
    wb = load_workbook(IN_FILE)
    ws = wb["POI Master Table"]
    src = wb["Research Sources"]

    headers = [c.value for c in ws[1]]
    idx = {h: i + 1 for i, h in enumerate(headers)}

    oc = OverpassClient()

    updated_rows = 0

    for r in range(2, ws.max_row + 1):
        name = str(ws.cell(r, idx["POI Name"]).value or "")
        lowered_name = name.lower()
        if any(k in lowered_name for k in ["start", "finish", "check-in", "gsb", "navigation"]):
            continue

        lat = ws.cell(r, idx["Latitude"]).value
        lon = ws.cell(r, idx["Longitude"]).value
        if lat is None or lon is None:
            continue

        lat_f = float(lat)
        lon_f = float(lon)
        print(f"row {r}: {name}", flush=True)

        q_all = q_combined(lat_f, lon_f)
        all_elems = oc.query(q_all)

        places: list[dict[str, Any]] = []
        foods: list[dict[str, Any]] = []
        stays: list[dict[str, Any]] = []
        support: list[dict[str, Any]] = []

        for e in all_elems:
            t = tags(e)
            place = str(t.get("place") or "")
            shop = str(t.get("shop") or "")
            amenity = str(t.get("amenity") or "")
            tourism = str(t.get("tourism") or "")

            if place in {"city", "town", "village", "hamlet", "suburb"}:
                places.append(e)
            if shop in {"supermarket", "convenience"} or amenity in {"cafe", "restaurant"}:
                foods.append(e)
            if tourism in {"camp_site", "caravan_site", "hostel", "guest_house", "motel", "hotel"}:
                stays.append(e)
            if amenity in {"pharmacy", "hospital", "clinic", "toilets", "drinking_water"} or shop == "bicycle":
                support.append(e)

        place_best, place_d = best_budget(places, lambda e, a, b: max(0.0, 20000 - haversine_m(a, b, *(element_lat_lon(e) or (a, b)))), lat_f, lon_f)
        food_best, food_d = best_budget(foods, budget_rank_food, lat_f, lon_f)
        stay_best, stay_d = best_budget(stays, budget_rank_stay, lat_f, lon_f)
        support_best, support_d = nearest_named(support, lat_f, lon_f)

        changed = False

        # If this POI itself is clearly an accommodation placeholder, replace with budget option.
        if any(k in lowered_name for k in ["accomodation", "accommodation", "hostel", "campground", "camping"]):
            if stay_best is not None:
                t = tags(stay_best)
                new_name = str(t.get("name") or name)
                ws.cell(r, idx["POI Name"]).value = new_name
                tourism = str(t.get("tourism") or "")
                if tourism in {"camp_site", "caravan_site"} or "holiday park" in new_name.lower():
                    ws.cell(r, idx["Primary Type"]).value = "Camping"
                    ws.cell(r, idx["Secondary Type"]).value = "Accommodation"
                    ws.cell(r, idx["Services"]).value = append_service(ws.cell(r, idx["Services"]).value, "Camping")
                else:
                    ws.cell(r, idx["Primary Type"]).value = "Accommodation"
                    ws.cell(r, idx["Secondary Type"]).value = "Budget Stay"

                addr = address_from_tags(t)
                if not ws.cell(r, idx["Address"]).value and addr:
                    ws.cell(r, idx["Address"]).value = addr
                phone = t.get("phone") or t.get("contact:phone")
                website = t.get("website") or t.get("contact:website")
                hours = t.get("opening_hours")
                if not ws.cell(r, idx["Phone"]).value and phone:
                    ws.cell(r, idx["Phone"]).value = str(phone)
                if not ws.cell(r, idx["Website"]).value and website:
                    ws.cell(r, idx["Website"]).value = str(website)
                if not ws.cell(r, idx["Opening Hours"]).value and hours:
                    ws.cell(r, idx["Opening Hours"]).value = str(hours)

                note = "Budget-focused accommodation match near POI."
                if stay_d is not None:
                    note = f"Budget-focused accommodation match about {int(round(stay_d))} m from POI."
                ws.cell(r, idx["Route Notes"]).value = note
                ws.cell(r, idx["Confidence"]).value = "Medium"
                add_source(src, new_name, q_all, t)
                changed = True

        # Add nearby town/village info and nearby services for all POIs.
        svc = ws.cell(r, idx["Services"]).value

        if place_best is not None and place_d is not None:
            t = tags(place_best)
            place_name = str(t.get("name") or "")
            place_type = str(t.get("place") or "")
            if place_name:
                svc = append_service(svc, f"Nearest settlement: {place_name} ({place_type})")
                add_source(src, name, q_all, t)
                changed = True

        if food_best is not None and food_d is not None:
            t = tags(food_best)
            f_name = str(t.get("name") or "")
            if f_name:
                svc = append_service(svc, f"Nearby budget food/shop: {f_name} ({int(round(food_d/1000,0))} km)")
                if not ws.cell(r, idx["Address"]).value:
                    addr = address_from_tags(t)
                    if addr:
                        ws.cell(r, idx["Address"]).value = addr
                if not ws.cell(r, idx["Phone"]).value:
                    p = t.get("phone") or t.get("contact:phone")
                    if p:
                        ws.cell(r, idx["Phone"]).value = str(p)
                if not ws.cell(r, idx["Website"]).value:
                    w = t.get("website") or t.get("contact:website")
                    if w:
                        ws.cell(r, idx["Website"]).value = str(w)
                add_source(src, name, q_all, t)
                changed = True

        if stay_best is not None and stay_d is not None:
            t = tags(stay_best)
            s_name = str(t.get("name") or "")
            if s_name:
                svc = append_service(svc, f"Nearby budget stay: {s_name} ({int(round(stay_d/1000,0))} km)")
                add_source(src, name, q_all, t)
                changed = True

        if support_best is not None and support_d is not None:
            t = tags(support_best)
            su_name = str(t.get("name") or "")
            if su_name:
                key = str(t.get("amenity") or t.get("shop") or "support")
                svc = append_service(svc, f"Nearby {key}: {su_name} ({int(round(support_d/1000,0))} km)")
                add_source(src, name, q_all, t)
                changed = True

        if svc:
            ws.cell(r, idx["Services"]).value = svc

        # Fill explicit Not confirmed only when still empty.
        if not ws.cell(r, idx["Address"]).value:
            ws.cell(r, idx["Address"]).value = "Not confirmed"
        if not ws.cell(r, idx["Phone"]).value:
            ws.cell(r, idx["Phone"]).value = "Not confirmed"
        if not ws.cell(r, idx["Website"]).value:
            ws.cell(r, idx["Website"]).value = "Not confirmed"

        if changed:
            if not ws.cell(r, idx["Confidence"]).value or ws.cell(r, idx["Confidence"]).value == "Low":
                ws.cell(r, idx["Confidence"]).value = "Medium"
            updated_rows += 1

    wb.save(OUT_FILE)
    print(f"Updated rows: {updated_rows}")
    print(f"Output: {OUT_FILE}")


if __name__ == "__main__":
    main()
