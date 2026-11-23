import { WxAPI } from "https://esm.sh/@metoceanapi/wxtiles-leaflet";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const M_PER_NM = 1852.0;
const M_PER_KM = 1000.0;
const EARTH_RADIUS_M = 6371008.8;

// Preset passages
const SAMPLE_ROUTES = {
  cook_strait: {
    name: "Cook Strait (Wellington → Picton, NZ)",
    waypoints: [
      { name: "Wellington Queens Wharf", lat: -41.2865, lng: 174.7787 },
      { name: "Barrett Reef Buoy",       lat: -41.3533, lng: 174.8340 },
      { name: "Cook Strait Central",     lat: -41.3500, lng: 174.5500 },
      { name: "Tory Channel Entrance",   lat: -41.2110, lng: 174.3160 },
      { name: "Picton Ferry Terminal",   lat: -41.2890, lng: 174.0080 },
    ],
  },
  hauraki_gulf: {
    name: "Hauraki Gulf (Auckland → Great Barrier, NZ)",
    waypoints: [
      { name: "Waitemata Harbour",        lat: -36.8400, lng: 174.7750 },
      { name: "Rangitoto Channel",        lat: -36.7800, lng: 174.8600 },
      { name: "Tiritiri Matangi East",    lat: -36.6000, lng: 174.9500 },
      { name: "Jellicoe Channel",         lat: -36.3500, lng: 175.1800 },
      { name: "Port Fitzroy Entrance",    lat: -36.1700, lng: 175.3600 },
    ],
  },
  bay_of_plenty: {
    name: "Bay of Plenty (Tauranga → Whakatane, NZ)",
    waypoints: [
      { name: "Mount Maunganui Roads", lat: -37.6250, lng: 176.1750 },
      { name: "Motiti Island North",   lat: -37.5800, lng: 176.4200 },
      { name: "Plate Island Offshore", lat: -37.6400, lng: 176.6500 },
      { name: "Whakatane Approach",    lat: -37.9300, lng: 177.0100 },
    ],
  },
  english_channel: {
    name: "English Channel (Dover → Calais)",
    waypoints: [
      { name: "Dover Western Docks", lat: 51.1180, lng: 1.3150 },
      { name: "SW Goodwin",          lat: 51.1500, lng: 1.5500 },
      { name: "Mid Channel TSS",     lat: 51.0500, lng: 1.7000 },
      { name: "Calais Port",         lat: 50.9700, lng: 1.8600 },
    ],
  },
  sydney_jervis: {
    name: "Sydney → Jervis Bay (AU)",
    waypoints: [
      { name: "Sydney Heads",         lat: -33.8340, lng: 151.2850 },
      { name: "Cronulla Offshore",    lat: -34.0700, lng: 151.2200 },
      { name: "Wollongong Offshore",  lat: -34.4200, lng: 151.0200 },
      { name: "Point Perpendicular",  lat: -35.0900, lng: 150.8100 },
    ],
  },
};

// ── STATE ─────────────────────────────────────────────────────────────────────
const state = {
  map: null,
  baseLayers: {},
  currentBaseLayer: null,
  wxapi: null,
  apiConnected: false,
  allDatasets: [],

  // Times are taken from waveDatasetManager when possible, else windDatasetManager
  allTimes: [],
  selectedTime: null,

  // Both sources are ALWAYS loaded (wave + wind), independent of which is displayed on map
  waveDm: null,          // DatasetManager for wave
  windDm: null,          // DatasetManager for wind
  waveSource: null,      // Leaflet layer (always loaded, map visibility toggled)
  windSource: null,      // Leaflet layer (always loaded, map visibility toggled)
  waveOpacity: 0.85,
  windOpacity: 0.85,
  activeOverlay: "wave", // which layer is currently shown: 'wave' | 'wind' | 'none'

  // Route
  drawingEnabled: true,
  waypoints: [],
  routePolyline: null,
  vesselSpeedUnit: "knots",
  departureDate: new Date(),

  // Dynamic Vessel Location
  vesselLat: null,
  vesselLng: null,
  vesselMarker: null,

  // Email automation
  emailAddress: null,
  emailFrequency: "4",

  // Configuration management
  savedConfigs: [],

  // Forecast
  checkpoints: [],
  scrubberMarker: null,
  busy: false,
};

// ── DOM ELEMENT CACHE ─────────────────────────────────────────────────────────
const els = {
  metricDistance:    document.getElementById("metricDistance"),
  metricDuration:    document.getElementById("metricDuration"),
  metricEta:         document.getElementById("metricEta"),
  metricMaxWave:     document.getElementById("metricMaxWave"),
  metricMaxWind:     document.getElementById("metricMaxWind"),

  vesselSpeed:        document.getElementById("vesselSpeed"),
  speedUnit:          document.getElementById("speedUnit"),
  speedConversions:   document.getElementById("speedConversions"),
  departureTime:      document.getElementById("departureTime"),
  departureUtcReadout:document.getElementById("departureUtcReadout"),
  btnDepNow:          document.getElementById("btnDepNow"),
  btnDepPlus6h:       document.getElementById("btnDepPlus6h"),
  btnDepPlus12h:      document.getElementById("btnDepPlus12h"),
  btnDepPlus24h:      document.getElementById("btnDepPlus24h"),

  btnToggleDraw:      document.getElementById("btnToggleDraw"),
  btnClearRoute:      document.getElementById("btnClearRoute"),
  btnReverseRoute:    document.getElementById("btnReverseRoute"),
  btnUndoPoint:       document.getElementById("btnUndoPoint"),
  sampleRoutes:       document.getElementById("sampleRoutes"),
  btnLoadSample:      document.getElementById("btnLoadSample"),
  gpxFileInput:       document.getElementById("gpxFileInput"),
  btnExportRoute:     document.getElementById("btnExportRoute"),
  waypointCountBadge: document.getElementById("waypointCountBadge"),
  waypointDistHint:   document.getElementById("waypointDistHint"),
  waypointsList:      document.getElementById("waypointsList"),

  apiStatusBadge:    document.getElementById("apiStatusBadge"),
  basemapSelect:     document.getElementById("basemapSelect"),
  datasetFilter:     document.getElementById("datasetFilter"),
  waveDataset:       document.getElementById("waveDataset"),
  waveVariable:      document.getElementById("waveVariable"),
  waveOpacity:       document.getElementById("waveOpacity"),
  windDataset:       document.getElementById("windDataset"),
  windVariable:      document.getElementById("windVariable"),
  windOpacity:       document.getElementById("windOpacity"),
  timeSelect:        document.getElementById("timeSelect"),
  timeSlider:        document.getElementById("timeSlider"),
  btnPrevTime:       document.getElementById("btnPrevTime"),
  btnNextTime:       document.getElementById("btnNextTime"),
  mapTimeLabel:      document.getElementById("mapTimeLabel"),

  btnRunForecast:     document.getElementById("btnRunForecast"),
  sampleResolution:   document.getElementById("sampleResolution"),
  forecastStatusText: document.getElementById("forecastStatusText"),
  progressBarWrap:    document.getElementById("progressBarWrap"),
  progressBarFill:    document.getElementById("progressBarFill"),

  mapLegend:         document.getElementById("mapLegend"),
  legendTitle:       document.getElementById("legendTitle"),
  legendUnit:        document.getElementById("legendUnit"),
  legendCanvas:      document.getElementById("legendCanvas"),
  legendTicks:       document.getElementById("legendTicks"),
  hudCoords:         document.getElementById("hudCoords"),
  hudValues:         document.getElementById("hudValues"),

  bottomDrawer:       document.getElementById("bottomDrawer"),
  btnToggleDrawer:    document.getElementById("btnToggleDrawer"),
  drawerToggleText:   document.getElementById("drawerToggleText"),
  btnExportCsv:       document.getElementById("btnExportCsv"),
  btnExportPdf:       document.getElementById("btnExportPdf"),
  chartWaveUnit:      document.getElementById("chartWaveUnit"),
  chartWindUnit:      document.getElementById("chartWindUnit"),
  profileCanvas:      document.getElementById("profileCanvas"),
  canvasContainer:    document.getElementById("canvasContainer"),
  chartTooltip:       document.getElementById("chartTooltip"),
  forecastTableBody:  document.getElementById("forecastTableBody"),

  vesselLat:          document.getElementById("vesselLat"),
  vesselLng:          document.getElementById("vesselLng"),
  vesselPositionStatus: document.getElementById("vesselPositionStatus"),
  btnUpdateVesselPos: document.getElementById("btnUpdateVesselPos"),
  btnUseMapClick:     document.getElementById("btnUseMapClick"),

  // Email automation elements
  emailAddress:       document.getElementById("emailAddress"),
  emailStatusText:    document.getElementById("emailStatusText"),
  btnConfigureEmail:  document.getElementById("btnConfigureEmail"),
  btnTestEmail:       document.getElementById("btnTestEmail"),

  // Configuration management elements
  configName:         document.getElementById("configName"),
  btnSaveConfig:      document.getElementById("btnSaveConfig"),
  btnLoadConfig:      document.getElementById("btnLoadConfig"),
  btnExportConfig:    document.getElementById("btnExportConfig"),
  configDetails:      document.getElementById("configDetails"),
  configList:         document.getElementById("configList"),
  configCountBadge:   document.getElementById("configCountBadge"),
};

// ── STARTUP ───────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  initDepartureDateTime();
  initMap();
  updateSpeedConversions();
  loadPersistedSettings();
  setupEventListeners();
  loadSampleRoute("cook_strait");
  await initWxTilesApi();
  initProfileCanvas();
  window.addEventListener("resize", drawProfileChart);
});

function initDepartureDateTime() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  state.departureDate = now;
  const pad = (n) => String(n).padStart(2, "0");
  els.departureTime.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  updateDepartureUtcDisplay();
}

function updateDepartureUtcDisplay() {
  const d = state.departureDate;
  if (!d || isNaN(d)) { els.departureUtcReadout.textContent = "UTC: --"; return; }
  els.departureUtcReadout.textContent = `Departure UTC: ${d.toISOString().replace(".000Z","Z").replace("T"," ")}`;
}

// ── MAP ───────────────────────────────────────────────────────────────────────
function initMap() {
  state.map = L.map("map", { center: [-41.286, 174.55], zoom: 9, zoomControl: true });

  state.baseLayers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
    }),
    esriWorldImagery: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "Tiles &copy; Esri" }
    ),
    cartoDark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, attribution: "&copy; CARTO &copy; OpenStreetMap",
    }),
    cartoPositron: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, attribution: "&copy; CARTO &copy; OpenStreetMap",
    }),
  };

  state.currentBaseLayer = state.baseLayers.osm;
  state.currentBaseLayer.addTo(state.map);
  L.control.scale({ imperial: true, metric: true, maxWidth: 150 }).addTo(state.map);

  state.routePolyline = L.polyline([], {
    color: "#38bdf8", weight: 4, opacity: 0.9, lineJoin: "round",
  }).addTo(state.map);

  state.map.on("click", (e) => { if (state.drawingEnabled) addWaypoint(e.latlng.lat, e.latlng.lng); });
  state.map.on("mousemove", (e) => {
    const w = e.latlng.wrap();
    els.hudCoords.textContent = `lnglat=(${w.lng.toFixed(3)}, ${w.lat.toFixed(3)})`;
    sampleHudAtPosition(w);
  });
}

function setBasemap(key) {
  if (state.currentBaseLayer) state.map.removeLayer(state.currentBaseLayer);
  state.currentBaseLayer = (state.baseLayers[key] || state.baseLayers.osm);
  state.currentBaseLayer.addTo(state.map);
  state.routePolyline.bringToFront();
}

// ── SPEED HELPERS ─────────────────────────────────────────────────────────────
function getVesselSpeedMps() {
  const val = Number(els.vesselSpeed.value) || 10;
  const unit = els.speedUnit.value;
  if (unit === "knots") return val * M_PER_NM / 3600;
  if (unit === "km/h")  return val / 3.6;
  return val;
}

function updateSpeedConversions() {
  const mps   = getVesselSpeedMps();
  const knots = mps / (M_PER_NM / 3600);
  const kmh   = mps * 3.6;
  const unit  = els.speedUnit.value;
  if (unit === "knots") els.speedConversions.textContent = `= ${kmh.toFixed(1)} km/h | ${mps.toFixed(2)} m/s`;
  else if (unit === "km/h") els.speedConversions.textContent = `= ${knots.toFixed(1)} knots | ${mps.toFixed(2)} m/s`;
  else els.speedConversions.textContent = `= ${knots.toFixed(1)} knots | ${kmh.toFixed(1)} km/h`;

  els.chartWindUnit.textContent = unit === "m/s" ? "m/s" : unit === "km/h" ? "km/h" : "knots";
  updateRouteMetrics();
}

// ── GEOMETRY ──────────────────────────────────────────────────────────────────
function haversineM(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const dL = (lat2 - lat1) * toR, dO = (lon2 - lon1) * toR;
  const a = Math.sin(dL/2)**2 + Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dO/2)**2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const toR = Math.PI / 180;
  const y = Math.sin((lon2-lon1)*toR)*Math.cos(lat2*toR);
  const x = Math.cos(lat1*toR)*Math.sin(lat2*toR) - Math.sin(lat1*toR)*Math.cos(lat2*toR)*Math.cos((lon2-lon1)*toR);
  return ((Math.atan2(y, x)*180/Math.PI) + 360) % 360;
}

function lerp(lat1, lon1, lat2, lon2, f) {
  return { lat: lat1+(lat2-lat1)*f, lng: lon1+(lon2-lon1)*f };
}

// ── WAYPOINTS & ROUTE ─────────────────────────────────────────────────────────
function addWaypoint(lat, lng, name = null) {
  const idx = state.waypoints.length + 1;
  const wpName = name || `WP ${idx}`;
  const marker = createWaypointMarker(lat, lng, idx, wpName);
  state.waypoints.push({ name: wpName, lat, lng, marker });
  updateRouteVisuals();
  updateRouteMetrics();
  renderWaypointsList();
}

function createWaypointMarker(lat, lng, idx, name) {
  const isStart = idx === 1;
  const icon = L.divIcon({
    className: "custom-wp-icon",
    html: `<div class="waypoint-marker ${isStart ? "start" : ""}" style="width:22px;height:22px;">${idx}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
  const m = L.marker([lat, lng], { icon, draggable: true }).addTo(state.map);
  m.bindPopup(`<strong>${name}</strong><br>Lat: ${lat.toFixed(4)}<br>Lng: ${lng.toFixed(4)}`);
  m.on("drag", () => {
    const p = m.getLatLng();
    const wp = state.waypoints.find(w => w.marker === m);
    if (wp) { wp.lat = p.lat; wp.lng = p.lng; updateRouteVisuals(); updateRouteMetrics(); renderWaypointsList(); }
  });
  return m;
}

function updateRouteVisuals() {
  state.routePolyline.setLatLngs(state.waypoints.map(w => [w.lat, w.lng]));
  state.waypoints.forEach((w, i) => {
    const idx = i + 1;
    const cls = idx===1 ? "start" : idx===state.waypoints.length && idx>1 ? "finish" : "";
    w.marker.setIcon(L.divIcon({
      className: "custom-wp-icon",
      html: `<div class="waypoint-marker ${cls}" style="width:22px;height:22px;">${idx}</div>`,
      iconSize: [22, 22], iconAnchor: [11, 11],
    }));
  });
}

function updateRouteMetrics() {
  let totalM = 0;
  for (let i = 0; i < state.waypoints.length - 1; i++) {
    totalM += haversineM(state.waypoints[i].lat, state.waypoints[i].lng, state.waypoints[i+1].lat, state.waypoints[i+1].lng);
  }
  const distNm = totalM / M_PER_NM, distKm = totalM / M_PER_KM;
  const speedMps = getVesselSpeedMps();
  const durSec = speedMps > 0 ? totalM / speedMps : 0;
  const h = Math.floor(durSec / 3600), m = Math.floor((durSec % 3600) / 60);
  const eta = new Date(state.departureDate.getTime() + durSec * 1000);

  els.metricDistance.textContent = `${distNm.toFixed(1)} nm (${distKm.toFixed(1)} km)`;
  els.metricDuration.textContent = `${h}h ${String(m).padStart(2,"0")}m`;
  els.metricEta.textContent = durSec > 0 ? formatUtcTimeShort(eta) : "--:--";
  els.waypointCountBadge.textContent = state.waypoints.length;
  els.waypointDistHint.textContent = `${distNm.toFixed(1)} nm`;
}

function renderWaypointsList() {
  els.waypointsList.innerHTML = "";
  if (!state.waypoints.length) {
    els.waypointsList.innerHTML = '<p class="empty-state">No waypoints yet. Click on the map or load a sample route.</p>';
    return;
  }
  let cumDist = 0;
  const speedMps = getVesselSpeedMps();
  state.waypoints.forEach((w, i) => {
    let legDist = 0;
    if (i > 0) { const prev = state.waypoints[i-1]; legDist = haversineM(prev.lat,prev.lng,w.lat,w.lng)/M_PER_NM; cumDist += legDist; }
    const div = document.createElement("div");
    div.className = "waypoint-item";
    div.innerHTML = `<span class="wp-idx">#${i+1}</span>
      <span class="wp-coords mono">${w.lat.toFixed(3)}, ${w.lng.toFixed(3)}</span>
      <span class="wp-dist mono">${cumDist.toFixed(1)} nm (+${legDist.toFixed(1)})</span>
      <button type="button" class="wp-delete-btn" data-idx="${i}">&times;</button>`;
    div.querySelector(".wp-delete-btn").addEventListener("click", e => { e.stopPropagation(); removeWaypoint(i); });
    els.waypointsList.appendChild(div);
  });
}

function removeWaypoint(i) {
  if (i < 0 || i >= state.waypoints.length) return;
  state.map.removeLayer(state.waypoints.splice(i, 1)[0].marker);
  updateRouteVisuals(); updateRouteMetrics(); renderWaypointsList();
}

function undoLastWaypoint() { if (state.waypoints.length) removeWaypoint(state.waypoints.length - 1); }

function clearRoute() {
  state.waypoints.forEach(w => state.map.removeLayer(w.marker));
  state.waypoints = []; state.checkpoints = [];
  state.routePolyline.setLatLngs([]);
  if (state.scrubberMarker) { state.map.removeLayer(state.scrubberMarker); state.scrubberMarker = null; }
  updateRouteMetrics(); renderWaypointsList(); drawProfileChart(); renderForecastTable();
  els.metricMaxWave.textContent = "--"; els.metricMaxWind.textContent = "--";
  els.forecastStatusText.textContent = "Route cleared.";
}

function reverseRoute() {
  if (state.waypoints.length < 2) return;
  state.waypoints.reverse();
  updateRouteVisuals(); updateRouteMetrics(); renderWaypointsList();
  if (state.checkpoints.length) runRouteForecast();
}

// ── DYNAMIC VESSEL LOCATION ───────────────────────────────────────────────────
let mapClickMode = false;

function toggleMapClickMode() {
  mapClickMode = !mapClickMode;
  els.btnUseMapClick.classList.toggle("active", mapClickMode);
  els.btnUseMapClick.querySelector("span").textContent = mapClickMode ? "Click on map..." : "Click Map";
  if (mapClickMode) {
    state.map.dragging.disable();
    state.map.once("click", (e) => {
      setVesselPosition(e.latlng.lat, e.latlng.lng);
      mapClickMode = false;
      els.btnUseMapClick.classList.remove("active");
      els.btnUseMapClick.querySelector("span").textContent = "Click Map";
      state.map.dragging.enable();
    });
  }
}

function setVesselPosition(lat, lng) {
  state.vesselLat = lat;
  state.vesselLng = lng;
  
  // Update input fields
  if (els.vesselLat) els.vesselLat.value = lat.toFixed(4);
  if (els.vesselLng) els.vesselLng.value = lng.toFixed(4);
  
  // Update marker on map
  if (state.vesselMarker) {
    state.map.removeLayer(state.vesselMarker);
  }
  state.vesselMarker = L.circleMarker([lat, lng], {
    radius: 8,
    fillColor: "#ff6b6b",
    color: "#c92a2a",
    weight: 2,
    opacity: 1,
    fillOpacity: 0.8
  }).bindPopup(`Vessel Position<br/>Lat: ${lat.toFixed(4)}<br/>Lng: ${lng.toFixed(4)}`).addTo(state.map);
  
  updateVesselPositionStatus();
}

function updateVesselPosition() {
  const lat = Number(els.vesselLat?.value);
  const lng = Number(els.vesselLng?.value);
  
  if (isNaN(lat) || isNaN(lng)) {
    alert("Please enter valid latitude and longitude");
    return;
  }
  
  if (lat < -90 || lat > 90) {
    alert("Latitude must be between -90 and 90");
    return;
  }
  
  if (lng < -180 || lng > 180) {
    alert("Longitude must be between -180 and 180");
    return;
  }
  
  setVesselPosition(lat, lng);
  
  // If route exists, recalculate forecast from new position
  if (state.waypoints.length >= 2) {
    runRouteForecast();
  }
}

function updateVesselPositionStatus() {
  if (!state.vesselLat || !state.vesselLng) {
    if (els.vesselPositionStatus) els.vesselPositionStatus.textContent = "Position: Not set";
  } else {
    if (els.vesselPositionStatus) {
      els.vesselPositionStatus.textContent = `Position: ${state.vesselLat.toFixed(4)}, ${state.vesselLng.toFixed(4)}`;
    }
  }
}

function loadSampleRoute(key) {
  const s = SAMPLE_ROUTES[key]; if (!s) return;
  clearRoute();
  s.waypoints.forEach(p => addWaypoint(p.lat, p.lng, p.name));
  state.map.fitBounds(L.latLngBounds(s.waypoints.map(p => [p.lat, p.lng])), { padding: [50,50] });
  els.forecastStatusText.textContent = `Loaded: ${s.name}`;
}

// ── DISCRETISE ROUTE ──────────────────────────────────────────────────────────
function discretizeRoute() {
  if (state.waypoints.length < 2) return [];
  const speedMps = getVesselSpeedMps();
  let totalM = 0;
  for (let i = 0; i < state.waypoints.length-1; i++)
    totalM += haversineM(state.waypoints[i].lat,state.waypoints[i].lng,state.waypoints[i+1].lat,state.waypoints[i+1].lng);

  const mode = els.sampleResolution.value;
  let stepM = mode==="2nm" ? 2*M_PER_NM : mode==="5nm" ? 5*M_PER_NM : mode==="10nm" ? 10*M_PER_NM : Math.max(totalM/22, 1.5*M_PER_NM);

  const cps = [];
  let cumM = 0;

  for (let i = 0; i < state.waypoints.length-1; i++) {
    const w1=state.waypoints[i], w2=state.waypoints[i+1];
    const legM = haversineM(w1.lat,w1.lng,w2.lat,w2.lng);
    const brng = bearing(w1.lat,w1.lng,w2.lat,w2.lng);
    const n = Math.max(1, Math.round(legM/stepM));
    for (let s=0; s<n; s++) {
      const f = s/n;
      const pt = lerp(w1.lat,w1.lng,w2.lat,w2.lng,f);
      const sub = cumM + legM*f;
      cps.push({
        index: cps.length+1, name: s===0 ? w1.name : `Point ${cps.length+1}`, isWaypoint: s===0,
        lat: pt.lat, lng: pt.lng, cumDistM: sub,
        distNm: sub/M_PER_NM, distKm: sub/M_PER_KM, bearing: brng,
        eta: new Date(state.departureDate.getTime() + (sub/speedMps)*1000),
        matchedTime: null, waveHeight: 0, windSpeed: 0, windDir: 0,
        relWindAngle: 0, relWindClass: "wind-crosswind", relWindLabel: "Crosswind",
        isSimulated: true,
      });
    }
    cumM += legM;
  }
  // Final waypoint
  const lw = state.waypoints[state.waypoints.length-1];
  const lastBrng = cps.length ? cps[cps.length-1].bearing : 0;
  cps.push({
    index: cps.length+1, name: lw.name, isWaypoint: true,
    lat: lw.lat, lng: lw.lng, cumDistM: cumM,
    distNm: cumM/M_PER_NM, distKm: cumM/M_PER_KM, bearing: lastBrng,
    eta: new Date(state.departureDate.getTime() + (cumM/speedMps)*1000),
    matchedTime: null, waveHeight: 0, windSpeed: 0, windDir: 0,
    relWindAngle: 0, relWindClass: "wind-crosswind", relWindLabel: "Crosswind", isSimulated: true,
  });
  return cps;
}

// ── WXTILES API ───────────────────────────────────────────────────────────────
async function initWxTilesApi() {
  els.apiStatusBadge.textContent = "Connecting to WxTiles...";
  try {
    state.wxapi = new WxAPI({ dataServerURL: "https://tiles.metoceanapi.com/data/", maskURL: "auto", qtreeURL: "auto" });
    state.allDatasets = await state.wxapi.getAllDatasetsNames();
    state.allDatasets.sort();
    if (!state.allDatasets.length) throw new Error("No datasets");
    state.apiConnected = true;
    els.apiStatusBadge.textContent = `Connected (${state.allDatasets.length} datasets)`;
    els.apiStatusBadge.style.color = "var(--success)";
    populateDatasetDropdowns();
    await setupDefaultLayers();
  } catch (err) {
    console.warn("WxTiles offline:", err);
    state.apiConnected = false;
    els.apiStatusBadge.textContent = "Offline / Synthetic Mode";
    els.apiStatusBadge.style.color = "var(--wind-color)";
    populateMockDatasets();
  }
}

function populateDatasetDropdowns(filter = "") {
  const f = filter.toLowerCase();
  const datasets = state.allDatasets.filter(d => !f || d.toLowerCase().includes(f));
  els.waveDataset.innerHTML = "";
  els.windDataset.innerHTML = "";
  datasets.forEach(d => {
    [els.waveDataset, els.windDataset].forEach(sel => {
      const opt = document.createElement("option"); opt.value = d; opt.textContent = d; sel.appendChild(opt);
    });
  });
  const waveCandidate = datasets.find(d => /wave|ww3|swan/i.test(d)) || datasets[0];
  const windCandidate = datasets.find(d => /wind|gfs|wrf|ecmwf/i.test(d)) || datasets[0];
  if (waveCandidate) els.waveDataset.value = waveCandidate;
  if (windCandidate) els.windDataset.value = windCandidate;
}

function populateMockDatasets() {
  state.allDatasets = ["global-wavewatch3-forecast","gfs-atmospheric-0.25deg","ecmwf-marine-waves"];
  populateDatasetDropdowns();
  els.waveVariable.innerHTML = '<option value="hs">hs (Significant Wave Height)</option>';
  els.windVariable.innerHTML = '<option value="wind">wind (10m Surface Wind)</option>';
  const times = [], start = new Date(); start.setMinutes(0,0,0);
  for (let h=0; h<48; h+=3) times.push(new Date(start.getTime()+h*3600000).toISOString());
  fillTimeSelect(times);
}

async function loadVariablesFor(datasetName, selectEl, preferred = []) {
  if (!state.wxapi) return;
  try {
    const vars = await state.wxapi.getDatasetAllVariables(datasetName);
    selectEl.innerHTML = "";
    (vars||[]).forEach(v => { const o=document.createElement("option"); o.value=v; o.textContent=v; selectEl.appendChild(o); });
    const match = preferred.find(p => vars?.includes(p));
    if (match) selectEl.value = match;
  } catch(e) { console.warn("loadVariablesFor", datasetName, e); }
}

// Setup BOTH wave and wind layers on startup
async function setupDefaultLayers() {
  if (!state.apiConnected) return;
  const waveDs = els.waveDataset.value;
  const windDs = els.windDataset.value;

  await Promise.all([
    waveDs ? loadVariablesFor(waveDs, els.waveVariable, ["hs","significant_wave_height","wave_height"]) : Promise.resolve(),
    windDs ? loadVariablesFor(windDs, els.windVariable, ["wind","surface_wind","wind_speed","wind10m"]) : Promise.resolve(),
  ]);

  // Get times from the wave dataset first, fall back to wind
  await updateTimestepsForDataset(waveDs || windDs);

  // Load BOTH layers simultaneously
  await Promise.all([
    loadWeatherLayer("wave"),
    loadWeatherLayer("wind"),
  ]);

  // Apply visibility based on active overlay
  applyOverlayVisibility();
}

async function updateTimestepsForDataset(datasetName) {
  if (!state.wxapi || !datasetName) return;
  try {
    const dm = await state.wxapi.createDatasetManager(datasetName);
    const times = dm.getAllTimes() || [];
    fillTimeSelect(times);
  } catch(e) { console.warn("Failed to get times for", datasetName, e); }
}

function fillTimeSelect(times) {
  state.allTimes = times;
  els.timeSelect.innerHTML = "";
  times.forEach(t => {
    const o=document.createElement("option"); o.value=t; o.textContent=formatUtcTime(t); els.timeSelect.appendChild(o);
  });
  els.timeSlider.min="0"; els.timeSlider.max=String(Math.max(0,times.length-1)); els.timeSlider.value="0";
  if (times.length) { state.selectedTime=times[0]; updateTimeDisplay(); }
}

function updateTimeDisplay() {
  if (!state.selectedTime) return;
  els.mapTimeLabel.textContent = formatUtcTime(state.selectedTime);
  const idx = state.allTimes.indexOf(state.selectedTime);
  if (idx >= 0) { els.timeSlider.value = String(idx); els.timeSelect.value = state.selectedTime; }
}

// ── LOAD A WEATHER LAYER (wave or wind) ───────────────────────────────────────
// This always creates/replaces the source but does NOT control map visibility here.
async function loadWeatherLayer(type) {
  if (!state.apiConnected || !state.wxapi) return;

  const isWave = type === "wave";
  const dataset  = isWave ? els.waveDataset.value  : els.windDataset.value;
  const variable = isWave ? els.waveVariable.value  : els.windVariable.value;
  if (!dataset || !variable) return;

  // Remove old source
  if (isWave && state.waveSource) { state.map.removeLayer(state.waveSource); state.waveSource = null; }
  if (!isWave && state.windSource) { state.map.removeLayer(state.windSource); state.windSource = null; }

  try {
    const dm = await state.wxapi.createDatasetManager(dataset);
    if (isWave) state.waveDm = dm; else state.windDm = dm;

    const wxstyle = isWave
      ? { fill: "gradient", colorScheme: "bluebird", showAboveMax: true, showBelowMin: true, mask: "land" }
      : { fill: "gradient", colorScheme: "rainbow",  vectorType: "arrows", vectorColor: "inverted", showAboveMax: true, showBelowMin: true };

    const source = dm.createSourceLayer(
      { variable, time: state.selectedTime, wxstyle },
      { opacity: isWave ? state.waveOpacity : state.windOpacity, zIndex: isWave ? 350 : 360, attribution: "WxTiles" }
    );

    // Add to map (we control visibility via applyOverlayVisibility)
    state.map.addLayer(source);
    // Wait for first tile load
    await new Promise(resolve => source.once("load", resolve));

    if (isWave) state.waveSource = source; else state.windSource = source;

    // Pull times from this source if our list is empty
    if (state.allTimes.length === 0) {
      const times = source.getAllTimes?.() || [];
      if (times.length) fillTimeSelect(times);
    }

    state.routePolyline.bringToFront();
    updateLegendFor(state.activeOverlay);
  } catch(e) {
    console.warn(`Failed to load ${type} layer:`, e);
  }
}

// Show/hide each source based on state.activeOverlay
function applyOverlayVisibility() {
  if (state.waveSource) {
    if (state.activeOverlay === "wave") { state.map.addLayer(state.waveSource); }
    else { state.map.removeLayer(state.waveSource); }
  }
  if (state.windSource) {
    if (state.activeOverlay === "wind") { state.map.addLayer(state.windSource); }
    else { state.map.removeLayer(state.windSource); }
  }
  els.mapLegend.style.display = state.activeOverlay === "none" ? "none" : "flex";
  updateLegendFor(state.activeOverlay);
  if (state.waveSource || state.windSource) state.routePolyline.bringToFront();
}

function updateLegendFor(type) {
  if (type === "none") { els.mapLegend.style.display = "none"; return; }
  els.mapLegend.style.display = "flex";
  const canvas = els.legendCanvas, ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
  if (type === "wave") {
    els.legendTitle.textContent = "Significant Wave Height (Hs)";
    els.legendUnit.textContent = "m";
    g.addColorStop(0, "#0000ff"); g.addColorStop(0.3,"#00ffff"); g.addColorStop(0.6,"#ffff00"); g.addColorStop(1,"#ff0000");
    els.legendTicks.innerHTML = "<span>0m</span><span>1.5m</span><span>3.0m</span><span>6m+</span>";
  } else {
    const su = els.speedUnit.value;
    els.legendTitle.textContent = "10m Surface Wind";
    els.legendUnit.textContent = su;
    g.addColorStop(0,"#38bdf8"); g.addColorStop(0.3,"#34d399"); g.addColorStop(0.6,"#fbbf24"); g.addColorStop(1,"#ef4444");
    els.legendTicks.innerHTML = su==="knots"
      ? "<span>5kt</span><span>15kt</span><span>25kt</span><span>40kt+</span>"
      : su==="km/h" ? "<span>10</span><span>30</span><span>50</span><span>80+</span>"
      : "<span>2</span><span>8</span><span>14</span><span>22+</span>";
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function sampleHudAtPosition(latLng) {
  let waveStr="--", windStr="--";
  if (state.waveSource?.getLayerInfoAtLatLon) {
    try { const i=state.waveSource.getLayerInfoAtLatLon(latLng,state.map); if (i?.data?.[0]!=null) waveStr=`${i.data[0].toFixed(2)}m`; } catch{}
  }
  if (state.windSource?.getLayerInfoAtLatLon) {
    try {
      const i=state.windSource.getLayerInfoAtLatLon(latLng,state.map);
      if (i?.data?.[0]!=null) windStr=`${i.data[0].toFixed(1)}${i.dataUnits||"kt"}`;
    } catch{}
  }
  els.hudValues.textContent = `waves=${waveStr} wind=${windStr}`;
}

// ── ROUTE FORECAST ENGINE ─────────────────────────────────────────────────────
async function runRouteForecast() {
  if (state.waypoints.length < 2) { alert("Add at least 2 waypoints first."); return; }
  if (state.busy) return;

  state.busy = true;
  els.btnRunForecast.disabled = true;
  els.progressBarWrap.hidden = false;
  els.progressBarFill.style.width = "5%";
  els.forecastStatusText.textContent = "Discretising route into checkpoints...";

  const speedUnit = els.speedUnit.value;
  state.checkpoints = discretizeRoute();
  if (!state.checkpoints.length) { resetForecastUI(); return; }

  els.progressBarFill.style.width = "20%";
  els.forecastStatusText.textContent = `Sampling ${state.checkpoints.length} points...`;

  // Ensure BOTH sources are loaded before sampling
  const waveReady = state.apiConnected && !!state.waveSource;
  const windReady = state.apiConnected && !!state.windSource;

  if (!waveReady && state.apiConnected) {
    els.forecastStatusText.textContent = "Loading wave layer for sampling...";
    await loadWeatherLayer("wave");
  }
  if (!windReady && state.apiConnected) {
    els.forecastStatusText.textContent = "Loading wind layer for sampling...";
    await loadWeatherLayer("wind");
  }
  applyOverlayVisibility();

  let maxWave=0, maxWind=0;

  for (let i=0; i<state.checkpoints.length; i++) {
    const cp = state.checkpoints[i];
    els.progressBarFill.style.width = `${20 + Math.floor((i/state.checkpoints.length)*70)}%`;
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0)); // yield to UI

    cp.matchedTime = matchClosestTimestep(cp.eta);

    // Switch each source to this checkpoint's matched time for accurate sampling
    try { if (state.waveSource) await state.waveSource.setTime(cp.matchedTime); } catch{}
    try { if (state.windSource) await state.windSource.setTime(cp.matchedTime); } catch{}

    const weather = samplePointWeatherFromLayers(cp.lat, cp.lng);
    cp.waveHeight  = weather.waveHeight;
    cp.windSpeed   = convertSpeed(weather.windSpeedMps, "m/s", speedUnit);
    cp.windDir     = weather.windDir;
    cp.isSimulated = weather.isSimulated;

    // Relative wind
    let diff = Math.abs(cp.windDir - cp.bearing) % 360;
    if (diff > 180) diff = 360 - diff;
    cp.relWindAngle = diff;
    if (diff < 45)        { cp.relWindClass="wind-headwind"; cp.relWindLabel=`Headwind (${diff.toFixed(0)}°)`; }
    else if (diff > 135)  { cp.relWindClass="wind-tailwind"; cp.relWindLabel=`Tailwind (${(180-diff).toFixed(0)}°)`; }
    else                  { cp.relWindClass="wind-crosswind"; cp.relWindLabel=`Crosswind (${diff.toFixed(0)}°)`; }

    if (cp.waveHeight > maxWave) maxWave = cp.waveHeight;
    if (cp.windSpeed  > maxWind) maxWind = cp.windSpeed;
  }

  // Restore map to current display time
  try { if (state.waveSource) await state.waveSource.setTime(state.selectedTime); } catch{}
  try { if (state.windSource) await state.windSource.setTime(state.selectedTime); } catch{}

  els.progressBarFill.style.width = "100%";
  els.forecastStatusText.textContent = `Forecast complete — ${state.checkpoints.length} points${state.checkpoints.some(c=>c.isSimulated) ? " (some synthetic data)" : ""}.`;
  els.metricMaxWave.textContent = `${maxWave.toFixed(2)} m`;
  els.metricMaxWind.textContent = `${maxWind.toFixed(1)} ${speedUnit}`;

  setTimeout(resetForecastUI, 600);
  drawProfileChart();
  renderForecastTable();
}

function resetForecastUI() {
  state.busy = false;
  els.btnRunForecast.disabled = false;
  els.progressBarWrap.hidden = true;
}

function matchClosestTimestep(date) {
  if (!state.allTimes.length) return date.toISOString();
  let best = state.allTimes[0], bestDiff = Infinity;
  const tMs = date.getTime();
  for (const t of state.allTimes) { const d=Math.abs(new Date(t).getTime()-tMs); if (d<bestDiff) { bestDiff=d; best=t; } }
  return best;
}

function samplePointWeatherFromLayers(lat, lng) {
  const ll = L.latLng(lat, lng).wrap();
  let waveHeight=null, windSpeedMps=null, windDir=null;

  if (state.waveSource?.getLayerInfoAtLatLon) {
    try {
      const info = state.waveSource.getLayerInfoAtLatLon(ll, state.map);
      if (info?.data && Number.isFinite(info.data[0])) waveHeight = info.data[0];
    } catch{}
  }
  if (state.windSource?.getLayerInfoAtLatLon) {
    try {
      const info = state.windSource.getLayerInfoAtLatLon(ll, state.map);
      if (info?.data && Number.isFinite(info.data[0])) {
        windSpeedMps = info.data[0];
        windDir = Number.isFinite(info.data[1]) ? info.data[1] : 240;
      }
    } catch{}
  }

  // Synthesis fallback
  if (waveHeight === null || windSpeedMps === null) {
    const seed = Math.sin(lat * 12.34 + lng * 56.78);
    waveHeight   = waveHeight   ?? Math.max(0.3, 1.4 + Math.sin(lat*3.5)*0.9 + seed*0.5);
    windSpeedMps = windSpeedMps ?? Math.max(1.5, 7.5 + Math.cos(lng*4.2)*4.2 + Math.abs(seed)*2.5);
    windDir      = windDir      ?? Math.round((230 + seed*45 + 360) % 360);
    return { waveHeight, windSpeedMps, windDir, isSimulated: true };
  }
  return { waveHeight, windSpeedMps, windDir, isSimulated: false };
}

function convertSpeed(val, from, to) {
  let mps = from==="knots" ? val*M_PER_NM/3600 : from==="km/h" ? val/3.6 : val;
  if (to==="knots") return mps/(M_PER_NM/3600);
  if (to==="km/h")  return mps*3.6;
  return mps;
}

// ── PROFILE CHART ─────────────────────────────────────────────────────────────
function initProfileCanvas() {
  els.canvasContainer.addEventListener("mousemove", e => {
    if (state.checkpoints.length < 2) return;
    const r=els.profileCanvas.getBoundingClientRect();
    handleChartHover(e.clientX-r.left, r.width, r.height);
  });
  els.canvasContainer.addEventListener("mouseleave", () => {
    els.chartTooltip.hidden=true;
    if (state.scrubberMarker) { state.map.removeLayer(state.scrubberMarker); state.scrubberMarker=null; }
    drawProfileChart();
  });
}

function drawProfileChart(hlIdx = -1) {
  const canvas = els.profileCanvas, ctr = els.canvasContainer;
  const dpr = window.devicePixelRatio || 1;
  const W = ctr.clientWidth, H = ctr.clientHeight;
  if (W <= 0 || H <= 0) return;
  canvas.width  = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (state.checkpoints.length < 2) {
    ctx.fillStyle="rgba(148,163,184,0.5)"; ctx.font='13px "Space Grotesk",sans-serif';
    ctx.textAlign="center"; ctx.fillText("Define a route and click 'Generate Route Forecast'.", W/2, H/2);
    return;
  }

  const pL=48, pR=52, pT=28, pB=32, pW=W-pL-pR, pH=H-pT-pB;
  const totalDist = state.checkpoints[state.checkpoints.length-1].distNm;
  const maxWave = Math.max(3, ...state.checkpoints.map(c=>c.waveHeight*1.25));
  const maxWind = Math.max(20, ...state.checkpoints.map(c=>c.windSpeed*1.25));

  const getX  = d => pL + (d/totalDist)*pW;
  const getWY = h => pT + pH - (h/maxWave)*pH;
  const getVY = w => pT + pH - (w/maxWind)*pH;

  // Grid
  ctx.strokeStyle="rgba(255,255,255,0.07)"; ctx.lineWidth=1;
  for (let i=0; i<=4; i++) {
    const y=pT+(pH/4)*i;
    ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(pL+pW,y); ctx.stroke();
    const wv=((4-i)/4)*maxWave, wd=((4-i)/4)*maxWind;
    ctx.fillStyle="rgba(59,130,246,0.85)"; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign="right";
    ctx.fillText(`${wv.toFixed(1)}m`, pL-5, y+3);
    ctx.fillStyle="rgba(245,158,11,0.85)"; ctx.textAlign="left";
    ctx.fillText(`${wd.toFixed(0)}`, pL+pW+5, y+3);
  }

  // Waypoint dividers
  state.checkpoints.forEach(cp => {
    if (!cp.isWaypoint) return;
    const x=getX(cp.distNm);
    ctx.strokeStyle="rgba(56,189,248,0.22)"; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(x,pT); ctx.lineTo(x,pT+pH); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle="#38bdf8"; ctx.font='9px "IBM Plex Mono",monospace'; ctx.textAlign="center";
    ctx.fillText(cp.name.length>12?cp.name.slice(0,10)+"..":cp.name, x, pT-14);
  });

  // Wave area fill
  const wg=ctx.createLinearGradient(0,pT,0,pT+pH);
  wg.addColorStop(0,"rgba(59,130,246,0.45)"); wg.addColorStop(1,"rgba(59,130,246,0.04)");
  ctx.beginPath(); ctx.moveTo(getX(state.checkpoints[0].distNm), pT+pH);
  state.checkpoints.forEach(cp => ctx.lineTo(getX(cp.distNm), getWY(cp.waveHeight)));
  ctx.lineTo(getX(state.checkpoints[state.checkpoints.length-1].distNm), pT+pH);
  ctx.closePath(); ctx.fillStyle=wg; ctx.fill();

  // Wave line
  ctx.beginPath();
  state.checkpoints.forEach((cp,i) => { const x=getX(cp.distNm),y=getWY(cp.waveHeight); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.strokeStyle="#3b82f6"; ctx.lineWidth=2.5; ctx.stroke();

  // Wind line
  ctx.beginPath();
  state.checkpoints.forEach((cp,i) => { const x=getX(cp.distNm),y=getVY(cp.windSpeed); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
  ctx.strokeStyle="#f59e0b"; ctx.lineWidth=2; ctx.stroke();

  // Wind direction arrows
  state.checkpoints.forEach(cp => {
    const x=getX(cp.distNm), y=pT-2;
    ctx.save(); ctx.translate(x,y);
    ctx.rotate(((cp.windDir - cp.bearing + 180)*Math.PI)/180);
    ctx.strokeStyle = cp.relWindClass==="wind-headwind"?"#ef4444":cp.relWindClass==="wind-tailwind"?"#10b981":"#f59e0b";
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.lineTo(-3,2); ctx.moveTo(0,6); ctx.lineTo(3,2); ctx.stroke();
    ctx.restore();
  });

  // X-axis labels
  ctx.fillStyle="rgba(148,163,184,0.7)"; ctx.font='10px "IBM Plex Mono",monospace'; ctx.textAlign="center";
  for (let i=0; i<=5; i++) {
    const dv=(i/5)*totalDist;
    ctx.fillText(`${dv.toFixed(0)} nm`, getX(dv), pT+pH+16);
  }

  // Hover crosshair
  if (hlIdx>=0 && hlIdx<state.checkpoints.length) {
    const hcp=state.checkpoints[hlIdx], hx=getX(hcp.distNm);
    ctx.strokeStyle="rgba(255,255,255,0.65)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(hx,pT); ctx.lineTo(hx,pT+pH); ctx.stroke();
    [[hx,getWY(hcp.waveHeight),"#3b82f6"],[hx,getVY(hcp.windSpeed),"#f59e0b"]].forEach(([x,y,c])=>{
      ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x,y,4.5,0,Math.PI*2); ctx.fill();
    });
  }
}

function handleChartHover(mx, cW, cH) {
  const pL=48, pR=52, pW=cW-pL-pR;
  const totalDist = state.checkpoints[state.checkpoints.length-1].distNm;
  const hd = ((Math.max(pL,Math.min(pL+pW,mx))-pL)/pW)*totalDist;
  let best=0, bestD=Infinity;
  state.checkpoints.forEach((cp,i)=>{ const d=Math.abs(cp.distNm-hd); if(d<bestD){bestD=d;best=i;} });
  const cp=state.checkpoints[best];
  drawProfileChart(best);

  const speedUnit=els.speedUnit.value;
  const tip=els.chartTooltip;
  tip.hidden=false;
  tip.innerHTML=`<div><strong>${cp.name}</strong> — ${cp.distNm.toFixed(1)} nm / ${cp.distKm.toFixed(1)} km</div>
    <div>ETA UTC: <span style="color:#38bdf8">${formatUtcTime(cp.eta)}</span></div>
    <div>Wave Hs: <span style="color:#3b82f6;font-weight:600">${cp.waveHeight.toFixed(2)} m</span></div>
    <div>Wind: <span style="color:#f59e0b;font-weight:600">${cp.windSpeed.toFixed(1)} ${speedUnit}</span> @ ${cp.windDir}°</div>
    <div>Heading: ${cp.bearing.toFixed(0)}° — <span class="${cp.relWindClass}">${cp.relWindLabel}</span></div>
    ${cp.isSimulated?'<div style="color:#94a3b8;font-size:0.68rem">⚠ Synthetic data</div>':''}`;
  const tx=Math.min(mx+15,cW-245); tip.style.left=`${Math.max(8,tx)}px`; tip.style.top="8px";

  if (!state.scrubberMarker) {
    state.scrubberMarker = L.marker([cp.lat,cp.lng],{
      icon: L.divIcon({ className:"route-scrubber-marker", iconSize:[14,14], iconAnchor:[7,7] }),
      zIndexOffset: 2000,
    }).addTo(state.map);
  } else { state.scrubberMarker.setLatLng([cp.lat,cp.lng]); }
}

// ── FORECAST TABLE ────────────────────────────────────────────────────────────
function renderForecastTable() {
  const tb=els.forecastTableBody; tb.innerHTML="";
  if (!state.checkpoints.length) {
    tb.innerHTML='<tr><td colspan="9" class="text-center empty-cell">No forecast yet — generate one above.</td></tr>';
    return;
  }
  const su=els.speedUnit.value;
  state.checkpoints.forEach((cp,i)=>{
    const ss=cp.waveHeight>4?"Very Rough":cp.waveHeight>2.5?"Rough":cp.waveHeight>1.25?"Moderate":cp.waveHeight>0.5?"Slight":"Calm";
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><strong>${cp.name}</strong>${cp.isSimulated?'<span style="color:#64748b;font-size:0.65rem"> ⚠syn</span>':''}</td>
      <td>${cp.distNm.toFixed(1)} nm</td>
      <td>${formatUtcTimeShort(cp.eta)}</td>
      <td>${formatLocalTimeShort(cp.eta)}</td>
      <td>${cp.matchedTime?formatUtcTimeShort(new Date(cp.matchedTime)):"--"}</td>
      <td style="color:#3b82f6;font-weight:600">${cp.waveHeight.toFixed(2)} m (${ss})</td>
      <td style="color:#f59e0b;font-weight:600">${cp.windSpeed.toFixed(1)} ${su}</td>
      <td>${cp.windDir}° (${compassSector(cp.windDir)})</td>
      <td><span class="wind-rel-badge ${cp.relWindClass}">${cp.relWindLabel}</span></td>`;
    tr.addEventListener("mouseenter",()=>{
      drawProfileChart(i);
      if (!state.scrubberMarker) {
        state.scrubberMarker=L.marker([cp.lat,cp.lng],{
          icon:L.divIcon({className:"route-scrubber-marker",iconSize:[14,14],iconAnchor:[7,7]}),zIndexOffset:2000
        }).addTo(state.map);
      } else state.scrubberMarker.setLatLng([cp.lat,cp.lng]);
    });
    tb.appendChild(tr);
  });
}

function compassSector(d) {
  const s=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return s[Math.floor((d/22.5)+0.5)%16];
}

// ── PDF HELPER FUNCTIONS ───────────────────────────────────────────────────────
// Text wrapping function for PDF
function wrapText(doc, text, maxWidth, x, y, fontSize=7) {
  const words = text.split(' ');
  let line = '';
  let lines = [];
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = doc.getTextWidth(testLine);
    
    if (metrics > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  
  doc.setFontSize(fontSize);
  lines.forEach((l, i) => {
    doc.text(l, x, y + (i * fontSize * 0.4));
  });
  
  return lines.length * fontSize * 0.4;
}

// Capture current map as image and generate a route visualization
async function captureMapImage() {
  try {
    if (!state.map || state.waypoints.length < 2) return null;
    
    // Create a hidden canvas to draw the route map
    const mapCanvas = document.createElement('canvas');
    mapCanvas.width = 800;
    mapCanvas.height = 400;
    const ctx = mapCanvas.getContext('2d');
    
    console.log('[MapCapture] Capturing route map with OpenStreetMap tiles');
    
    // Calculate bounds of all waypoints
    let minLat = state.waypoints[0].lat;
    let maxLat = state.waypoints[0].lat;
    let minLng = state.waypoints[0].lng;
    let maxLng = state.waypoints[0].lng;
    
    state.waypoints.forEach(wp => {
      minLat = Math.min(minLat, wp.lat);
      maxLat = Math.max(maxLat, wp.lat);
      minLng = Math.min(minLng, wp.lng);
      maxLng = Math.max(maxLng, wp.lng);
    });
    
    // Add padding to bounds
    const latPadding = (maxLat - minLat) * 0.1 || 0.1;
    const lngPadding = (maxLng - minLng) * 0.1 || 0.1;
    minLat -= latPadding;
    maxLat += latPadding;
    minLng -= lngPadding;
    maxLng += lngPadding;
    
    // Calculate appropriate zoom level based on bounds
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);
    
    // Determine zoom level for decent detail
    let zoom = 8;
    if (maxDiff < 0.1) zoom = 10;
    if (maxDiff < 0.05) zoom = 11;
    if (maxDiff < 0.02) zoom = 12;
    
    console.log('[MapCapture] Route bounds: lat', minLat.toFixed(2), '-', maxLat.toFixed(2), 'lng', minLng.toFixed(2), '-', maxLng.toFixed(2), 'zoom:', zoom);
    
    // Fetch and render OSM tiles with route overlay
    const fetchAndDrawTiles = async () => {
      // Convert degrees to tile coordinates
      const latlngToTile = (lat, lng, z) => {
        const n = Math.pow(2, z);
        const x = Math.floor((lng + 180) / 360 * n);
        const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
        return { x, y, z };
      };
      
      // Convert tile+pixel coordinates back to lat/lng
      const tileToLatlng = (tileX, tileY, pixelX, pixelY, z) => {
        const n = Math.pow(2, z);
        const tilePixelX = tileX * 256 + pixelX;
        const tilePixelY = tileY * 256 + pixelY;
        const lng = (tilePixelX / (n * 256)) * 360 - 180;
        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * tilePixelY / (n * 256))));
        const lat = latRad * 180 / Math.PI;
        return { lat, lng };
      };
      
      const tileTopLeft = latlngToTile(maxLat, minLng, zoom);
      const tileBotRight = latlngToTile(minLat, maxLng, zoom);
      
      console.log('[MapCapture] Tiles needed: x', tileTopLeft.x, '-', tileBotRight.x, 'y', tileTopLeft.y, '-', tileBotRight.y);
      
      const tileSize = 256;
      const tilesWide = tileBotRight.x - tileTopLeft.x + 1;
      const tilesHigh = tileBotRight.y - tileTopLeft.y + 1;
      
      // Create temporary canvas for all tiles
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = tilesWide * tileSize;
      tileCanvas.height = tilesHigh * tileSize;
      const tileCtx = tileCanvas.getContext('2d');
      
      // Fill with ocean color as fallback
      tileCtx.fillStyle = '#a4c8e1';
      tileCtx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
      
      // Fetch each tile
      const tilePromises = [];
      for (let tx = tileTopLeft.x; tx <= tileBotRight.x; tx++) {
        for (let ty = tileTopLeft.y; ty <= tileBotRight.y; ty++) {
          const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
          const drawX = (tx - tileTopLeft.x) * tileSize;
          const drawY = (ty - tileTopLeft.y) * tileSize;
          
          const p = new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              tileCtx.drawImage(img, drawX, drawY);
              resolve();
            };
            img.onerror = () => {
              tileCtx.fillStyle = '#d0ccc4';
              tileCtx.fillRect(drawX, drawY, tileSize, tileSize);
              resolve();
            };
            img.src = tileUrl;
          });
          
          tilePromises.push(p);
        }
      }
      
      // Wait for all tiles to load
      await Promise.all(tilePromises);
      
      // Now draw route and markers on the tile canvas (before scaling)
      // This ensures perfect alignment
      
      // Create coordinate mapper for tile canvas
      const tileToCanvasCoord = (lat, lng) => {
        const tile = latlngToTile(lat, lng, zoom);
        const x = (tile.x - tileTopLeft.x) * tileSize + ((lng + 180) * tileSize / 360) % tileSize;
        const y = (tile.y - tileTopLeft.y) * tileSize + ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2) * tileSize % tileSize;
        return [x, y];
      };
      
      // Simpler coordinate mapping using mercator projection
      const mercatorY = (lat) => {
        return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI;
      };
      
      const tileToCanvasCoordSimple = (lat, lng) => {
        const n = Math.pow(2, zoom);
        const tileX = Math.floor((lng + 180) / 360 * n) - tileTopLeft.x;
        const tileY = Math.floor((1 - mercatorY(lat)) / 2 * n) - tileTopLeft.y;
        
        // Position within tile (0-1)
        const fracX = ((lng + 180) / 360 * n) - Math.floor((lng + 180) / 360 * n);
        const fracY = ((1 - mercatorY(lat)) / 2 * n) - Math.floor((1 - mercatorY(lat)) / 2 * n);
        
        const x = tileX * tileSize + fracX * tileSize;
        const y = tileY * tileSize + fracY * tileSize;
        return [x, y];
      };
      
      // Draw route line on tile canvas
      tileCtx.strokeStyle = '#00FF00';
      tileCtx.lineWidth = 3;
      tileCtx.lineJoin = 'round';
      tileCtx.lineCap = 'round';
      tileCtx.globalLineWidth = 3;
      
      tileCtx.beginPath();
      state.waypoints.forEach((wp, i) => {
        const [x, y] = tileToCanvasCoordSimple(wp.lat, wp.lng);
        if (i === 0) tileCtx.moveTo(x, y);
        else tileCtx.lineTo(x, y);
      });
      tileCtx.stroke();
      
      // Draw waypoint markers on tile canvas
      state.waypoints.forEach((wp, i) => {
        const [x, y] = tileToCanvasCoordSimple(wp.lat, wp.lng);
        
        // Draw circle background
        tileCtx.fillStyle = i === 0 ? '#3b82f6' : i === state.waypoints.length - 1 ? '#ef4444' : '#f59e0b';
        tileCtx.beginPath();
        tileCtx.arc(x, y, 6, 0, Math.PI * 2);
        tileCtx.fill();
        
        // Draw border
        tileCtx.strokeStyle = '#ffffff';
        tileCtx.lineWidth = 2;
        tileCtx.beginPath();
        tileCtx.arc(x, y, 6, 0, Math.PI * 2);
        tileCtx.stroke();
        
        // Draw index number
        tileCtx.fillStyle = '#ffffff';
        tileCtx.font = 'bold 9px sans-serif';
        tileCtx.textAlign = 'center';
        tileCtx.textBaseline = 'middle';
        tileCtx.fillText(String(i + 1), x, y);
      });
      
      // Draw vessel position on tile canvas if available
      if (state.vesselLat !== null && state.vesselLng !== null) {
        const [vx, vy] = tileToCanvasCoordSimple(state.vesselLat, state.vesselLng);
        tileCtx.fillStyle = '#06b6d4';
        tileCtx.beginPath();
        tileCtx.arc(vx, vy, 7, 0, Math.PI * 2);
        tileCtx.fill();
        tileCtx.strokeStyle = '#ffffff';
        tileCtx.lineWidth = 2;
        tileCtx.beginPath();
        tileCtx.arc(vx, vy, 7, 0, Math.PI * 2);
        tileCtx.stroke();
        tileCtx.fillStyle = '#ffffff';
        tileCtx.font = 'bold 10px sans-serif';
        tileCtx.textAlign = 'center';
        tileCtx.textBaseline = 'middle';
        tileCtx.fillText('V', vx, vy);
      }
      
      console.log('[MapCapture] Route drawn on tile canvas');
      
      // Now scale and draw the tile canvas onto the map canvas
      ctx.fillStyle = '#a4c8e1';
      ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
      
      // Calculate scaling to fit all tiles into map canvas
      const scale = Math.min(mapCanvas.width / tileCanvas.width, mapCanvas.height / tileCanvas.height);
      
      // Center the tiles on the map canvas
      const scaledWidth = tileCanvas.width * scale;
      const scaledHeight = tileCanvas.height * scale;
      const offsetX = (mapCanvas.width - scaledWidth) / 2;
      const offsetY = (mapCanvas.height - scaledHeight) / 2;
      
      ctx.drawImage(tileCanvas, offsetX, offsetY, scaledWidth, scaledHeight);
      
      console.log('[MapCapture] Tiles rendered successfully to main canvas');
    };
    
    // Execute tile fetching
    try {
      await fetchAndDrawTiles();
    } catch (e) {
      console.warn('[MapCapture] Tile fetching error, using fallback colors:', e);
      // Fallback: use ocean color
      ctx.fillStyle = '#a4c8e1';
      ctx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);
    }
    
    // Add title and coordinate labels to main canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 2;
    ctx.fillText('Route Map & Waypoint Locations', mapCanvas.width / 2, 5);
    
    // Return as data URL
    const dataUrl = mapCanvas.toDataURL('image/png');
    console.log('[MapCapture] Generated PNG data URL with navigation chart style, length:', dataUrl.length);
    return dataUrl;
  } catch (e) {
    console.error('Map capture failed:', e);
    return null;
  }
}

// ── PDF EXPORT ────────────────────────────────────────────────────────────────
async function exportPdf() {
  if (!state.checkpoints.length) { alert("Generate a route forecast before exporting PDF."); return; }
  if (!window.jspdf) { alert("PDF library not loaded yet. Try again in a moment."); return; }

  els.forecastStatusText.textContent = "Generating PDF...";
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const W=210, H=297;
  const margin=14, contentW=W-margin*2;
  let y=0;

  // ── HEADER BAND ────────────────────────────────────────────────────────────
  // Dark navy header matching MetService branding
  doc.setFillColor(14, 24, 48);
  doc.rect(0, 0, W, 46, "F");

  // Accent stripe
  doc.setFillColor(240, 150, 30);
  doc.rect(0, 46, W, 2.5, "F");

  // Main title
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(20);
  doc.text("ROUTE FORECAST REPORT", margin, 15);

  // Subtitle and details
  doc.setFont("helvetica","normal"); doc.setFontSize(8.5);
  doc.setTextColor(180, 200, 220);
  doc.text("Marine Weather & Wave Analysis", margin, 22);
  doc.text("Powered by MetOcean WxTiles", margin, 27.5);

  // Timestamp
  const generatedStr=`Generated: ${new Date().toLocaleString()} UTC`;
  doc.setFontSize(7.5);
  doc.setTextColor(140, 160, 190);
  doc.text(generatedStr, margin, 33);
  
  doc.setTextColor(140, 160, 190);
  doc.text("MetService New Zealand", margin, 37.5);

  // Report badge top-right with orange accent
  doc.setFillColor(240, 150, 30); 
  doc.roundedRect(W-68, 8, 54, 12, 1.5, 1.5, "F");
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(8);
  doc.text("MARINE FORECAST", W-64, 13);
  doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
  doc.text("Route Analysis & Routing Advisory", W-64, 17.5);

  y = 54;

  // ── VOYAGE SUMMARY CARDS ──────────────────────────────────────────────────
  doc.setFillColor(240, 245, 250);
  doc.rect(0, y-2, W, 50, "F");

  doc.setTextColor(14,24,48); doc.setFont("helvetica","bold"); doc.setFontSize(10.5);
  doc.text("VOYAGE SUMMARY", margin, y+4);

  // Summary card helper with improved styling and text wrapping
  const drawSummaryCard = (label, value, unit, x, cardW) => {
    doc.setFillColor(255,255,255);
    doc.roundedRect(x, y+10, cardW-2, 32, 1.5, 1.5, "F");
    doc.setDrawColor(180, 200, 220); doc.setLineWidth(0.4);
    doc.roundedRect(x, y+10, cardW-2, 32, 1.5, 1.5, "S");

    // Orange accent line at top
    doc.setFillColor(240, 150, 30);
    doc.rect(x, y+10, cardW-2, 1.5, "F");

    doc.setTextColor(100,120,160); doc.setFont("helvetica","normal"); doc.setFontSize(7);
    doc.text(label.toUpperCase(), x+3, y+16, {maxWidth: cardW-6, align: "left"});

    // Handle value with proper text wrapping and font size adjustment
    doc.setTextColor(14,24,48); doc.setFont("helvetica","bold");
    const maxContentWidth = cardW - 6;
    const maxContentHeight = 10; // Space for value + unit
    
    let displayValue = String(value);
    let fontSize = 13;
    
    // Try to fit the value, reducing font size as needed
    while (fontSize > 8) {
      doc.setFontSize(fontSize);
      const textWidth = doc.getTextWidth(displayValue);
      if (textWidth <= maxContentWidth) break;
      fontSize -= 1;
    }
    
    // Split value into lines if it's still too wide
    const valueLinesArray = doc.splitTextToSize(displayValue, maxContentWidth);
    const startValueY = y + 23;
    valueLinesArray.forEach((line, idx) => {
      if (idx < 2) { // Only show up to 2 lines for value
        doc.text(line, x+3, startValueY + idx*4);
      }
    });

    // Add unit on its own line
    doc.setTextColor(100,120,160); doc.setFont("helvetica","normal"); doc.setFontSize(6.5);
    if (unit) {
      const unitLinesArray = doc.splitTextToSize(String(unit), maxContentWidth);
      doc.text(unitLinesArray[0] || "", x+3, y+33);
    }
  };

  const totalDistNm = (state.checkpoints[state.checkpoints.length-1].distNm).toFixed(1);
  const totalDistKm = (state.checkpoints[state.checkpoints.length-1].distKm).toFixed(1);
  const speedVal    = Number(els.vesselSpeed.value).toFixed(1);
  const speedUnit   = els.speedUnit.value;
  const eta         = state.checkpoints[state.checkpoints.length-1].eta;
  const maxWave     = Math.max(...state.checkpoints.map(c=>c.waveHeight));
  const maxWind     = Math.max(...state.checkpoints.map(c=>c.windSpeed));

  const cardW = contentW / 5;
  const startX = margin;
  drawSummaryCard("Route Distance", totalDistNm+" nm", totalDistKm+" km", startX, cardW);
  drawSummaryCard("Vessel Speed", speedVal, speedUnit, startX+cardW, cardW);
  drawSummaryCard("Departure", formatUtcTimeShort(state.departureDate), "UTC", startX+cardW*2, cardW);
  drawSummaryCard("Arrival (ETA)", formatUtcTimeShort(eta), "UTC", startX+cardW*3, cardW);
  drawSummaryCard("Waypoints", String(state.waypoints.length), "points", startX+cardW*4, cardW);

  y += 46;

  // ── MAX CONDITIONS ROW ────────────────────────────────────────────────────
  doc.setFillColor(14, 24, 48);
  doc.rect(0, y+2, W, 28, "F");

  const drawMaxCard = (label, val, x, cW, colorR, colorG, colorB) => {
    doc.setFillColor(colorR,colorG,colorB); doc.roundedRect(x+1,y+5,cW-5,22,1.5,1.5,"F");
    
    // Add darker shade for better contrast
    doc.setDrawColor(Math.max(0, colorR-30), Math.max(0, colorG-30), Math.max(0, colorB-30));
    doc.setLineWidth(0.3);
    doc.roundedRect(x+1,y+5,cW-5,22,1.5,1.5,"S");
    
    doc.setTextColor(255,255,255); doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(label, x+4, y+10.5);
    doc.setFont("helvetica","bold"); doc.setFontSize(14);
    doc.text(val, x+4, y+23);
  };
  const halfW = contentW/2;
  drawMaxCard("MAX WAVE HEIGHT (Hs)", `${maxWave.toFixed(2)} m`, margin, halfW, 50,100,180);
  drawMaxCard(`MAX WIND SPEED (${speedUnit})`, `${maxWind.toFixed(1)} ${speedUnit}`, margin+halfW, halfW, 220,120,40);

  y += 32;

  y += 36;

  // ── SECTION DIVIDER HELPER ────────────────────────────────────────────────
  const sectionHeader = (title, yy) => {
    // Orange accent bar
    doc.setFillColor(240, 150, 30); doc.rect(margin, yy, 4, 7, "F");
    doc.setTextColor(14,24,48); doc.setFont("helvetica","bold"); doc.setFontSize(10.5);
    doc.text(title, margin+7, yy+5);
    // Thin line
    doc.setDrawColor(180, 200, 220); doc.setLineWidth(0.2);
    doc.line(margin+7+doc.getTextWidth(title)+3, yy+2.5, W-margin, yy+2.5);
    return yy+10;
  };

  // ── ROUTE MAP SECTION ──────────────────────────────────────────────────────
  if (y > H-100) { doc.addPage(); y=margin; }
  y = sectionHeader("ROUTE MAP", y+4);
  
  try {
    const mapImg = await captureMapImage();
    console.log('[ExportPDF] Map image received, type:', typeof mapImg, 'value exists:', !!mapImg);
    if (mapImg) {
      console.log('[ExportPDF] Adding map image to PDF at position y=', y);
      const mapH = 60;
      doc.addImage(mapImg, "PNG", margin, y, contentW, mapH);
      console.log('[ExportPDF] Map image added successfully');
      y += mapH + 6;
      
      // Map legend
      doc.setFillColor(240, 245, 250); doc.roundedRect(margin, y, contentW, 10, 1, 1, "F");
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(50, 70, 100);
      const legendText = "▌ Green line: Route path  |  Numbered markers: Waypoints (1=Start, 2–n=Intermediate, Last=Destination)  |  V marker: Current vessel position";
      const legendLines = doc.splitTextToSize(legendText, contentW - 8);
      legendLines.slice(0, 2).forEach((line, idx) => {
        doc.text(line, margin+4, y + 2.5 + idx*3.5);
      });
      y += 14;
    } else {
      console.error('[ExportPDF] mapImg is null/undefined!');
    }
  } catch(e) { 
    console.error("Map section failed:", e); 
    y += 10;
  }

  // ── WAYPOINTS SECTION ─────────────────────────────────────────────────────
  y = sectionHeader("ROUTE WAYPOINTS", y+4);
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(10,25,55);
  const wpCols=["#","Name","Latitude","Longitude"];
  const wpWidths=[8,contentW-8-30-30,30,30];
  let wx=margin;
  doc.setFillColor(240,245,252);
  doc.rect(margin, y, contentW, 6, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(50,80,130);
  wpCols.forEach((c,i)=>{ doc.text(c,wx+2,y+4); wx+=wpWidths[i]; }); y+=6;

  state.waypoints.forEach((w,i)=>{
    if (y > H-30) { doc.addPage(); y=margin; }
    if (i%2===0) { doc.setFillColor(252,254,255); doc.rect(margin,y,contentW,5,"F"); }
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(30,30,30);
    wx=margin;
    [String(i+1), w.name, w.lat.toFixed(5), w.lng.toFixed(5)].forEach((v,ci)=>{
      doc.text(v.length>32?v.slice(0,30)+"..":v, wx+2, y+3.5); wx+=wpWidths[ci];
    });
    y+=5;
  });
  y+=6;

  // ── PROFILE CHART SNAPSHOT ────────────────────────────────────────────────
  if (y > H-80) { doc.addPage(); y=margin; }
  y = sectionHeader("ALONG-ROUTE FORECAST PROFILE", y);

  // Render chart to a fresh canvas for capture
  const tmpCanvas=document.createElement("canvas");
  tmpCanvas.width=800; tmpCanvas.height=200;
  const tmpCtx=tmpCanvas.getContext("2d");
  tmpCtx.fillStyle="#f8fafc"; tmpCtx.fillRect(0,0,800,200);

  // Simple chart render into temp canvas
  renderChartToCanvas(tmpCtx, 800, 200);

  try {
    const imgData=tmpCanvas.toDataURL("image/png");
    const imgH=52;
    doc.addImage(imgData,"PNG",margin,y,contentW,imgH);
    y+=imgH+6;

    // Chart legend
    doc.setFillColor(240,246,255); doc.roundedRect(margin,y,contentW,8,1,1,"F");
    [[5,"#3b82f6","Wave Height (Hs, m)"],[65,"#f59e0b",`Wind Speed (${speedUnit})`],[130,"#38bdf8","↑ Wind Direction relative to heading"]].forEach(([lx,c,label])=>{
      const [r,g,b]=[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
      doc.setFillColor(r,g,b); doc.roundedRect(margin+lx,y+2.5,10,3,0.5,0.5,"F");
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(50,70,100);
      doc.text(label, margin+lx+12, y+5.5);
    });
    y+=14;
  } catch(e) { console.warn("Chart image capture failed", e); y+=6; }

  // ── DETAILED FORECAST TABLE ────────────────────────────────────────────────
  if (y > H-50) { doc.addPage(); y=margin; }
  y = sectionHeader("DETAILED CHECKPOINT FORECAST", y);

  const su=speedUnit;
  const cols=[
    {h:"Point",          w:28},
    {h:"Dist (nm)",      w:18},
    {h:"ETA UTC",        w:28},
    {h:"Local",          w:16},
    {h:`Wave Hs (m)`,   w:20},
    {h:`Wind (${su})`,  w:18},
    {h:"Dir",            w:14},
    {h:"Sea State",      w:22},
    {h:"Rel. Wind",      w:contentW-28-18-28-16-20-18-14-22},
  ];

  // Header row
  doc.setFillColor(10,25,55); doc.rect(margin,y,contentW,6,"F");
  doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(200,220,255);
  let cx=margin;
  cols.forEach(c=>{ doc.text(c.h,cx+1.5,y+4.2); cx+=c.w; });
  y+=6;

  const waveAlertColor = (hs) => hs>4?[220,50,50]:hs>2.5?[200,120,30]:hs>1.25?[180,160,20]:[30,140,80];
  const windAlertColor = (ws,su) => {
    const kts = su==="knots"?ws: su==="km/h"?ws/1.852:ws*1.944;
    return kts>35?[220,50,50]:kts>25?[200,120,30]:kts>15?[180,160,20]:[30,140,80];
  };

  state.checkpoints.filter((cp,i)=> cp.isWaypoint || i%(Math.max(1,Math.floor(state.checkpoints.length/40)))===0 || i===state.checkpoints.length-1).forEach((cp,ri)=>{
    if (y > H-18) { doc.addPage(); y=margin;
      // Re-draw header
      doc.setFillColor(10,25,55); doc.rect(margin,y,contentW,6,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(200,220,255);
      cx=margin; cols.forEach(c=>{ doc.text(c.h,cx+1.5,y+4.2); cx+=c.w; }); y+=6;
    }
    if (ri%2===0) { doc.setFillColor(248,251,255); doc.rect(margin,y,contentW,5,"F"); }
    if (cp.isWaypoint) { doc.setFillColor(235,245,255); doc.rect(margin,y,contentW,5,"F"); }

    doc.setFont(cp.isWaypoint?"helvetica":"helvetica","normal");
    if (cp.isWaypoint) doc.setFont("helvetica","bold");
    doc.setFontSize(6.5); doc.setTextColor(20,30,60);

    const ss=cp.waveHeight>4?"Very Rough":cp.waveHeight>2.5?"Rough":cp.waveHeight>1.25?"Moderate":cp.waveHeight>0.5?"Slight":"Calm";
    const vals=[
      cp.name.length>16?cp.name.slice(0,14)+"..":cp.name,
      cp.distNm.toFixed(1),
      formatUtcTimeShort(cp.eta).length>10?formatUtcTimeShort(cp.eta).slice(0,10):formatUtcTimeShort(cp.eta),
      formatLocalTimeShort(cp.eta).length>8?formatLocalTimeShort(cp.eta).slice(0,8):formatLocalTimeShort(cp.eta),
      cp.waveHeight.toFixed(2),
      cp.windSpeed.toFixed(1),
      `${cp.windDir}°${compassSector(cp.windDir)}`,
      ss.length>10?ss.slice(0,9):ss,
      cp.relWindLabel.length>12?cp.relWindLabel.slice(0,11):cp.relWindLabel,
    ];

    cx=margin;
    vals.forEach((v,vi)=>{
      if (vi===4) { const [r,g,b]=waveAlertColor(cp.waveHeight); doc.setTextColor(r,g,b); }
      else if (vi===5) { const [r,g,b]=windAlertColor(cp.windSpeed,speedUnit); doc.setTextColor(r,g,b); }
      else doc.setTextColor(20,30,60);
      doc.text(String(v), cx+1.5, y+3.6); cx+=cols[vi].w;
    });
    y+=5;
  });

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p=1; p<=pageCount; p++) {
    doc.setPage(p);
    // Dark navy footer matching header
    doc.setFillColor(14, 24, 48); doc.rect(0,H-12,W,12,"F");
    // Orange accent
    doc.setFillColor(240, 150, 30); doc.rect(0,H-12,W,2,"F");
    
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(140, 160, 190);
    doc.text("CONFIDENTIAL — FOR NAVIGATION PLANNING USE ONLY", margin, H-5.5);
    doc.text(`Page ${p} of ${pageCount}`, W-margin-doc.getTextWidth(`Page ${p} of ${pageCount}`), H-5.5);
    doc.setTextColor(100,120,160);
    doc.text("MetOcean Solutions | WxTiles Route Forecast", W/2, H-2, {align:"center"});
  }

  const fname=`WxTiles_Route_Forecast_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
  els.forecastStatusText.textContent = `PDF saved: ${fname}`;
}

// Render profile chart to an arbitrary canvas context (for PDF capture)
function renderChartToCanvas(ctx, W, H) {
  if (!state.checkpoints.length) return;
  const pL=48,pR=52,pT=28,pB=24, pW=W-pL-pR, pH=H-pT-pB;
  const totalDist=state.checkpoints[state.checkpoints.length-1].distNm;
  const maxWave=Math.max(3,...state.checkpoints.map(c=>c.waveHeight*1.25));
  const maxWind=Math.max(20,...state.checkpoints.map(c=>c.windSpeed*1.25));
  const getX=d=>pL+(d/totalDist)*pW;
  const getWY=h=>pT+pH-(h/maxWave)*pH;
  const getVY=w=>pT+pH-(w/maxWind)*pH;

  ctx.strokeStyle="rgba(0,0,0,0.1)"; ctx.lineWidth=1;
  for (let i=0;i<=4;i++){
    const y=pT+(pH/4)*i; ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(pL+pW,y); ctx.stroke();
    ctx.fillStyle="rgba(59,130,246,0.9)"; ctx.font='11px monospace'; ctx.textAlign="right";
    ctx.fillText(`${((4-i)/4*maxWave).toFixed(1)}m`,pL-4,y+3);
    ctx.fillStyle="rgba(245,158,11,0.9)"; ctx.textAlign="left";
    ctx.fillText(`${((4-i)/4*maxWind).toFixed(0)}`,pL+pW+4,y+3);
  }

  const wg=ctx.createLinearGradient(0,pT,0,pT+pH);
  wg.addColorStop(0,"rgba(59,130,246,0.4)"); wg.addColorStop(1,"rgba(59,130,246,0.03)");
  ctx.beginPath(); ctx.moveTo(getX(state.checkpoints[0].distNm),pT+pH);
  state.checkpoints.forEach(cp=>ctx.lineTo(getX(cp.distNm),getWY(cp.waveHeight)));
  ctx.lineTo(getX(state.checkpoints[state.checkpoints.length-1].distNm),pT+pH);
  ctx.closePath(); ctx.fillStyle=wg; ctx.fill();

  ctx.beginPath();
  state.checkpoints.forEach((cp,i)=>{const x=getX(cp.distNm),y=getWY(cp.waveHeight);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle="#3b82f6"; ctx.lineWidth=2.5; ctx.stroke();

  ctx.beginPath();
  state.checkpoints.forEach((cp,i)=>{const x=getX(cp.distNm),y=getVY(cp.windSpeed);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle="#f59e0b"; ctx.lineWidth=2; ctx.stroke();

  ctx.fillStyle="#222"; ctx.font="11px monospace"; ctx.textAlign="center";
  for (let i=0;i<=5;i++){
    const dv=(i/5)*totalDist;
    ctx.fillText(`${dv.toFixed(0)} nm`,getX(dv),pT+pH+16);
  }
}

// ── CSV EXPORT ────────────────────────────────────────────────────────────────
function exportCsv() {
  if (!state.checkpoints.length) { alert("Generate a route forecast before exporting."); return; }
  const su=els.speedUnit.value;
  const hdr=["Point","Lat","Lng","DistNm","DistKm","Bearing","ETA_UTC","ETA_Local","MatchedTimestep",`WaveHeight_m`,`WindSpeed_${su}`,"WindDir","RelWind","IsSimulated"];
  const rows=state.checkpoints.map(cp=>[
    `"${cp.name}"`,cp.lat.toFixed(6),cp.lng.toFixed(6),
    cp.distNm.toFixed(2),cp.distKm.toFixed(2),cp.bearing.toFixed(1),
    `"${cp.eta.toISOString()}"`,`"${cp.eta.toLocaleString()}"`,
    `"${cp.matchedTime||""}"`,cp.waveHeight.toFixed(2),cp.windSpeed.toFixed(1),
    cp.windDir,`"${cp.relWindLabel}"`,cp.isSimulated?"yes":"no",
  ]);
  downloadFile([hdr.join(","),...rows.map(r=>r.join(","))].join("\r\n"),"wxtiles_route_forecast.csv","text/csv;charset=utf-8;");
}

function exportRouteGeoJson() {
  if (state.waypoints.length < 2) { alert("Need at least 2 waypoints to export."); return; }
  const gj={type:"FeatureCollection",features:[
    {type:"Feature",properties:{name:"WxTiles Route",speed:els.vesselSpeed.value,speedUnit:els.speedUnit.value,departure:state.departureDate.toISOString()},
     geometry:{type:"LineString",coordinates:state.waypoints.map(w=>[w.lng,w.lat])}},
    ...state.waypoints.map((w,i)=>({type:"Feature",properties:{name:w.name,index:i+1},geometry:{type:"Point",coordinates:[w.lng,w.lat]}})),
  ]};
  downloadFile(JSON.stringify(gj,null,2),"wxtiles_route.geojson","application/json");
}

function downloadFile(content, name, mime) {
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(a.href); },200);
}

// ── FILE IMPORT ───────────────────────────────────────────────────────────────
function handleFileUpload(file) {
  if (!file) return;
  const reader=new FileReader();
  reader.onload=e => file.name.endsWith(".gpx") ? parseGpx(e.target.result) : parseGeoJson(e.target.result);
  reader.readAsText(file);
}

function parseGpx(text) {
  const xml=new DOMParser().parseFromString(text,"application/xml");
  const pts=[...xml.querySelectorAll("trkpt,rtept,wpt")];
  if (!pts.length) { alert("No coordinates found in GPX."); return; }
  clearRoute();
  const step=Math.max(1,Math.floor(pts.length/30));
  for (let i=0;i<pts.length;i+=step) {
    const p=pts[i], lat=parseFloat(p.getAttribute("lat")), lng=parseFloat(p.getAttribute("lon"));
    if (isFinite(lat)&&isFinite(lng)) addWaypoint(lat,lng,p.querySelector("name")?.textContent||`GPX ${state.waypoints.length+1}`);
  }
  const lp=pts[pts.length-1], ll=parseFloat(lp.getAttribute("lat")),lg=parseFloat(lp.getAttribute("lon"));
  if (isFinite(ll)&&isFinite(lg)&&(state.waypoints[state.waypoints.length-1]?.lat!==ll)) addWaypoint(ll,lg,"Finish");
  state.map.fitBounds(L.latLngBounds(state.waypoints.map(w=>[w.lat,w.lng])),{padding:[50,50]});
  els.forecastStatusText.textContent=`Imported ${state.waypoints.length} points from GPX.`;
}

function parseGeoJson(text) {
  try {
    const d=JSON.parse(text); clearRoute();
    const add=(lng,lat,name)=>{if(isFinite(lat)&&isFinite(lng))addWaypoint(lat,lng,name);};
    if (d.type==="LineString") d.coordinates.forEach((c,i)=>add(c[0],c[1],`Point ${i+1}`));
    else {
      (d.features||[d]).forEach(f=>{
        if(f.geometry?.type==="LineString") f.geometry.coordinates.forEach((c,i)=>add(c[0],c[1],f.properties?.name||`Point ${i+1}`));
        else if(f.geometry?.type==="Point") add(f.geometry.coordinates[0],f.geometry.coordinates[1],f.properties?.name);
      });
    }
    if (state.waypoints.length) state.map.fitBounds(L.latLngBounds(state.waypoints.map(w=>[w.lat,w.lng])),{padding:[50,50]});
    els.forecastStatusText.textContent=`Imported ${state.waypoints.length} points from GeoJSON.`;
  } catch { alert("Invalid GeoJSON file."); }
}

// ── CONFIGURATION MANAGEMENT ──────────────────────────────────────────────────
function saveConfiguration() {
  const configName = els.configName.value.trim();
  if (!configName) {
    alert("Please enter a configuration name");
    return;
  }

  const config = {
    id: Date.now().toString(),
    name: configName,
    created: new Date().toISOString(),
    vesselSpeed: Number(els.vesselSpeed.value),
    speedUnit: els.speedUnit.value,
    departureTime: els.departureTime.value,
    waypoints: state.waypoints.map(w => ({...w})),
    waveDataset: els.waveDataset.value,
    waveVariable: els.waveVariable.value,
    windDataset: els.windDataset.value,
    windVariable: els.windVariable.value,
    emailAddress: els.emailAddress.value,
    emailFrequency: state.emailFrequency,
  };

  state.savedConfigs.push(config);
  localStorage.setItem("wxtiles_route_configs", JSON.stringify(state.savedConfigs));
  els.configName.value = "";
  updateConfigList();
  els.forecastStatusText.textContent = `Configuration saved: ${configName}`;
}

function showLoadConfigDialog() {
  if (state.savedConfigs.length === 0) {
    alert("No saved configurations. Create one first.");
    return;
  }
  
  const configNames = state.savedConfigs.map(c => `${c.name} (${new Date(c.created).toLocaleDateString()})`).join("\n");
  const selectedName = prompt("Select configuration to load:\n" + configNames);
  
  if (!selectedName) return;
  
  const config = state.savedConfigs.find(c => c.name === selectedName.split(" (")[0]);
  if (config) loadConfiguration(config);
}

function loadConfiguration(config) {
  els.vesselSpeed.value = config.vesselSpeed;
  els.speedUnit.value = config.speedUnit;
  updateSpeedConversions();
  
  els.departureTime.value = config.departureTime;
  state.departureDate = new Date(config.departureTime);
  updateDepartureUtcDisplay();
  
  clearRoute();
  config.waypoints.forEach(w => addWaypoint(w.lat, w.lng, w.name));
  
  if (els.waveDataset) {
    els.waveDataset.value = config.waveDataset;
    updateTimestepsForDataset(config.waveDataset).then(() => {
      if (els.waveVariable) {
        els.waveVariable.value = config.waveVariable;
        loadWeatherLayer("wave");
      }
    });
  }
  
  if (els.windDataset) {
    els.windDataset.value = config.windDataset;
    if (els.windVariable) {
      els.windVariable.value = config.windVariable;
      loadWeatherLayer("wind");
    }
  }
  
  if (config.emailAddress) {
    els.emailAddress.value = config.emailAddress;
    state.emailAddress = config.emailAddress;
  }
  
  state.emailFrequency = config.emailFrequency;
  document.querySelectorAll('input[name="emailFrequency"]').forEach(r => {
    r.checked = (r.value === config.emailFrequency);
  });
  
  updateEmailStatus();
  updateRouteMetrics();
  els.forecastStatusText.textContent = `Configuration loaded: ${config.name}`;
}

function exportConfiguration() {
  if (state.savedConfigs.length === 0) {
    alert("No saved configurations to export.");
    return;
  }
  
  const json = JSON.stringify(state.savedConfigs, null, 2);
  const blob = new Blob([json], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `route_configurations_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateConfigList() {
  if (!els.configList) return;
  
  if (state.savedConfigs.length === 0) {
    els.configList.innerHTML = '<p class="empty-state">No saved configurations. Create one using the Save button.</p>';
    if (els.configCountBadge) els.configCountBadge.textContent = "0";
    return;
  }
  
  els.configList.innerHTML = state.savedConfigs.map(config => `
    <div class="config-item">
      <span class="config-item-name">${config.name}</span>
      <span class="config-item-date">${new Date(config.created).toLocaleDateString()}</span>
      <div class="config-item-buttons">
        <button class="config-btn" onclick="window.loadConfig('${config.id}')">Load</button>
        <button class="config-btn" onclick="window.deleteConfig('${config.id}')">Delete</button>
      </div>
    </div>
  `).join("");
  
  if (els.configCountBadge) els.configCountBadge.textContent = state.savedConfigs.length;
}

// Make config functions accessible globally for inline onclick handlers
window.loadConfig = function(configId) {
  const config = state.savedConfigs.find(c => c.id === configId);
  if (config) loadConfiguration(config);
};

window.deleteConfig = function(configId) {
  if (!confirm("Delete this configuration?")) return;
  state.savedConfigs = state.savedConfigs.filter(c => c.id !== configId);
  localStorage.setItem("wxtiles_route_configs", JSON.stringify(state.savedConfigs));
  updateConfigList();
};

// ── EMAIL AUTOMATION ──────────────────────────────────────────────────────────
function updateEmailStatus() {
  if (!els.emailStatusText) return;
  
  if (!state.emailAddress || !state.emailAddress.trim()) {
    els.emailStatusText.textContent = "Not configured";
    els.emailStatusText.style.color = "var(--text-dim)";
  } else {
    const freqText = state.emailFrequency === "2" ? "2x daily" : "4x daily";
    els.emailStatusText.textContent = `${state.emailAddress} (${freqText})`;
    els.emailStatusText.style.color = "var(--accent-cyan)";
    
    // Persist to localStorage
    localStorage.setItem("wxtiles_email_address", state.emailAddress);
    localStorage.setItem("wxtiles_email_frequency", state.emailFrequency);
  }
}

function openEmailSchedulerConfig() {
  alert(`Email Scheduler Configuration\n\nTo enable automated PDF emailing:\n\n1. Edit email_scheduler_config.json\n2. Set "enabled": true\n3. Configure SMTP credentials\n4. Run setup_email_scheduler.ps1 to register with Windows Task Scheduler\n\nCurrent recipient: ${state.emailAddress || "Not set"}\nFrequency: ${state.emailFrequency === "2" ? "2x daily" : "4x daily"}`);
}

function sendTestEmail() {
  if (!state.emailAddress || !state.emailAddress.trim()) {
    alert("Please enter an email address first");
    return;
  }
  
  alert(`Test email would be sent to: ${state.emailAddress}\n\nNote: Full email functionality requires backend integration.\n\nTo test, verify SMTP settings in email_scheduler_config.json and run:\npython email_scheduler.py`);
  els.forecastStatusText.textContent = "Test email simulation - check SMTP config in email_scheduler_config.json";
}

// ── LOAD PERSISTED SETTINGS ──────────────────────────────────────────────────
function loadPersistedSettings() {
  try {
    const saved = localStorage.getItem("wxtiles_route_configs");
    if (saved) {
      state.savedConfigs = JSON.parse(saved);
      updateConfigList();
    }
    
    const savedEmail = localStorage.getItem("wxtiles_email_address");
    if (savedEmail && els.emailAddress) {
      els.emailAddress.value = savedEmail;
      state.emailAddress = savedEmail;
    }
    
    const savedFreq = localStorage.getItem("wxtiles_email_frequency");
    if (savedFreq) {
      state.emailFrequency = savedFreq;
      document.querySelectorAll('input[name="emailFrequency"]').forEach(r => {
        r.checked = (r.value === savedFreq);
      });
    }
    
    updateEmailStatus();
  } catch(e) {
    console.warn("Failed to load persisted settings:", e);
  }
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────
function setupEventListeners() {
  els.vesselSpeed.addEventListener("input", updateSpeedConversions);
  els.speedUnit.addEventListener("change", () => {
    updateSpeedConversions();
    updateLegendFor(state.activeOverlay);
    if (state.checkpoints.length) runRouteForecast();
  });

  els.departureTime.addEventListener("change", () => {
    state.departureDate=new Date(els.departureTime.value);
    updateDepartureUtcDisplay(); updateRouteMetrics();
    if (state.checkpoints.length) runRouteForecast();
  });
  els.btnDepNow.addEventListener("click", ()=>setDepartureInput(new Date()));
  els.btnDepPlus6h.addEventListener("click",  ()=>shiftDep(6));
  els.btnDepPlus12h.addEventListener("click", ()=>shiftDep(12));
  els.btnDepPlus24h.addEventListener("click", ()=>shiftDep(24));

  els.btnToggleDraw.addEventListener("click",()=>{
    state.drawingEnabled=!state.drawingEnabled;
    els.btnToggleDraw.classList.toggle("active",state.drawingEnabled);
    els.btnToggleDraw.querySelector("span").textContent=state.drawingEnabled?"Click Map to Draw":"Draw Paused";
  });
  els.btnClearRoute.addEventListener("click", clearRoute);
  els.btnReverseRoute.addEventListener("click", reverseRoute);
  els.btnUndoPoint.addEventListener("click", undoLastWaypoint);
  els.btnLoadSample.addEventListener("click",()=>{ if(els.sampleRoutes.value) loadSampleRoute(els.sampleRoutes.value); });
  els.gpxFileInput.addEventListener("change",e=>handleFileUpload(e.target.files?.[0]));
  els.btnExportRoute.addEventListener("click", exportRouteGeoJson);

  els.basemapSelect.addEventListener("change",()=>setBasemap(els.basemapSelect.value));
  els.datasetFilter.addEventListener("input",()=>populateDatasetDropdowns(els.datasetFilter.value));

  // Wave controls — reload wave layer independently
  els.waveDataset.addEventListener("change", async ()=>{
    await loadVariablesFor(els.waveDataset.value, els.waveVariable, ["hs","significant_wave_height"]);
    await updateTimestepsForDataset(els.waveDataset.value);
    await loadWeatherLayer("wave");
    applyOverlayVisibility();
  });
  els.waveVariable.addEventListener("change", async ()=>{ await loadWeatherLayer("wave"); applyOverlayVisibility(); });
  els.waveOpacity.addEventListener("input",()=>{
    state.waveOpacity=Number(els.waveOpacity.value);
    if(state.waveSource) state.waveSource.setOpacity(state.waveOpacity);
  });

  // Wind controls — reload wind layer independently
  els.windDataset.addEventListener("change", async ()=>{
    await loadVariablesFor(els.windDataset.value, els.windVariable, ["wind","surface_wind","wind_speed"]);
    await loadWeatherLayer("wind");
    applyOverlayVisibility();
  });
  els.windVariable.addEventListener("change", async ()=>{ await loadWeatherLayer("wind"); applyOverlayVisibility(); });
  els.windOpacity.addEventListener("input",()=>{
    state.windOpacity=Number(els.windOpacity.value);
    if(state.windSource) state.windSource.setOpacity(state.windOpacity);
  });

  // Active overlay radio
  document.querySelectorAll('input[name="activeOverlay"]').forEach(r=>{
    r.addEventListener("change",()=>{ state.activeOverlay=r.value; applyOverlayVisibility(); });
  });

  // Timestep controls — update BOTH sources
  const setTime = async (t) => {
    state.selectedTime=t; updateTimeDisplay();
    try { if(state.waveSource) await state.waveSource.setTime(t); } catch{}
    try { if(state.windSource) await state.windSource.setTime(t); } catch{}
  };
  els.timeSelect.addEventListener("change",()=>setTime(els.timeSelect.value));
  els.timeSlider.addEventListener("input",()=>{ const t=state.allTimes[Number(els.timeSlider.value)]; if(t) setTime(t); });
  els.btnPrevTime.addEventListener("click",()=>{
    const i=state.allTimes.indexOf(state.selectedTime);
    if(i>0) setTime(state.allTimes[i-1]);
  });
  els.btnNextTime.addEventListener("click",()=>{
    const i=state.allTimes.indexOf(state.selectedTime);
    if(i>=0&&i<state.allTimes.length-1) setTime(state.allTimes[i+1]);
  });

  els.btnRunForecast.addEventListener("click", runRouteForecast);
  els.btnExportCsv.addEventListener("click", exportCsv);
  if (els.btnExportPdf) els.btnExportPdf.addEventListener("click", exportPdf);

  // Vessel location controls
  if (els.btnUpdateVesselPos) {
    els.btnUpdateVesselPos.addEventListener("click", updateVesselPosition);
  }
  if (els.btnUseMapClick) {
    els.btnUseMapClick.addEventListener("click", toggleMapClickMode);
  }

  // Email automation controls
  if (els.btnConfigureEmail) {
    els.btnConfigureEmail.addEventListener("click", openEmailSchedulerConfig);
  }
  if (els.btnTestEmail) {
    els.btnTestEmail.addEventListener("click", sendTestEmail);
  }
  document.querySelectorAll('input[name="emailFrequency"]').forEach(r => {
    r.addEventListener("change", () => {
      state.emailFrequency = r.value;
      updateEmailStatus();
    });
  });
  if (els.emailAddress) {
    els.emailAddress.addEventListener("blur", () => {
      state.emailAddress = els.emailAddress.value;
      updateEmailStatus();
    });
  }

  // Configuration management controls
  if (els.btnSaveConfig) {
    els.btnSaveConfig.addEventListener("click", saveConfiguration);
  }
  if (els.btnLoadConfig) {
    els.btnLoadConfig.addEventListener("click", showLoadConfigDialog);
  }
  if (els.btnExportConfig) {
    els.btnExportConfig.addEventListener("click", exportConfiguration);
  }

  // Drawer & tabs
  document.querySelectorAll(".drawer-tabs .tab-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".drawer-tabs .tab-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const id=btn.dataset.tab;
      document.querySelectorAll(".tab-pane").forEach(p=>p.classList.remove("active"));
      document.getElementById(id)?.classList.add("active");
      if(id==="chartTab") drawProfileChart();
    });
  });
  els.btnToggleDrawer.addEventListener("click",()=>{
    const min=els.bottomDrawer.classList.toggle("minimized");
    els.drawerToggleText.textContent=min?"Expand":"Minimize";
    setTimeout(()=>{ state.map.invalidateSize(); if(!min) drawProfileChart(); },280);
  });
}

function shiftDep(h) { state.departureDate=new Date(state.departureDate.getTime()+h*3600000); setDepartureInput(state.departureDate); }
function setDepartureInput(d) {
  const pad=n=>String(n).padStart(2,"0");
  els.departureTime.value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  updateDepartureUtcDisplay(); updateRouteMetrics();
  if(state.checkpoints.length) runRouteForecast();
}

// ── TIME FORMATTERS ───────────────────────────────────────────────────────────
function formatUtcTime(val) {
  const d=new Date(val); if(isNaN(d)) return String(val);
  const pad=n=>String(n).padStart(2,"0");
  const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
function formatUtcTimeShort(d) {
  const pad=n=>String(n).padStart(2,"0");
  const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${pad(d.getUTCDate())} ${M[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}
function formatLocalTimeShort(d) {
  const pad=n=>String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
