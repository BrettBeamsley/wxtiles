#!/usr/bin/env python3
"""Build a GPX route workbook with POI metrics and enrichment.

Outputs a print-friendly .xlsx file with:
1) Route Summary
2) POI Master Table
3) Daily Planning View
4) Research Sources
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import gpxpy
import requests
from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

M_PER_KM = 1000.0


@dataclass
class RouteSample:
    lat: float
    lon: float
    ele: float | None
    cum_m: float


@dataclass
class SourceEvidence:
    poi_name: str
    source_url: str
    source_name: str
    extracted_info: str
    date_accessed: str


@dataclass
class POI:
    seq: int
    name: str
    lat: float
    lon: float
    description: str | None = None
    snapped_idx: int = 0
    dist_start_km: float = 0.0
    dist_prev_km: float | None = None
    dist_next_km: float | None = None
    gain_prev_m: int | None = None
    loss_prev_m: int | None = None
    gain_next_m: int | None = None
    loss_next_m: int | None = None
    primary_type: str = "Landmark"
    secondary_type: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    opening_hours: str | None = None
    services: str | None = None
    route_notes: str | None = None
    confidence: str = "Low"
    sources: list[SourceEvidence] = field(default_factory=list)


@dataclass
class EnrichmentConfig:
    enabled: bool
    targeted_only: bool
    timeout_s: float
    nominatim_email: str | None
    google_places_key: str | None
    overpass_radius_m: int
    wikipedia_enabled: bool


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def km_rounded(value_km: float | None) -> float | None:
    return None if value_km is None else round(value_km, 1)


def coord_rounded(value: float) -> float:
    return round(value, 6)


def normalize_hours(value: str | None) -> str | None:
    if not value:
        return None
    v = value.replace(";", " | ").replace("\n", " ").strip()
    return v or None


def parse_gpx(gpx_path: Path) -> tuple[Any, list[RouteSample], list[POI]]:
    with gpx_path.open("r", encoding="utf-8") as fp:
        gpx = gpxpy.parse(fp)

    points: list[Any] = []
    for track in gpx.tracks:
        for segment in track.segments:
            points.extend(segment.points)

    if not points:
        for route in gpx.routes:
            points.extend(route.points)

    if len(points) < 2:
        raise ValueError("GPX must contain at least two track/route points.")

    samples: list[RouteSample] = []
    cumulative = 0.0
    for i, pt in enumerate(points):
        if i > 0:
            prev = points[i - 1]
            cumulative += haversine_m(prev.latitude, prev.longitude, pt.latitude, pt.longitude)
        samples.append(
            RouteSample(
                lat=float(pt.latitude),
                lon=float(pt.longitude),
                ele=float(pt.elevation) if pt.elevation is not None else None,
                cum_m=cumulative,
            )
        )

    pois: list[POI] = []
    for i, wpt in enumerate(gpx.waypoints, start=1):
        pois.append(
            POI(
                seq=i,
                name=(wpt.name or f"POI {i}").strip(),
                lat=float(wpt.latitude),
                lon=float(wpt.longitude),
                description=(wpt.description or None),
            )
        )

    return gpx, samples, pois


def nearest_idx(route: list[RouteSample], lat: float, lon: float) -> int:
    best_idx = 0
    best_m = float("inf")
    for i, s in enumerate(route):
        d = haversine_m(lat, lon, s.lat, s.lon)
        if d < best_m:
            best_m = d
            best_idx = i
    return best_idx


def segment_gain_loss(route: list[RouteSample], start_idx: int, end_idx: int) -> tuple[int, int]:
    if start_idx > end_idx:
        start_idx, end_idx = end_idx, start_idx
    if start_idx == end_idx:
        return 0, 0

    gain = 0.0
    loss = 0.0
    prev_ele = route[start_idx].ele
    for i in range(start_idx + 1, end_idx + 1):
        current_ele = route[i].ele
        if prev_ele is not None and current_ele is not None:
            delta = current_ele - prev_ele
            if delta > 0:
                gain += delta
            elif delta < 0:
                loss += abs(delta)
        prev_ele = current_ele
    return int(round(gain)), int(round(loss))


def classify_from_tags(name: str, category: str | None, obj_type: str | None, tags: dict[str, Any]) -> tuple[str, str | None, list[str]]:
    searchable = " ".join(
        [
            name.lower(),
            (category or "").lower(),
            (obj_type or "").lower(),
            json.dumps(tags).lower(),
        ]
    )

    map_rules: list[tuple[list[str], str, str | None]] = [
        (["drinking_water", "water_point", "water"], "Water", None),
        (["cafe", "coffee"], "Cafe", "Food"),
        (["restaurant", "fast_food"], "Restaurant", "Food"),
        (["grocery", "convenience"], "Grocery Store", None),
        (["supermarket"], "Supermarket", "Grocery Store"),
        (["hotel"], "Hotel", "Accommodation"),
        (["motel"], "Motel", "Accommodation"),
        (["hostel"], "Hostel", "Accommodation"),
        (["camp", "camping", "caravan"], "Camping", "Accommodation"),
        (["doc", "department of conservation"], "DOC Campsite", "Camping"),
        (["shelter", "hut"], "Shelter", "Hut"),
        (["toilet", "toilets"], "Public Toilet", None),
        (["pharmacy"], "Pharmacy", "Medical"),
        (["hospital", "clinic", "medical"], "Medical", None),
        (["bike", "bicycle", "cycle"], "Bike Shop", "Mechanical Support"),
        (["visitor_centre", "information"], "Visitor Information", None),
        (["viewpoint", "scenic"], "Scenic Viewpoint", None),
        (["ferry"], "Ferry", "Transport"),
        (["train"], "Train Station", "Transport"),
        (["bus_stop", "bus"], "Bus Stop", "Transport"),
        (["atm", "bank"], "ATM", None),
        (["fuel", "petrol", "gas_station"], "Fuel", None),
        (["charging", "ev"], "Charging Station", None),
        (["police", "fire_station", "ambulance", "emergency"], "Emergency Services", None),
    ]

    primary = "Landmark"
    secondary = None
    for terms, p, s in map_rules:
        if any(t in searchable for t in terms):
            primary, secondary = p, s
            break

    services: list[str] = []
    tag_lookup = {str(k).lower(): str(v).lower() for k, v in tags.items()}

    if any(k in searchable for k in ["drinking_water", "water"]):
        services.append("Drinking water available")
    if any(k in searchable for k in ["restaurant", "cafe", "food", "supermarket", "grocery"]):
        services.append("Food available")
    if "coffee" in searchable or "cafe" in searchable:
        services.append("Coffee")
    if "toilet" in searchable:
        services.append("Toilets")
    if "shower" in searchable:
        services.append("Showers")
    if "bicycle_repair_station" in searchable or "bike" in searchable:
        services.append("Bike repair")
    if any(k in tag_lookup for k in ["socket:type2", "socket:type2_combo", "charging"]):
        services.append("Power charging")
    if primary in {"Hotel", "Motel", "Hostel", "Camping", "DOC Campsite", "Shelter"}:
        services.append("Accommodation")

    deduped = list(dict.fromkeys(services))
    return primary, secondary, deduped


class Enricher:
    def __init__(self, config: EnrichmentConfig):
        self.config = config
        self.session = requests.Session()
        self._search_cache: dict[str, list[dict[str, Any]]] = {}
        self._last_nominatim_request_ts = 0.0
        ua = "gpx-poi-workbook/2.0"
        if config.nominatim_email:
            ua = f"{ua} ({config.nominatim_email})"
        self.session.headers.update({"User-Agent": ua})

    def _get_json(self, url: str, params: dict[str, Any]) -> dict[str, Any] | list[Any] | None:
        is_nominatim = "nominatim.openstreetmap.org" in url
        retries = 3 if is_nominatim else 1

        for attempt in range(retries):
            try:
                if is_nominatim:
                    elapsed = time.time() - self._last_nominatim_request_ts
                    min_gap = 1.05
                    if elapsed < min_gap:
                        time.sleep(min_gap - elapsed)

                r = self.session.get(url, params=params, timeout=self.config.timeout_s)
                if is_nominatim:
                    self._last_nominatim_request_ts = time.time()

                if r.status_code == 429 and attempt < retries - 1:
                    time.sleep(1.2 * (attempt + 1))
                    continue

                if r.status_code != 200:
                    return None
                return r.json()
            except (requests.RequestException, ValueError):
                if attempt == retries - 1:
                    return None
                time.sleep(0.5 * (attempt + 1))

        return None

    def _add_source(self, poi: POI, name: str, url: str, info: str) -> None:
        poi.sources.append(
            SourceEvidence(
                poi_name=poi.name,
                source_name=name,
                source_url=url,
                extracted_info=info,
                date_accessed=dt.date.today().isoformat(),
            )
        )

    def _intent_from_name(self, poi_name: str) -> str | None:
        text = poi_name.lower()
        if any(k in text for k in ["food", "cafe", "grocery", "supermarket", "shop", "4 square", "four square"]):
            return "food"
        if any(k in text for k in ["accomodation", "accommodation", "hotel", "motel", "hostel", "holiday park"]):
            return "accommodation"
        if any(k in text for k in ["camp", "campground", "campsite", "doc"]):
            return "camping"
        return None

    def _locality_from_name(self, poi_name: str) -> str:
        cleaned = poi_name
        for token in [
            "Accomodation",
            "Accommodation",
            "Food",
            "Camping",
            "Campground",
            "Check-in",
            "GSB",
            "Final",
        ]:
            cleaned = cleaned.replace(token, "")
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -")
        return cleaned or poi_name

    def _search_nominatim(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        cache_key = f"{query}|{limit}"
        if cache_key in self._search_cache:
            return self._search_cache[cache_key]

        payload = self._get_json(
            "https://nominatim.openstreetmap.org/search",
            {
                "q": query,
                "format": "jsonv2",
                "countrycodes": "nz",
                "addressdetails": 1,
                "namedetails": 1,
                "extratags": 1,
                "limit": limit,
            },
        )
        if isinstance(payload, list):
            results = [p for p in payload if isinstance(p, dict)]
            self._search_cache[cache_key] = results
            return results
        self._search_cache[cache_key] = []
        return []

    def _search_photon(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        payload = self._get_json(
            "https://photon.komoot.io/api/",
            {
                "q": query,
                "lang": "en",
                "limit": limit,
            },
        )
        if not isinstance(payload, dict):
            return []
        features = payload.get("features") if isinstance(payload.get("features"), list) else []
        return [f for f in features if isinstance(f, dict)]

    def _candidate_score(self, cand: dict[str, Any], intent: str | None, locality: str) -> int:
        hay = " ".join(
            [
                str(cand.get("name") or ""),
                str(cand.get("display_name") or ""),
                str(cand.get("class") or ""),
                str(cand.get("type") or ""),
                json.dumps(cand.get("extratags") or {}),
            ]
        ).lower()

        score = 0
        if locality and locality.lower() in hay:
            score += 5

        if intent == "food":
            if any(k in hay for k in ["4 square", "four square"]):
                score += 30
            if any(k in hay for k in ["supermarket", "convenience", "grocery", "cafe", "restaurant", "food"]):
                score += 12
        elif intent == "accommodation":
            if "holiday park" in hay:
                score += 25
            if any(k in hay for k in ["camp", "campground", "motel", "hotel", "hostel", "lodge", "accommodation"]):
                score += 12
        elif intent == "camping":
            if any(k in hay for k in ["doc", "camp", "campground", "campsite", "holiday park"]):
                score += 14

        if cand.get("extratags"):
            score += 3
        if cand.get("display_name"):
            score += 2

        return score

    def _photon_score(self, feature: dict[str, Any], intent: str | None, locality: str) -> int:
        props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        hay = " ".join(
            [
                str(props.get("name") or ""),
                str(props.get("city") or ""),
                str(props.get("state") or ""),
                str(props.get("street") or ""),
                str(props.get("osm_key") or ""),
                str(props.get("osm_value") or ""),
            ]
        ).lower()

        score = 0
        if locality and locality.lower() in hay:
            score += 5
        if intent == "food":
            if any(k in hay for k in ["4 square", "four square"]):
                score += 30
            if any(k in hay for k in ["supermarket", "convenience", "grocery", "cafe", "restaurant", "food"]):
                score += 12
        elif intent == "accommodation":
            if "holiday park" in hay:
                score += 25
            if any(k in hay for k in ["camp", "campground", "motel", "hotel", "hostel", "accommodation"]):
                score += 12
        elif intent == "camping":
            if any(k in hay for k in ["doc", "camp", "campground", "campsite", "holiday park"]):
                score += 14
        return score

    def _apply_candidate(self, poi: POI, cand: dict[str, Any], source_name: str, source_query: str) -> dict[str, Any]:
        tags = cand.get("extratags") if isinstance(cand.get("extratags"), dict) else {}
        candidate_name = (
            (cand.get("namedetails") or {}).get("name")
            if isinstance(cand.get("namedetails"), dict)
            else None
        ) or cand.get("name")

        if candidate_name:
            poi.name = str(candidate_name).strip()
        poi.address = str(cand.get("display_name") or poi.address or "") or poi.address
        poi.phone = tags.get("phone") or tags.get("contact:phone") or poi.phone
        poi.email = tags.get("email") or tags.get("contact:email") or poi.email
        poi.website = tags.get("website") or tags.get("contact:website") or poi.website
        poi.opening_hours = normalize_hours(tags.get("opening_hours") or poi.opening_hours)

        poi_url = f"https://nominatim.openstreetmap.org/ui/search.html?q={requests.utils.quote(source_query)}"
        info = f"matched={cand.get('display_name')}; class={cand.get('class')}; type={cand.get('type')}"
        self._add_source(poi, source_name, poi_url, info)

        return {
            "category": cand.get("class"),
            "type": cand.get("type"),
            "tags": tags,
        }

    def _apply_photon_candidate(self, poi: POI, feature: dict[str, Any], source_query: str) -> dict[str, Any]:
        props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        coords = feature.get("geometry", {}).get("coordinates") if isinstance(feature.get("geometry"), dict) else []

        feature_name = props.get("name")
        if feature_name:
            poi.name = str(feature_name).strip()

        address_parts = [
            props.get("housenumber"),
            props.get("street"),
            props.get("city"),
            props.get("country"),
        ]
        composed = ", ".join([str(p) for p in address_parts if p])
        if composed:
            poi.address = composed

        if isinstance(coords, list) and len(coords) >= 2:
            poi.lat = float(coords[1])
            poi.lon = float(coords[0])

        src_url = f"https://photon.komoot.io/api/?q={requests.utils.quote(source_query)}"
        info = f"name={props.get('name')}; key={props.get('osm_key')}; value={props.get('osm_value')}"
        self._add_source(poi, "Komoot Photon", src_url, info)

        return {
            "category": props.get("osm_key"),
            "type": props.get("osm_value"),
            "tags": {},
        }

    def _targeted_service_search(self, poi: POI) -> dict[str, Any]:
        intent = self._intent_from_name(poi.name)
        if not intent:
            return {}

        locality = self._locality_from_name(poi.name)

        if intent == "food":
            queries = [
                f"{locality} 4 square",
                f"{locality} supermarket",
                f"{locality} cafe",
            ]
        elif intent == "accommodation":
            queries = [
                f"{locality} holiday park",
                f"{locality} campground",
                f"{locality} motel",
            ]
        else:
            queries = [
                f"{locality} campground",
                f"{locality} doc campsite",
                f"{locality} holiday park",
            ]

        best: tuple[int, dict[str, Any], str] | None = None
        best_photon: tuple[int, dict[str, Any], str] | None = None
        for query in queries:
            for feature in self._search_photon(query, limit=3):
                score = self._photon_score(feature, intent, locality)
                if best_photon is None or score > best_photon[0]:
                    best_photon = (score, feature, query)
                if best_photon and best_photon[0] >= 30:
                    break

            # When Photon already has a solid match, avoid extra Nominatim traffic.
            if best_photon and best_photon[0] >= 20:
                if best_photon[0] >= 30:
                    break
                continue

            results = self._search_nominatim(query, limit=3)
            for cand in results:
                score = self._candidate_score(cand, intent, locality)
                if best is None or score > best[0]:
                    best = (score, cand, query)
                if best and best[0] >= 30:
                    break
            if (best and best[0] >= 30) or (best_photon and best_photon[0] >= 30):
                break

        if best_photon and best_photon[0] >= 12:
            return self._apply_photon_candidate(poi, best_photon[1], best_photon[2])

        if best and best[0] >= 12:
            return self._apply_candidate(
                poi,
                best[1],
                "Nominatim Targeted Search",
                best[2],
            )
        return {}

    def _enrich_nominatim(self, poi: POI) -> dict[str, Any]:
        payload = self._get_json(
            "https://nominatim.openstreetmap.org/reverse",
            {
                "lat": poi.lat,
                "lon": poi.lon,
                "format": "jsonv2",
                "zoom": 18,
                "addressdetails": 1,
                "namedetails": 1,
                "extratags": 1,
            },
        )
        if not isinstance(payload, dict):
            return {}

        tags = payload.get("extratags") if isinstance(payload.get("extratags"), dict) else {}
        namedetails = payload.get("namedetails") if isinstance(payload.get("namedetails"), dict) else {}
        reverse_name = (namedetails.get("name") or payload.get("name") or "").strip()
        current_is_placeholder = any(
            k in poi.name.lower()
            for k in ["poi ", "food", "accomodation", "accommodation", "campground", "camping"]
        )
        if reverse_name and current_is_placeholder:
            poi.name = reverse_name
        poi.address = payload.get("display_name") or poi.address
        poi.phone = tags.get("phone") or tags.get("contact:phone") or poi.phone
        poi.email = tags.get("email") or tags.get("contact:email") or poi.email
        poi.website = tags.get("website") or tags.get("contact:website") or poi.website
        poi.opening_hours = normalize_hours(tags.get("opening_hours") or poi.opening_hours)

        url = f"https://nominatim.openstreetmap.org/ui/reverse.html?lat={poi.lat}&lon={poi.lon}"
        info = f"category={payload.get('category')}; type={payload.get('type')}"
        self._add_source(poi, "OpenStreetMap Nominatim", url, info)
        return {
            "category": payload.get("category"),
            "type": payload.get("type"),
            "tags": tags,
        }

    def _enrich_overpass(self, poi: POI) -> dict[str, Any]:
        intent = self._intent_from_name(poi.name)
        around = f"around:{self.config.overpass_radius_m},{poi.lat},{poi.lon}"
        if intent == "food":
            clauses = [
                f"node({around})[shop~\"supermarket|convenience|greengrocer\"];",
                f"way({around})[shop~\"supermarket|convenience|greengrocer\"];",
                f"node({around})[amenity~\"cafe|restaurant|fast_food\"];",
                f"way({around})[amenity~\"cafe|restaurant|fast_food\"];",
            ]
        elif intent in {"accommodation", "camping"}:
            clauses = [
                f"node({around})[tourism~\"camp_site|caravan_site|hotel|motel|hostel|guest_house\"];",
                f"way({around})[tourism~\"camp_site|caravan_site|hotel|motel|hostel|guest_house\"];",
            ]
        else:
            clauses = [
                f"node({around})[amenity];",
                f"way({around})[amenity];",
                f"node({around})[shop];",
                f"way({around})[shop];",
                f"node({around})[tourism];",
                f"way({around})[tourism];",
            ]

        query = "[out:json][timeout:25];(" + "".join(clauses) + ");out tags center 5;"
        payload = self._get_json("https://overpass-api.de/api/interpreter", {"data": query})
        if not isinstance(payload, dict):
            return {}

        elements = payload.get("elements") if isinstance(payload.get("elements"), list) else []
        if not elements:
            return {}

        tags: dict[str, Any] = {}
        first_name = None
        for item in elements:
            t = item.get("tags") if isinstance(item.get("tags"), dict) else {}
            if not first_name and t.get("name"):
                first_name = str(t.get("name"))
            for k, v in t.items():
                if k not in tags and v is not None:
                    tags[k] = str(v)

        intent = self._intent_from_name(poi.name)
        if first_name and intent is None and not poi.name.lower().startswith("poi "):
            pass
        elif first_name:
            poi.name = first_name

        poi.phone = tags.get("phone") or tags.get("contact:phone") or poi.phone
        poi.email = tags.get("email") or tags.get("contact:email") or poi.email
        poi.website = tags.get("website") or tags.get("contact:website") or poi.website
        poi.opening_hours = normalize_hours(tags.get("opening_hours") or poi.opening_hours)

        url = f"https://overpass-turbo.eu/?Q={requests.utils.quote(query)}"
        info = f"Nearby OSM elements scanned ({len(elements)} matches)"
        self._add_source(poi, "Overpass API (OSM)", url, info)
        return {"tags": tags, "category": tags.get("amenity"), "type": tags.get("tourism") or tags.get("shop")}

    def _enrich_wikipedia(self, poi: POI) -> None:
        if not self.config.wikipedia_enabled:
            return

        payload = self._get_json(
            "https://en.wikipedia.org/w/api.php",
            {
                "action": "query",
                "format": "json",
                "list": "geosearch",
                "gscoord": f"{poi.lat}|{poi.lon}",
                "gsradius": 400,
                "gslimit": 1,
            },
        )
        if not isinstance(payload, dict):
            return

        results = payload.get("query", {}).get("geosearch", [])
        if not isinstance(results, list) or not results:
            return

        top = results[0]
        title = top.get("title")
        if not title:
            return

        encoded_title = requests.utils.quote(str(title).replace(" ", "_"))
        url = f"https://en.wikipedia.org/wiki/{encoded_title}"
        self._add_source(poi, "Wikipedia GeoSearch", url, f"Nearest page: {title}")

    def _enrich_google_places(self, poi: POI) -> None:
        if not self.config.google_places_key:
            return

        payload = self._get_json(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
            {
                "key": self.config.google_places_key,
                "location": f"{poi.lat},{poi.lon}",
                "radius": 120,
            },
        )
        if not isinstance(payload, dict):
            return

        results = payload.get("results") if isinstance(payload.get("results"), list) else []
        if not results:
            return

        top = results[0]
        top_name = top.get("name")
        if top_name and poi.name.lower().startswith("poi "):
            poi.name = str(top_name)

        address = top.get("vicinity")
        if address and not poi.address:
            poi.address = str(address)

        place_id = top.get("place_id")
        if place_id:
            maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            self._add_source(poi, "Google Places Nearby Search", maps_url, "Nearby candidate lookup")

    def enrich(self, poi: POI) -> None:
        intent = self._intent_from_name(poi.name)
        if self.config.targeted_only and not intent:
            return

        combined_tags: dict[str, Any] = {}
        meta: dict[str, Any] = {}

        targeted = self._targeted_service_search(poi)
        if targeted:
            meta.update({k: v for k, v in targeted.items() if k != "tags"})
            if isinstance(targeted.get("tags"), dict):
                combined_tags.update(targeted["tags"])
            if self.config.targeted_only:
                primary, secondary, service_list = classify_from_tags(
                    poi.name,
                    str(meta.get("category") or ""),
                    str(meta.get("type") or ""),
                    combined_tags,
                )
                poi.primary_type = primary
                poi.secondary_type = secondary
                if service_list:
                    poi.services = ", ".join(service_list)
                elif poi.description and not poi.services:
                    poi.services = poi.description

                unique_sources = len({s.source_name for s in poi.sources})
                poi.confidence = "Medium" if unique_sources >= 1 else "Low"
                return

        nom = self._enrich_nominatim(poi)
        if nom:
            meta.update({k: v for k, v in nom.items() if k != "tags"})
            if isinstance(nom.get("tags"), dict):
                combined_tags.update(nom["tags"])

        if not self.config.targeted_only:
            over = self._enrich_overpass(poi)
            if over:
                if not meta.get("category") and over.get("category"):
                    meta["category"] = over.get("category")
                if not meta.get("type") and over.get("type"):
                    meta["type"] = over.get("type")
                if isinstance(over.get("tags"), dict):
                    combined_tags.update(over["tags"])

        if len({s.source_name for s in poi.sources}) < 2:
            self._enrich_wikipedia(poi)
        self._enrich_google_places(poi)

        primary, secondary, service_list = classify_from_tags(
            poi.name,
            str(meta.get("category") or ""),
            str(meta.get("type") or ""),
            combined_tags,
        )
        poi.primary_type = primary
        poi.secondary_type = secondary

        if service_list:
            poi.services = ", ".join(service_list)
        elif poi.description and not poi.services:
            poi.services = poi.description

        quality_hits = 0
        if poi.address:
            quality_hits += 1
        if poi.website:
            quality_hits += 1
        if poi.opening_hours:
            quality_hits += 1
        if poi.phone or poi.email:
            quality_hits += 1

        unique_sources = len({s.source_name for s in poi.sources})
        if unique_sources >= 3 and quality_hits >= 2:
            poi.confidence = "High"
        elif unique_sources >= 2:
            poi.confidence = "Medium"
        else:
            poi.confidence = "Low"


def apply_route_metrics(route: list[RouteSample], pois: list[POI]) -> None:
    if not pois:
        return

    for poi in pois:
        idx = nearest_idx(route, poi.lat, poi.lon)
        poi.snapped_idx = idx
        poi.dist_start_km = km_rounded(route[idx].cum_m / M_PER_KM) or 0.0

    pois.sort(key=lambda p: p.snapped_idx)
    for i, poi in enumerate(pois, start=1):
        poi.seq = i

    for i, poi in enumerate(pois):
        if i > 0:
            prev = pois[i - 1]
            prev_m = route[prev.snapped_idx].cum_m
            cur_m = route[poi.snapped_idx].cum_m
            poi.dist_prev_km = km_rounded((cur_m - prev_m) / M_PER_KM)
            gain, loss = segment_gain_loss(route, prev.snapped_idx, poi.snapped_idx)
            poi.gain_prev_m = gain
            poi.loss_prev_m = loss

        if i < len(pois) - 1:
            nxt = pois[i + 1]
            cur_m = route[poi.snapped_idx].cum_m
            nxt_m = route[nxt.snapped_idx].cum_m
            poi.dist_next_km = km_rounded((nxt_m - cur_m) / M_PER_KM)
            gain, loss = segment_gain_loss(route, poi.snapped_idx, nxt.snapped_idx)
            poi.gain_next_m = gain
            poi.loss_next_m = loss


def add_route_notes(pois: list[POI], long_gap_km: float = 30.0) -> None:
    for i, poi in enumerate(pois):
        notes: list[str] = []

        if poi.primary_type == "Water":
            if poi.dist_next_km and poi.dist_next_km >= long_gap_km:
                notes.append(f"Last reliable water before next {poi.dist_next_km:.1f} km section.")
            else:
                notes.append("Water point; verify seasonal reliability.")

        if poi.primary_type in {"Camping", "DOC Campsite", "Hotel", "Motel", "Hostel", "Shelter"}:
            notes.append("Accommodation stop; bookings recommended in peak periods.")

        if poi.primary_type in {"Cafe", "Restaurant", "Grocery Store", "Supermarket"}:
            if poi.dist_next_km and poi.dist_next_km >= long_gap_km:
                notes.append("Limited food supply after this stop.")
            else:
                notes.append("Food opportunity.")

        if poi.primary_type in {"Medical", "Pharmacy", "Emergency Services"}:
            notes.append("Critical support location; confirm opening hours before departure.")

        if not notes:
            notes.append("Not confirmed")

        poi.route_notes = " ".join(notes)


def fill_missing_fields(pois: list[POI]) -> None:
    for poi in pois:
        poi.opening_hours = normalize_hours(poi.opening_hours)


def route_totals(route: list[RouteSample]) -> tuple[float, int, int]:
    total_km = km_rounded(route[-1].cum_m / M_PER_KM) or 0.0
    gain, loss = segment_gain_loss(route, 0, len(route) - 1)
    return total_km, gain, loss


def style_header(ws: Any, row: int = 1) -> None:
    fill = PatternFill(start_color="111827", end_color="111827", fill_type="solid")
    for cell in ws[row]:
        cell.font = Font(color="FFFFFF", bold=True)
        cell.fill = fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def autosize(ws: Any, min_width: int = 10, max_width: int = 58) -> None:
    for col_idx, col_cells in enumerate(ws.columns, start=1):
        length = 0
        for cell in col_cells:
            value = "" if cell.value is None else str(cell.value)
            length = max(length, len(value))
        ws.column_dimensions[get_column_letter(col_idx)].width = min(max(length + 2, min_width), max_width)


def configure_print(ws: Any) -> None:
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = "1:1"


def yes_flag(poi: POI, keywords: list[str]) -> str:
    haystack = " ".join(
        [
            poi.primary_type or "",
            poi.secondary_type or "",
            poi.services or "",
        ]
    ).lower()
    return "Yes" if any(k.lower() in haystack for k in keywords) else ""


def add_master_conditional_formatting(ws: Any, max_row: int) -> None:
    if max_row < 2:
        return

    rng = f"A2:T{max_row}"
    rules = [
        ("OR(ISNUMBER(SEARCH(\"Food\",$C2)),ISNUMBER(SEARCH(\"Cafe\",$C2)),ISNUMBER(SEARCH(\"Restaurant\",$C2)))", "FFFDE68A"),
        ("OR(ISNUMBER(SEARCH(\"Accommodation\",$C2)),ISNUMBER(SEARCH(\"Camping\",$C2)),ISNUMBER(SEARCH(\"Hotel\",$C2)),ISNUMBER(SEARCH(\"Hostel\",$C2)),ISNUMBER(SEARCH(\"Motel\",$C2)))", "FFBFDBFE"),
        ("ISNUMBER(SEARCH(\"Water\",$C2))", "FFBBF7D0"),
        ("OR(ISNUMBER(SEARCH(\"Medical\",$C2)),ISNUMBER(SEARCH(\"Pharmacy\",$C2)))", "FFFECACA"),
        ("ISNUMBER(SEARCH(\"Emergency Services\",$C2))", "FFFCA5A5"),
    ]

    for formula, color in rules:
        ws.conditional_formatting.add(
            rng,
            FormulaRule(
                formula=[formula],
                fill=PatternFill(start_color=color, end_color=color, fill_type="solid"),
            ),
        )


def build_workbook(gpx_obj: Any, route: list[RouteSample], pois: list[POI], output_xlsx: Path) -> None:
    wb = Workbook()

    summary = wb.active
    summary.title = "Route Summary"
    total_km, gain_m, loss_m = route_totals(route)

    summary_rows = [
        ["Route name", gpx_obj.name or output_xlsx.stem],
        ["Total distance", total_km],
        ["Total elevation gain", gain_m],
        ["Total elevation loss", loss_m],
        ["Number of POIs", len(pois)],
        ["Route start", f"{coord_rounded(route[0].lat)}, {coord_rounded(route[0].lon)}"],
        ["Route finish", f"{coord_rounded(route[-1].lat)}, {coord_rounded(route[-1].lon)}"],
    ]

    summary.append(["Metric", "Value"])
    for row in summary_rows:
        summary.append(row)

    style_header(summary)
    summary.freeze_panes = "A2"
    summary.auto_filter.ref = f"A1:B{summary.max_row}"
    autosize(summary, min_width=18)
    configure_print(summary)

    master = wb.create_sheet("POI Master Table")
    master_headers = [
        "Seq",
        "POI Name",
        "Primary Type",
        "Secondary Type",
        "Latitude",
        "Longitude",
        "Distance From Start (km)",
        "Distance From Previous POI (km)",
        "Distance To Next POI (km)",
        "Gain From Previous (m)",
        "Loss From Previous (m)",
        "Gain To Next (m)",
        "Loss To Next (m)",
        "Address",
        "Phone",
        "Website",
        "Opening Hours",
        "Services",
        "Route Notes",
        "Confidence",
    ]
    master.append(master_headers)

    for poi in pois:
        master.append(
            [
                poi.seq,
                poi.name,
                poi.primary_type,
                poi.secondary_type or "",
                coord_rounded(poi.lat),
                coord_rounded(poi.lon),
                poi.dist_start_km,
                poi.dist_prev_km,
                poi.dist_next_km,
                poi.gain_prev_m,
                poi.loss_prev_m,
                poi.gain_next_m,
                poi.loss_next_m,
                poi.address or "",
                poi.phone or "",
                poi.website or "",
                poi.opening_hours or "",
                poi.services or "",
                poi.route_notes or "Not confirmed",
                poi.confidence,
            ]
        )

    style_header(master)
    master.freeze_panes = "A2"
    master.auto_filter.ref = f"A1:T{master.max_row}"
    for row in master.iter_rows(min_row=2, min_col=5, max_col=6):
        for cell in row:
            cell.number_format = "0.000000"
    autosize(master)
    add_master_conditional_formatting(master, master.max_row)
    configure_print(master)

    daily = wb.create_sheet("Daily Planning View")
    daily_headers = [
        "Distance",
        "POI",
        "Type",
        "Food",
        "Water",
        "Accommodation",
        "Opening Hours",
        "Notes",
    ]
    daily.append(daily_headers)

    for poi in pois:
        daily.append(
            [
                poi.dist_start_km,
                poi.name,
                poi.primary_type,
                yes_flag(poi, ["food", "cafe", "restaurant", "grocery", "supermarket"]),
                yes_flag(poi, ["water", "drinking"]),
                yes_flag(poi, ["accommodation", "camp", "hotel", "motel", "hostel", "shelter"]),
                poi.opening_hours or "",
                poi.route_notes or "Not confirmed",
            ]
        )

    style_header(daily)
    daily.freeze_panes = "A2"
    daily.auto_filter.ref = f"A1:H{daily.max_row}"
    autosize(daily)
    configure_print(daily)

    src = wb.create_sheet("Research Sources")
    src_headers = ["POI", "Source URL", "Source Name", "Information extracted", "Date accessed"]
    src.append(src_headers)

    for poi in pois:
        if not poi.sources:
            src.append(
                [
                    poi.name,
                    "",
                    "",
                    "Not confirmed",
                    dt.date.today().isoformat(),
                ]
            )
            continue

        for ev in poi.sources:
            src.append([ev.poi_name, ev.source_url, ev.source_name, ev.extracted_info, ev.date_accessed])

    style_header(src)
    src.freeze_panes = "A2"
    src.auto_filter.ref = f"A1:E{src.max_row}"
    autosize(src)
    configure_print(src)

    wb.save(output_xlsx)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate GPX route workbook with enriched POIs.")
    p.add_argument("gpx", type=Path, help="Input GPX file path")
    p.add_argument("-o", "--output", type=Path, default=Path("route_poi_workbook.xlsx"), help="Output .xlsx path")
    p.add_argument("--enrich", action="store_true", help="Enable internet enrichment and source logging")
    p.add_argument(
        "--enrich-targeted-only",
        action="store_true",
        help="Only enrich POIs that look like food/accommodation/camping service points",
    )
    p.add_argument("--nominatim-email", default=None, help="Contact email in User-Agent for Nominatim")
    p.add_argument("--google-places-key", default=None, help="Optional Google Places API key")
    p.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds")
    p.add_argument("--overpass-radius", type=int, default=100, help="Overpass search radius in metres")
    p.add_argument("--no-wikipedia", action="store_true", help="Disable Wikipedia geosearch enrichment")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    gpx_obj, route, pois = parse_gpx(args.gpx)

    apply_route_metrics(route, pois)

    cfg = EnrichmentConfig(
        enabled=args.enrich,
        targeted_only=args.enrich_targeted_only,
        timeout_s=args.timeout,
        nominatim_email=args.nominatim_email,
        google_places_key=args.google_places_key,
        overpass_radius_m=args.overpass_radius,
        wikipedia_enabled=(not args.no_wikipedia),
    )

    if cfg.enabled:
        enricher = Enricher(cfg)
        for poi in pois:
            enricher.enrich(poi)

    fill_missing_fields(pois)
    add_route_notes(pois)
    build_workbook(gpx_obj, route, pois, args.output)
    print(f"Workbook generated: {args.output}")


if __name__ == "__main__":
    main()
