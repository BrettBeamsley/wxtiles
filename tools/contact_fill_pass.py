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

IN_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_deep_v5.xlsx")
OUT_FILE = Path("greatsouthernbrevet2021_route_poi_workbook_enriched_deep_v6.xlsx")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class LookupClient:
    def __init__(self) -> None:
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": "wxtiles-contact-fill/1.0"})
        self.last_nominatim = 0.0

    def overpass(self, query: str, timeout: float = 20.0) -> list[dict[str, Any]]:
        for attempt in range(4):
            try:
                time.sleep(0.8)
                r = self.s.get(
                    "https://overpass-api.de/api/interpreter",
                    params={"data": query},
                    timeout=timeout,
                )
                if r.status_code == 200:
                    j = r.json()
                    elems = j.get("elements") if isinstance(j.get("elements"), list) else []
                    return [e for e in elems if isinstance(e, dict)]
                if r.status_code in {429, 504} and attempt < 3:
                    time.sleep(1.2 * (attempt + 1))
                    continue
                return []
            except (requests.RequestException, ValueError):
                if attempt < 3:
                    time.sleep(0.9 * (attempt + 1))
                    continue
                return []
        return []

    def nominatim(self, q: str) -> list[dict[str, Any]]:
        for attempt in range(3):
            try:
                elapsed = time.time() - self.last_nominatim
                if elapsed < 1.1:
                    time.sleep(1.1 - elapsed)
                r = self.s.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": q,
                        "format": "jsonv2",
                        "countrycodes": "nz",
                        "addressdetails": 1,
                        "namedetails": 1,
                        "extratags": 1,
                        "limit": 5,
                    },
                    timeout=12,
                )
                self.last_nominatim = time.time()
                if r.status_code == 200:
                    j = r.json()
                    if isinstance(j, list):
                        return [x for x in j if isinstance(x, dict)]
                    return []
                if r.status_code == 429 and attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                return []
            except (requests.RequestException, ValueError):
                if attempt < 2:
                    time.sleep(0.8 * (attempt + 1))
                    continue
                return []
        return []


def elem_lat_lon(e: dict[str, Any]) -> tuple[float | None, float | None]:
    if "lat" in e and "lon" in e:
        return float(e["lat"]), float(e["lon"])
    c = e.get("center") if isinstance(e.get("center"), dict) else None
    if c and "lat" in c and "lon" in c:
        return float(c["lat"]), float(c["lon"])
    return None, None


def tags(e: dict[str, Any]) -> dict[str, Any]:
    return e.get("tags") if isinstance(e.get("tags"), dict) else {}


def addr_from_tags(t: dict[str, Any]) -> str | None:
    parts = [t.get("addr:housenumber"), t.get("addr:street"), t.get("addr:city"), t.get("addr:country")]
    s = ", ".join(str(p) for p in parts if p)
    return s if s else None


def choose_candidate(name: str, lat: float, lon: float, overpass_elems: list[dict[str, Any]], nominatim_rows: list[dict[str, Any]]) -> tuple[str | None, str | None, str | None, str | None]:
    nlower = name.lower()
    best = None
    best_score = -1.0

    for e in overpass_elems:
        t = tags(e)
        ename = str(t.get("name") or "")
        if not ename:
            continue
        elat, elon = elem_lat_lon(e)
        if elat is None or elon is None:
            continue
        d = haversine_m(lat, lon, elat, elon)
        score = max(0.0, 20000 - d) / 150.0
        if ename.lower() in nlower or nlower in ename.lower():
            score += 20
        if t.get("phone") or t.get("contact:phone"):
            score += 6
        if t.get("website") or t.get("contact:website"):
            score += 6
        if addr_from_tags(t):
            score += 4
        if score > best_score:
            best_score = score
            best = (addr_from_tags(t), str(t.get("phone") or t.get("contact:phone") or "") or None, str(t.get("website") or t.get("contact:website") or "") or None, "Overpass API (OpenStreetMap)")

    for row in nominatim_rows:
        ename = str((row.get("namedetails") or {}).get("name") if isinstance(row.get("namedetails"), dict) else row.get("name") or "")
        try:
            rlat = float(row.get("lat"))
            rlon = float(row.get("lon"))
        except (TypeError, ValueError):
            continue
        d = haversine_m(lat, lon, rlat, rlon)
        score = max(0.0, 20000 - d) / 180.0
        if ename and (ename.lower() in nlower or nlower in ename.lower()):
            score += 20
        extratags = row.get("extratags") if isinstance(row.get("extratags"), dict) else {}
        phone = extratags.get("phone") or extratags.get("contact:phone")
        web = extratags.get("website") or extratags.get("contact:website")
        if phone:
            score += 6
        if web:
            score += 6
        addr = row.get("display_name")
        if addr:
            score += 3
        if score > best_score:
            best_score = score
            best = (str(addr) if addr else None, str(phone) if phone else None, str(web) if web else None, "OpenStreetMap Nominatim")

    if best is None:
        return None, None, None, None
    return best


def main() -> None:
    wb = load_workbook(IN_FILE)
    ws = wb["POI Master Table"]
    src = wb["Research Sources"]

    headers = [c.value for c in ws[1]]
    idx = {h: i + 1 for i, h in enumerate(headers)}

    client = LookupClient()

    updates = 0
    targets = 0

    for r in range(2, ws.max_row + 1):
        name = str(ws.cell(r, idx["POI Name"]).value or "")
        latv = ws.cell(r, idx["Latitude"]).value
        lonv = ws.cell(r, idx["Longitude"]).value
        if latv is None or lonv is None:
            continue

        address = str(ws.cell(r, idx["Address"]).value or "")
        phone = str(ws.cell(r, idx["Phone"]).value or "")
        web = str(ws.cell(r, idx["Website"]).value or "")

        needs = (address in {"", "Not confirmed"}) or (phone in {"", "Not confirmed"}) or (web in {"", "Not confirmed"})
        if not needs:
            continue

        targets += 1
        lat = float(latv)
        lon = float(lonv)
        print(f"target row {r}: {name}", flush=True)

        q = (
            "[out:json][timeout:25];("
            f"node(around:18000,{lat},{lon})[name];"
            f"way(around:18000,{lat},{lon})[name];"
            ");out tags center 40;"
        )
        op = client.overpass(q)
        no = client.nominatim(f"{name} New Zealand")

        new_addr, new_phone, new_web, source_name = choose_candidate(name, lat, lon, op, no)
        if source_name is None:
            continue

        changed = False
        if (address in {"", "Not confirmed"}) and new_addr:
            ws.cell(r, idx["Address"]).value = new_addr
            changed = True
        if (phone in {"", "Not confirmed"}) and new_phone:
            ws.cell(r, idx["Phone"]).value = new_phone
            changed = True
        if (web in {"", "Not confirmed"}) and new_web:
            ws.cell(r, idx["Website"]).value = new_web
            changed = True

        if changed:
            updates += 1
            src.append(
                [
                    name,
                    "https://overpass-api.de/api/interpreter?data=" + quote_plus(q),
                    source_name,
                    "Contact/address backfill from secondary lookup",
                    dt.date.today().isoformat(),
                ]
            )

    wb.save(OUT_FILE)
    print(f"Targets checked: {targets}")
    print(f"Rows updated: {updates}")
    print(f"Output: {OUT_FILE}")


if __name__ == "__main__":
    main()
