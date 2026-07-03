#!/usr/bin/env python3
"""Generate a route planning workbook from a GPX file.

The workbook includes:
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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import gpxpy
import requests
from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


METERS_PER_KM = 1000.0


@dataclass
class RoutePoint:
    lat: float
    lon: float
    ele: float | None
    cum_dist_m: float


@dataclass
class SourceRecord:
    poi_name: str
    source_url: str
    source_name: str
    extracted_info: str
    accessed_date: str


@dataclass
class POIRecord:
    seq: int
    name: str
    lat: float
    lon: float
    gpx_description: str | None = None
    snapped_index: int = 0
    distance_from_start_km: float = 0.0
    distance_from_previous_km: float | None = None
    distance_to_next_km: float | None = None
    gain_from_previous_m: int | None = None
    loss_from_previous_m: int | None = None
    gain_to_next_m: int | None = None
    loss_to_next_m: int | None = None
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
    sources: list[SourceRecord] = field(default_factory=list)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def round_km(value_km: float | None) -> float | None:
    if value_km is None:
        return None
    return round(value_km, 1)


def normalize_opening_hours(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.replace(";", " | ").replace("\n", " ").strip()
    return normalized or None


def parse_gpx(gpx_path: Path) -> tuple[Any, list[RoutePoint], list[POIRecord]]:
    with gpx_path.open("r", encoding="utf-8") as f:
        gpx = gpxpy.parse(f)

    raw_points: list[Any] = []
    for track in gpx.tracks:
        for segment in track.segments:
            raw_points.extend(segment.points)

    if not raw_points:
        for route in gpx.routes:
            raw_points.extend(route.points)

    if len(raw_points) < 2:
        raise ValueError("GPX must contain at least 2 route/track points.")

    route_points: list[RoutePoint] = []
    cum_dist = 0.0
    for idx, point in enumerate(raw_points):
        if idx > 0:
            prev = raw_points[idx - 1]
            cum_dist += haversine_m(prev.latitude, prev.longitude, point.latitude, point.longitude)
        route_points.append(
            RoutePoint(
                lat=float(point.latitude),
                lon=float(point.longitude),
                ele=float(point.elevation) if point.elevation is not None else None,
                cum_dist_m=cum_dist,
            )
        )

    pois: list[POIRecord] = []
    for idx, wpt in enumerate(gpx.waypoints, start=1):
        pois.append(
            POIRecord(
                seq=idx,
                name=(wpt.name or f"POI {idx}").strip(),
                lat=float(wpt.latitude),
                lon=float(wpt.longitude),
                gpx_description=(wpt.description or None),
            )
        )

    return gpx, route_points, pois


def nearest_route_index(route_points: list[RoutePoint], lat: float, lon: float) -> int:
    best_idx = 0
    best_dist = float("inf")
    for idx, p in enumerate(route_points):
        d = haversine_m(lat, lon, p.lat, p.lon)
        if d < best_dist:
            best_dist = d
            best_idx = idx
    return best_idx


def calc_gain_loss(route_points: list[RoutePoint], i_start: int, i_end: int) -> tuple[int, int]:
    if i_start == i_end:
        return 0, 0

    if i_start > i_end:
        i_start, i_end = i_end, i_start

    gain = 0.0
    loss = 0.0
    prev_ele = route_points[i_start].ele
    for idx in range(i_start + 1, i_end + 1):
        curr_ele = route_points[idx].ele
        if prev_ele is not None and curr_ele is not None:
            delta = curr_ele - prev_ele
            if delta > 0:
                gain += delta
            elif delta < 0:
                loss += abs(delta)
        prev_ele = curr_ele

    return int(round(gain)), int(round(loss))


def classify_poi(
    poi_name: str,
    nominatim_category: str | None,
    nominatim_type: str | None,
    tags: dict[str, Any],
) -> tuple[str, str | None, list[str]]:
    text = " ".join(
        [
            poi_name.lower(),
            (nominatim_category or "").lower(),
            (nominatim_type or "").lower(),
            json.dumps(tags).lower(),
        ]
    )

    mapping: list[tuple[str, str, str | None]] = [
        ("drinking_water|water_point|water", "Water", None),
        ("toilets|public_toilet", "Public Toilet", None),
        ("supermarket", "Supermarket", "Grocery Store"),
        ("grocery|convenience", "Grocery Store", None),
        ("cafe", "Cafe", "Food"),
        ("restaurant|fast_food|food", "Restaurant", "Food"),
        ("camp|camping|caravan", "Camping", None),
        ("hut|shelter", "Shelter", "Hut"),
        ("hotel", "Hotel", "Accommodation"),
        ("motel", "Motel", "Accommodation"),
        ("hostel", "Hostel", "Accommodation"),
        ("pharmacy", "Pharmacy", "Medical"),
        ("hospital|clinic|medical", "Medical", None),
        ("bicycle|bike|cycle", "Bike Shop", "Mechanical Support"),
        ("viewpoint|scenic", "Scenic Viewpoint", None),
        ("bus_stop", "Bus Stop", "Transport"),
        ("ferry", "Ferry", "Transport"),
        ("fuel|petrol|gas_station", "Fuel", None),
        ("atm|bank", "ATM", None),
        ("police|fire_station|ambulance", "Emergency Services", None),
    ]

    primary = "Landmark"
    secondary = None
    for pattern, p, s in mapping:
        terms = pattern.split("|")
        if any(term in text for term in terms):
            primary = p
            secondary = s
            break

    services: list[str] = []
    service_map = {
        "drinking_water": "Drinking water available",
        "toilets": "Toilets",
        "shower": "Showers",
        "bicycle_repair_station": "Bike repair",
        "charging": "Power charging",
        "opening_hours": "Opening hours available",
    }

    lower_tags = {str(k).lower(): str(v).lower() for k, v in tags.items()}
    for key, label in service_map.items():
        if key in lower_tags or any(key in v for v in lower_tags.values()):
            services.append(label)

    if primary in {"Cafe", "Restaurant", "Supermarket", "Grocery Store"}:
        services.extend(["Food available"])
    if primary in {"Hotel", "Motel", "Hostel", "Camping", "Shelter"}:
        services.extend(["Accommodation"])
    if primary == "Water":
        services.extend(["Drinking water available"])

    # Preserve order while deduplicating.
    deduped_services = list(dict.fromkeys(services))
    return primary, secondary, deduped_services


class POIEnricher:
    def __init__(self, timeout_s: float = 15.0, email: str | None = None) -> None:
        user_agent = "gpx-route-analysis/1.0"
        if email:
            user_agent = f"{user_agent} ({email})"

        self.timeout_s = timeout_s
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})

    def _request_json(self, url: str, params: dict[str, Any]) -> dict[str, Any] | None:
        try:
            resp = self.session.get(url, params=params, timeout=self.timeout_s)
            if resp.status_code != 200:
                return None
            return resp.json()
        except requests.RequestException:
            return None

    def reverse_nominatim(self, lat: float, lon: float) -> dict[str, Any] | None:
        return self._request_json(
            "https://nominatim.openstreetmap.org/reverse",
            {
                "lat": lat,
                "lon": lon,
                "format": "jsonv2",
                "addressdetails": 1,
                "namedetails": 1,
                "extratags": 1,
                "zoom": 18,
            },
        )

    def wikidata_entity(self, wikidata_id: str) -> dict[str, Any] | None:
        return self._request_json(
            f"https://www.wikidata.org/wiki/Special:EntityData/{wikidata_id}.json",
            {},
        )

    def enrich(self, poi: POIRecord) -> None:
        accessed_date = dt.datetime.utcnow().date().isoformat()
        nom = self.reverse_nominatim(poi.lat, poi.lon)

        if nom:
            nom_name = (
                nom.get("namedetails", {}).get("name")
                or nom.get("name")
                or poi.name
            )
            poi.name = (nom_name or poi.name).strip()

            address_display = nom.get("display_name")
            if address_display:
                poi.address = address_display

            tags = nom.get("extratags", {}) if isinstance(nom.get("extratags"), dict) else {}
            poi.phone = tags.get("phone") or tags.get("contact:phone") or poi.phone
            poi.email = tags.get("email") or tags.get("contact:email") or poi.email
            poi.website = tags.get("website") or tags.get("contact:website") or poi.website
            poi.opening_hours = normalize_opening_hours(
                tags.get("opening_hours") or poi.opening_hours
            )

            primary, secondary, services = classify_poi(
                poi.name,
                nom.get("category"),
                nom.get("type"),
                tags,
            )
            poi.primary_type = primary
            poi.secondary_type = secondary
            if services:
                poi.services = ", ".join(services)

            nom_url = (
                f"https://nominatim.openstreetmap.org/ui/reverse.html?lat={poi.lat}&lon={poi.lon}"
            )
            poi.sources.append(
                SourceRecord(
                    poi_name=poi.name,
                    source_url=nom_url,
                    source_name="OpenStreetMap Nominatim",
                    extracted_info=(
                        f"category={nom.get('category')}, type={nom.get('type')}, "
                        f"address={poi.address or 'Not confirmed'}"
                    ),
                    accessed_date=accessed_date,
                )
            )

            wikidata_id = tags.get("wikidata")
            if wikidata_id:
                entity = self.wikidata_entity(wikidata_id)
                if entity:
                    entities = entity.get("entities", {})
                    if wikidata_id in entities:
                        label = (
                            entities[wikidata_id]
                            .get("labels", {})
                            .get("en", {})
                            .get("value")
                        )
                        if label and label.lower() not in poi.name.lower():
                            poi.route_notes = (
                                f"Wikidata reference available: {label}."
                                if not poi.route_notes
                                else poi.route_notes
                            )

                        poi.sources.append(
                            SourceRecord(
                                poi_name=poi.name,
                                source_url=f"https://www.wikidata.org/wiki/{wikidata_id}",
                                source_name="Wikidata",
                                extracted_info="Entity metadata cross-check",
                                accessed_date=accessed_date,
                            )
                        )

        if not poi.services and poi.gpx_description:
            poi.services = poi.gpx_description

        if not poi.route_notes:
            poi.route_notes = infer_route_note(poi)

        if len(poi.sources) >= 2:
            poi.confidence = "High"
        elif len(poi.sources) == 1:
            poi.confidence = "Medium"
        else:
            poi.confidence = "Low"


def infer_route_note(poi: POIRecord) -> str:
    if poi.primary_type in {"Water"}:
        return "Water point; verify reliability and seasonal availability."
    if poi.primary_type in {"Camping", "Hotel", "Motel", "Hostel", "Shelter"}:
        return "Accommodation stop; booking may be required in peak season."
    if poi.primary_type in {"Medical", "Pharmacy", "Emergency Services"}:
        return "Critical support location; confirm hours before departure."
    if poi.primary_type in {"Cafe", "Restaurant", "Supermarket", "Grocery Store"}:
        return "Food resupply point; operating hours should be rechecked."
    return "Not confirmed"


def apply_route_metrics(route_points: list[RoutePoint], pois: list[POIRecord]) -> None:
    if not pois:
        return

    for poi in pois:
        idx = nearest_route_index(route_points, poi.lat, poi.lon)
        poi.snapped_index = idx
        poi.distance_from_start_km = round_km(route_points[idx].cum_dist_m / METERS_PER_KM) or 0.0

    pois.sort(key=lambda p: p.snapped_index)
    for seq, poi in enumerate(pois, start=1):
        poi.seq = seq

    for i, poi in enumerate(pois):
        if i > 0:
            prev = pois[i - 1]
            dist_km = (
                route_points[poi.snapped_index].cum_dist_m
                - route_points[prev.snapped_index].cum_dist_m
            ) / METERS_PER_KM
            poi.distance_from_previous_km = round_km(dist_km)
            gain, loss = calc_gain_loss(route_points, prev.snapped_index, poi.snapped_index)
            poi.gain_from_previous_m = gain
            poi.loss_from_previous_m = loss

        if i < len(pois) - 1:
            nxt = pois[i + 1]
            dist_km = (
                route_points[nxt.snapped_index].cum_dist_m
                - route_points[poi.snapped_index].cum_dist_m
            ) / METERS_PER_KM
            poi.distance_to_next_km = round_km(dist_km)
            gain, loss = calc_gain_loss(route_points, poi.snapped_index, nxt.snapped_index)
            poi.gain_to_next_m = gain
            poi.loss_to_next_m = loss


def route_totals(route_points: list[RoutePoint]) -> tuple[float, int, int]:
    total_dist_km = route_points[-1].cum_dist_m / METERS_PER_KM
    gain, loss = calc_gain_loss(route_points, 0, len(route_points) - 1)
    return round_km(total_dist_km) or 0.0, gain, loss


def yes_no_for_service(poi: POIRecord, key_terms: Iterable[str]) -> str:
    haystack = " ".join(
        [
            (poi.primary_type or ""),
            (poi.secondary_type or ""),
            (poi.services or ""),
        ]
    ).lower()
    return "Yes" if any(term.lower() in haystack for term in key_terms) else ""


def style_header_row(ws: Any, row: int = 1) -> None:
    fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    for cell in ws[row]:
        cell.font = Font(color="FFFFFF", bold=True)
        cell.fill = fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def autosize_columns(ws: Any, min_width: int = 10, max_width: int = 50) -> None:
    for col_idx, col in enumerate(ws.columns, start=1):
        max_len = 0
        for cell in col:
            val = "" if cell.value is None else str(cell.value)
            max_len = max(max_len, len(val))
        ws.column_dimensions[get_column_letter(col_idx)].width = min(
            max(max_len + 2, min_width), max_width
        )


def add_conditional_formatting(ws: Any, max_row: int) -> None:
    if max_row < 2:
        return
    data_range = f"A2:V{max_row}"

    rules = [
        (
            "OR(ISNUMBER(SEARCH(\"Food\",$C2)),ISNUMBER(SEARCH(\"Cafe\",$C2)),ISNUMBER(SEARCH(\"Restaurant\",$C2)))",
            "FFFDE68A",
        ),
        (
            "OR(ISNUMBER(SEARCH(\"Accommodation\",$C2)),ISNUMBER(SEARCH(\"Hotel\",$C2)),ISNUMBER(SEARCH(\"Camping\",$C2)),ISNUMBER(SEARCH(\"Hostel\",$C2)))",
            "FFBFDBFE",
        ),
        (
            "ISNUMBER(SEARCH(\"Water\",$C2))",
            "FFBBF7D0",
        ),
        (
            "OR(ISNUMBER(SEARCH(\"Medical\",$C2)),ISNUMBER(SEARCH(\"Pharmacy\",$C2)))",
            "FFFECACA",
        ),
        (
            "ISNUMBER(SEARCH(\"Emergency Services\",$C2))",
            "FFFCA5A5",
        ),
    ]

    for formula, color in rules:
        ws.conditional_formatting.add(
            data_range,
            FormulaRule(
                formula=[formula],
                fill=PatternFill(start_color=color, end_color=color, fill_type="solid"),
            ),
        )


def configure_print(ws: Any) -> None:
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = "1:1"


def build_workbook(
    gpx_obj: Any,
    route_points: list[RoutePoint],
    pois: list[POIRecord],
    output_path: Path,
) -> None:
    wb = Workbook()

    ws_summary = wb.active
    ws_summary.title = "Route Summary"

    total_dist_km, total_gain_m, total_loss_m = route_totals(route_points)
    route_name = gpx_obj.name or output_path.stem

    summary_rows = [
        ("Route Name", route_name),
        ("Total Distance (km)", total_dist_km),
        ("Total Elevation Gain (m)", total_gain_m),
        ("Total Elevation Loss (m)", total_loss_m),
        ("Number of POIs", len(pois)),
        ("Route Start", f"{route_points[0].lat:.6f}, {route_points[0].lon:.6f}"),
        ("Route Finish", f"{route_points[-1].lat:.6f}, {route_points[-1].lon:.6f}"),
    ]
    ws_summary.append(["Metric", "Value"])
    for row in summary_rows:
        ws_summary.append(list(row))
    style_header_row(ws_summary, 1)
    ws_summary.freeze_panes = "A2"
    ws_summary.auto_filter.ref = f"A1:B{ws_summary.max_row}"
    autosize_columns(ws_summary, min_width=18)
    configure_print(ws_summary)

    ws_master = wb.create_sheet(title="POI Master Table")
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
    ws_master.append(master_headers)

    for poi in pois:
        ws_master.append(
            [
                poi.seq,
                poi.name,
                poi.primary_type,
                poi.secondary_type,
                round(poi.lat, 6),
                round(poi.lon, 6),
                poi.distance_from_start_km,
                poi.distance_from_previous_km,
                poi.distance_to_next_km,
                poi.gain_from_previous_m,
                poi.loss_from_previous_m,
                poi.gain_to_next_m,
                poi.loss_to_next_m,
                poi.address or "Not confirmed",
                poi.phone or "Not confirmed",
                poi.website or "Not confirmed",
                poi.opening_hours or "Not confirmed",
                poi.services or "Not confirmed",
                poi.route_notes or "Not confirmed",
                poi.confidence,
            ]
        )

    style_header_row(ws_master, 1)
    ws_master.freeze_panes = "A2"
    ws_master.auto_filter.ref = f"A1:T{ws_master.max_row}"
    for row in ws_master.iter_rows(min_row=2, min_col=5, max_col=6):
        for cell in row:
            cell.number_format = "0.000000"
    autosize_columns(ws_master)
    add_conditional_formatting(ws_master, ws_master.max_row)
    configure_print(ws_master)

    ws_daily = wb.create_sheet(title="Daily Planning View")
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
    ws_daily.append(daily_headers)
    for poi in pois:
        ws_daily.append(
            [
                poi.distance_from_start_km,
                poi.name,
                poi.primary_type,
                yes_no_for_service(poi, ["food", "cafe", "restaurant", "grocery", "supermarket"]),
                yes_no_for_service(poi, ["water", "drinking"]),
                yes_no_for_service(poi, ["accommodation", "camp", "hotel", "hostel", "motel", "shelter"]),
                poi.opening_hours or "Not confirmed",
                poi.route_notes or "Not confirmed",
            ]
        )

    style_header_row(ws_daily, 1)
    ws_daily.freeze_panes = "A2"
    ws_daily.auto_filter.ref = f"A1:H{ws_daily.max_row}"
    autosize_columns(ws_daily)
    configure_print(ws_daily)

    ws_sources = wb.create_sheet(title="Research Sources")
    source_headers = ["POI", "Source URL", "Source Name", "Information Extracted", "Date Accessed"]
    ws_sources.append(source_headers)
    for poi in pois:
        if not poi.sources:
            ws_sources.append(
                [
                    poi.name,
                    "Not confirmed",
                    "Not confirmed",
                    "No external source recorded",
                    dt.datetime.utcnow().date().isoformat(),
                ]
            )
            continue
        for src in poi.sources:
            ws_sources.append(
                [
                    src.poi_name,
                    src.source_url,
                    src.source_name,
                    src.extracted_info,
                    src.accessed_date,
                ]
            )

    style_header_row(ws_sources, 1)
    ws_sources.freeze_panes = "A2"
    ws_sources.auto_filter.ref = f"A1:E{ws_sources.max_row}"
    autosize_columns(ws_sources)
    configure_print(ws_sources)

    wb.save(output_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an enriched route workbook from a GPX file."
    )
    parser.add_argument("gpx", type=Path, help="Path to source GPX route file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("route_analysis.xlsx"),
        help="Output workbook path (.xlsx)",
    )
    parser.add_argument(
        "--enrich",
        action="store_true",
        help="Use online sources (Nominatim/Wikidata) to enrich POI details",
    )
    parser.add_argument(
        "--nominatim-email",
        default=None,
        help="Contact email for User-Agent (recommended for Nominatim usage)",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15.0,
        help="HTTP request timeout in seconds for enrichment calls",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    gpx_obj, route_points, pois = parse_gpx(args.gpx)

    apply_route_metrics(route_points, pois)

    if args.enrich and pois:
        enricher = POIEnricher(timeout_s=args.timeout, email=args.nominatim_email)
        for poi in pois:
            enricher.enrich(poi)
    else:
        for poi in pois:
            poi.route_notes = infer_route_note(poi)
            poi.confidence = "Low"

    build_workbook(gpx_obj, route_points, pois, args.output)
    print(f"Workbook written to: {args.output}")


if __name__ == "__main__":
    main()
