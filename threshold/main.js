import { WxAPI } from "https://esm.sh/@metoceanapi/wxtiles-leaflet";
import { contours as d3Contours } from "https://esm.sh/d3-contour@4";

const WX_DEMO_CSS_URL = "https://metoceanapi.github.io/wxtiles-leaflet/script/script.css";

const COLOR_SCHEMES = {
  none: ["#00000000", "#00000000"],
  diverging_blue_red: ["#2166acff", "#92c5deff", "#f7f7f7ff", "#f4a582ff", "#b2182bff"],
  rainbow: ["#ff0000ff", "#ffff00ff", "#00ff00ff", "#00ffffff", "#0000ffff", "#ff00ffff"],
  rainbow_zero: ["#ff000000", "#ff0000ff", "#ffff00ff", "#00ff00ff", "#00ffffff", "#0000ffff", "#ff00ffff"],
  rainbow_wrap: ["#ff0000ff", "#ffff00ff", "#00ff00ff", "#00ffffff", "#0000ffff", "#ff00ffff", "#ff0000ff"],
  rainbow_backwards: ["#0000ffff", "#00ffffff", "#00ff00ff", "#ffff00ff", "#ff0000ff", "#ff00ffff"],
  rainbow_backwards_zero: ["#0000ff00", "#0000ffff", "#00ffffff", "#00ff00ff", "#ffff00ff", "#ff0000ff", "#ff00ffff"],
  bluebird: ["#0000ffff", "#ff00ffff", "#00ffffff", "#9000ffff", "#9090ffff"],
  bluebird_zero: ["#0000ff00", "#0000ffff", "#ff00ffff", "#00ffffff", "#9000ffff", "#9090ffff"],
  black_white: ["#000000ff", "#ffffffff"],
  white_black: ["#ffffffff", "#000000ff"],
  reddish: ["#ff00ffff", "#ff0000ff", "#ffff00ff"],
  greenish: ["#ffff00ff", "#00ff00ff", "#00ffffff"],
  blueish: ["#ff00ffff", "#0000ffff", "#00ffffff"],
  hspastel: ["#AC6EA4FF", "#8E92BDFF", "#ACD4DEFF", "#E9DC8EFF", "#E7A97DFF", "#E9074FFF", "#BE7E68FF", "#A88F86FF"],
  black: ["#000000ff", "#000000ff"],
  white: ["#ffffffff", "#ffffffff"],
  transparent: ["#ffffff00"],
  peach_red_zero: ["#fdd49f00", "#fdd49fff", "#d7301fff"],
  Clouds: ["#D0CCCC00", "#D0CCCC33", "#D0CCCC66", "#FFFFFF80", "#FFFFFFBF"],
};

const COLOR_SCHEME_LEVELS = {
  Clouds: [20, 50, 95, 98, 100],
};

const DEFAULT_STYLE = {
  parent: undefined,
  name: "base",
  fill: "gradient",
  isolineColor: "none",
  isolineText: true,
  vectorType: "arrows",
  vectorColor: "inverted",
  vectorFactor: 1,
  streamLineColor: "none",
  streamLineSpeedFactor: 1,
  streamLineStatic: false,
  showBelowMin: true,
  showAboveMax: true,
  colorScheme: "diverging_blue_red",
  blurRadius: 0,
  addDegrees: 0,
  units: "",
  extraUnits: undefined,
  mask: "none",
  gl: {
    animationSpeed: 1,
    noiseTexturePow: 5,
    vectorFieldFactor: 1,
    animationIntensity: 5,
    wavesCount: 4,
  },
};

const state = {
  wxapi: undefined,
  wxsource: undefined,
  datasetManager: undefined,
  allDatasets: [],
  allTimes: [],
  currentStyle: structuredClone(DEFAULT_STYLE),
  busy: false,
  animating: false,
  animationAbort: undefined,
  cursorLatLng: L.latLng(0, 0),
};

const OMITTED_STYLE_KEYS = new Set(["isolineTextSizeEm", "isolineTextBackground"]);
const shpwriteZip = window.shpwrite?.zip;

// Map native unit strings → ordered list of available display units
const UNIT_ALTERNATIVES = {
  K:                  ["K", "C", "F"],
  C:                  ["C", "K", "F"],
  degC:               ["degC", "K", "F"],
  "m.s^{-1}":         ["m.s^{-1}", "knot", "km.h^{-1}", "mph", "Beaufort"],
  "knot":             ["knot", "m.s^{-1}", "km.h^{-1}", "mph"],
  Pa:                 ["Pa", "hPa", "mbar"],
  hPa:                ["hPa", "Pa", "mbar"],
  "(0 - 1)":          ["(0 - 1)", "percent"],
  percent:            ["percent", "(0 - 1)"],
  "%":                ["%"],
  m:                  ["m", "cm", "mm", "ft", "km"],
  cm:                 ["cm", "m", "mm", "ft"],
  mm:                 ["mm", "cm", "m", "in"],
  ft:                 ["ft", "m"],
  km:                 ["km", "m", "miles", "nm"],
  "kg.m^{-2}.s^{-1}": ["kg.m^{-2}.s^{-1}", "mm.h^{-1}", "in.h^{-1}"],
  "mm/h":             ["mm/h", "in/h"],
  "W.m^{-2}":         ["W.m^{-2}"],
  "J.kg^{-1}":        ["J.kg^{-1}"],
  deg:                ["deg", "rad"],
  s:                  ["s", "min", "h"],
};

const els = {
  status: document.getElementById("status"),
  exportStatus: document.getElementById("exportStatus"),
  meta: document.getElementById("meta"),
  cursor: document.getElementById("cursor"),
  values: document.getElementById("values"),
  datasetFilter: document.getElementById("datasetFilter"),
  dataset: document.getElementById("dataset"),
  variable: document.getElementById("variable"),
  thresholdVariable: document.getElementById("thresholdVariable"),
  thresholdOp: document.getElementById("thresholdOp"),
  thresholdValue: document.getElementById("thresholdValue"),
  thresholdGrid: document.getElementById("thresholdGrid"),
  timeSelect: document.getElementById("timeSelect"),
  startBtn: document.getElementById("startBtn"),
  exportThresholdBtn: document.getElementById("exportThresholdBtn"),
  styleToggleBtn: document.getElementById("styleToggleBtn"),
  styleEditor: document.getElementById("styleEditor"),
  styleJson: document.getElementById("styleJson"),
  legend: document.getElementById("legend"),
  colorScheme: document.getElementById("colorScheme"),
  palettePreview: document.getElementById("palettePreview"),
};

let liveStyleTimer;
let hasPendingStyleApply = false;
let pendingStyleObject;
let pendingForceReload = false;

const map = L.map("map", {
  center: [-40.75, 174.5],
  zoom: 7,
  worldCopyJump: true,
  zoomControl: true,
});

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Map legend overlay (Leaflet custom control)
const MapLegendControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd() {
    const div = L.DomUtil.create("div", "wx-map-legend");
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    div.innerHTML =
      '<div class="wx-legend-header"><span id="mapLegendTitle">—</span></div>' +
      '<canvas id="mapLegendCanvas" width="240" height="14"></canvas>' +
      '<div id="mapLegendTicks" class="wx-legend-ticks"></div>';
    return div;
  },
});
new MapLegendControl().addTo(map);

function setBusy(nextBusy) {
  state.busy = nextBusy;
  els.startBtn.disabled = nextBusy;
  els.dataset.disabled = nextBusy;
  els.variable.disabled = nextBusy;
  els.timeSelect.disabled = nextBusy;
}

function setStatus(message) {
  els.status.textContent = message;
}

function setExportStatus(message) {
  if (els.exportStatus) {
    els.exportStatus.textContent = message;
  }
}

function syncThresholdVariableOptions(preferred) {
  if (!els.thresholdVariable) return;

  const variableOptions = Array.from(els.variable.options).map((opt) => opt.value);
  const previous = preferred || els.thresholdVariable.value || els.variable.value;
  els.thresholdVariable.innerHTML = "";

  for (const variable of variableOptions) {
    const option = document.createElement("option");
    option.value = variable;
    option.textContent = variable;
    els.thresholdVariable.append(option);
  }

  if (variableOptions.length === 0) return;
  els.thresholdVariable.value = variableOptions.includes(previous) ? previous : variableOptions[0];
}

function sanitizeFileToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function evaluateThreshold(value, threshold, operator) {
  if (!Number.isFinite(value)) return false;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  return value > threshold;
}

function contourGridToGeoJsonFeatureCollection(contourData, bounds, cols, rows, properties) {
  const west = bounds.getWest();
  const east = bounds.getEast();
  const north = bounds.getNorth();
  const south = bounds.getSouth();
  const lngSpan = east - west;
  const latSpan = north - south;

  const coordToLonLat = (x, y) => {
    const lon = west + (Math.max(0, Math.min(cols - 1, x)) / Math.max(cols - 1, 1)) * lngSpan;
    const lat = north - (Math.max(0, Math.min(rows - 1, y)) / Math.max(rows - 1, 1)) * latSpan;
    return [lon, lat];
  };

  const features = [];
  for (const geom of contourData || []) {
    const polygons = geom?.coordinates;
    if (!Array.isArray(polygons) || polygons.length === 0) continue;

    const mappedPolygons = polygons.map((rings) =>
      rings.map((ring) => ring.map(([x, y]) => coordToLonLat(x, y))),
    );

    // shp-write reliably handles Polygon features; flatten MultiPolygon parts.
    for (const polygonRings of mappedPolygons) {
      features.push({
        type: "Feature",
        properties: { ...properties },
        geometry: {
          type: "Polygon",
          coordinates: polygonRings,
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function downloadZipBlob(zipPayload, fileName) {
  const stringToUint8 = (text) => {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      out[i] = text.charCodeAt(i) & 0xff;
    }
    return out;
  };

  const base64ToUint8 = (b64) => {
    const binary = atob(b64);
    return stringToUint8(binary);
  };

  let blob;
  if (zipPayload instanceof Blob) {
    blob = zipPayload;
  } else if (zipPayload instanceof ArrayBuffer) {
    blob = new Blob([zipPayload], { type: "application/zip" });
  } else if (ArrayBuffer.isView(zipPayload)) {
    blob = new Blob([zipPayload.buffer], { type: "application/zip" });
  } else if (typeof zipPayload === "string") {
    const trimmed = zipPayload.trim();
    const looksLikeBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0;
    const bytes = looksLikeBase64 ? base64ToUint8(trimmed) : stringToUint8(zipPayload);
    blob = new Blob([bytes], { type: "application/zip" });
  } else {
    throw new Error("Unsupported zip payload returned by shpwrite.zip.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName}.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportThresholdShapefile() {
  if (!state.wxsource) {
    setExportStatus("thresholdExport=no-active-layer");
    return;
  }

  if (typeof shpwriteZip !== "function") {
    setExportStatus("thresholdExport=shapefile-library-unavailable");
    return;
  }

  const selectedVariable = els.variable.value;
  const threshold = Number(els.thresholdValue?.value);
  const operator = els.thresholdOp?.value || ">";
  const gridSize = Number(els.thresholdGrid?.value || "120");

  if (!selectedVariable) {
    setExportStatus("thresholdExport=select-variable");
    return;
  }
  if (!Number.isFinite(threshold)) {
    setExportStatus("thresholdExport=threshold-required");
    return;
  }
  if (!Number.isFinite(gridSize) || gridSize < 40 || gridSize > 300) {
    setExportStatus("thresholdExport=invalid-grid-size");
    return;
  }

  const dataset = els.dataset.value;
  const selectedTime = els.timeSelect.value;
  const currentVariable = els.variable.value;
  const currentStyle = cleanStyle(state.currentStyle);

  els.exportThresholdBtn.disabled = true;
  setExportStatus("thresholdExport=sampling-grid");

  let tempLayer;
  try {
    let sourceForExport = state.wxsource;
    if (selectedVariable !== currentVariable) {
      tempLayer = state.datasetManager.createSourceLayer(
        {
          variable: selectedVariable,
          time: selectedTime,
          wxstyle: currentStyle,
        },
        {
          id: "wxsource-threshold-export",
          opacity: 0,
          attribution: "WxTiles",
        },
      );

      map.addLayer(tempLayer);
      await new Promise((resolve) => tempLayer.once("load", resolve));
      sourceForExport = tempLayer;
    }

    const bounds = map.getBounds();
    const cols = Math.round(gridSize);
    const rows = Math.round(gridSize);
    const values = new Array(cols * rows);
    let validCount = 0;
    let exceedCount = 0;

    const west = bounds.getWest();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const lngSpan = east - west;
    const latSpan = north - south;

    for (let y = 0; y < rows; y += 1) {
      const lat = north - (y / Math.max(rows - 1, 1)) * latSpan;
      for (let x = 0; x < cols; x += 1) {
        const lng = west + (x / Math.max(cols - 1, 1)) * lngSpan;
        const info = sourceForExport.getLayerInfoAtLatLon(L.latLng(lat, lng).wrap(), map);
        const value = info?.inStyleUnits?.[0];
        const idx = y * cols + x;
        if (Number.isFinite(value)) {
          validCount += 1;
          values[idx] = evaluateThreshold(value, threshold, operator) ? 1 : 0;
          if (values[idx] === 1) {
            exceedCount += 1;
          }
        } else {
          values[idx] = 0;
        }
      }
    }

    if (validCount === 0) {
      setExportStatus("thresholdExport=no-valid-samples-in-view");
      return;
    }

    if (exceedCount === 0) {
      setExportStatus("thresholdExport=no-area-matches-threshold");
      return;
    }

    setExportStatus("thresholdExport=building-polygons");
    const contourData = d3Contours().size([cols, rows]).thresholds([0.5])(values);
    const variableMeta = sourceForExport.getCurrentVariableMeta?.() || state.wxsource.getCurrentVariableMeta?.() || {};
    const displayUnits = state.currentStyle.units || variableMeta.units || "";

    const featureCollection = contourGridToGeoJsonFeatureCollection(contourData, bounds, cols, rows, {
      dataset,
      variable: selectedVariable,
      operator,
      threshold,
      units: displayUnits,
      time: selectedTime,
      sample_grid: `${cols}x${rows}`,
      map_west: Number(west.toFixed(6)),
      map_south: Number(south.toFixed(6)),
      map_east: Number(east.toFixed(6)),
      map_north: Number(north.toFixed(6)),
    });

    if (!featureCollection.features.length) {
      setExportStatus("thresholdExport=no-polygons-generated");
      return;
    }

    const timeToken = sanitizeFileToken(selectedTime).replace(/:/g, "-");
    const opTokenMap = {
      ">": "gt",
      ">=": "gte",
      "<": "lt",
      "<=": "lte",
    };
    const opToken = opTokenMap[operator] || "gt";
    const thresholdValueToken = sanitizeFileToken(String(threshold).replace(".", "p"));
    const thresholdToken = `thr_${opToken}_${thresholdValueToken}`;
    const fileName = sanitizeFileToken(`${dataset}_${selectedVariable}_${thresholdToken}_${timeToken}`) || "threshold_export";
    const shapeBaseName = sanitizeFileToken(`${dataset}_${selectedVariable}_${thresholdToken}`) || "threshold_extent";

    setExportStatus("thresholdExport=writing-shape-zip");
    const zipPayload = await shpwriteZip(featureCollection, {
      folder: fileName,
      filename: fileName,
      outputType: "blob",
      types: { polygon: shapeBaseName },
    });
    downloadZipBlob(zipPayload, fileName);

    setExportStatus(
      `thresholdExport=done features=${featureCollection.features.length} files=${shapeBaseName}.{shp,shx,dbf,prj}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setExportStatus(`thresholdExport=failed ${message}`);
  } finally {
    if (tempLayer && map.hasLayer(tempLayer)) {
      map.removeLayer(tempLayer);
    }
    els.exportThresholdBtn.disabled = false;
  }
}

function cleanStyle(style) {
  const output = {};
  for (const [key, value] of Object.entries(style)) {
    if (OMITTED_STYLE_KEYS.has(key)) continue;
    if (value === undefined || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const cleaned = cleanStyle(value);
      if (Object.keys(cleaned).length > 0) output[key] = cleaned;
      continue;
    }
    output[key] = value;
  }
  return output;
}

function parseMaybeJson(value) {
  const text = value.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function modeToValue(modeEl, customEl) {
  return modeEl.value === "custom" ? customEl.value : modeEl.value;
}

function updateStyleJson() {
  els.styleJson.value = JSON.stringify(sortObjectKeysDeep(cleanStyle(state.currentStyle)), null, 2);
}

function sortObjectKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (!value || typeof value !== "object") return value;

  const sorted = {};
  for (const key of Object.keys(value).sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()))) {
    sorted[key] = sortObjectKeysDeep(value[key]);
  }
  return sorted;
}

function fillColorSchemes() {
  for (const key of Object.keys(COLOR_SCHEMES)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    els.colorScheme.append(option);
  }
}

function getPaletteFromStyle(style) {
  if (Array.isArray(style.colors) && style.colors.length > 0) {
    return style.colors;
  }
  return COLOR_SCHEMES[style.colorScheme] || COLOR_SCHEMES.rainbow;
}

function renderPalette(colors) {
  els.palettePreview.innerHTML = "";
  for (const color of colors) {
    const chip = document.createElement("span");
    chip.className = "palette-chip";
    chip.style.background = color;
    chip.title = color;
    els.palettePreview.append(chip);
  }
}

function populateUnitsDropdown(nativeUnits, currentUnits) {
  const unitsEl = document.getElementById("units");
  if (!unitsEl) return;

  const alternatives = UNIT_ALTERNATIVES[nativeUnits] ?? (nativeUnits ? [nativeUnits] : []);
  // Ensure the currently-selected unit is always present
  const extra = currentUnits && !alternatives.includes(currentUnits) ? [currentUnits] : [];
  const options = [...new Set([...alternatives, ...extra])];

  const prevValue = unitsEl.value || currentUnits || nativeUnits || "";
  unitsEl.innerHTML = "";

  if (options.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(default)";
    unitsEl.append(opt);
    return;
  }

  for (const unit of options) {
    const opt = document.createElement("option");
    opt.value = unit;
    opt.textContent = unit === nativeUnits ? `${unit} \u2605` : unit;
    unitsEl.append(opt);
  }

  // Restore previous selection if available
  unitsEl.value = options.includes(prevValue) ? prevValue : (nativeUnits || options[0] || "");
}

function getCurrentStyleFromControls() {
  const style = {
    parent: document.getElementById("styleParent").value || undefined,
    name: document.getElementById("styleName").value || undefined,
    fill: document.getElementById("fill").value,
    isolineColor: modeToValue(document.getElementById("isolineColorMode"), document.getElementById("isolineColorCustom")),
    isolineText: document.getElementById("isolineText").checked,
    vectorType: document.getElementById("vectorType").value,
    vectorColor: modeToValue(document.getElementById("vectorColorMode"), document.getElementById("vectorColorCustom")),
    vectorFactor: Number(document.getElementById("vectorFactor").value),
    streamLineColor: modeToValue(document.getElementById("streamLineColorMode"), document.getElementById("streamLineColorCustom")),
    streamLineSpeedFactor: Number(document.getElementById("streamLineSpeedFactor").value),
    streamLineStatic: document.getElementById("streamLineStatic").checked,
    showBelowMin: document.getElementById("showBelowMin").checked,
    showAboveMax: document.getElementById("showAboveMax").checked,
    colorScheme: els.colorScheme.value,
    colors: parseMaybeJson(document.getElementById("colors").value),
    colorMap: parseMaybeJson(document.getElementById("colorMap").value),
    levels: parseMaybeJson(document.getElementById("levels").value),
    blurRadius: Number(document.getElementById("blurRadius").value),
    addDegrees: Number(document.getElementById("addDegrees").value),
    units: document.getElementById("units").value,
    extraUnits: parseMaybeJson(document.getElementById("extraUnits").value),
    mask: document.getElementById("mask").value,
    gl: {
      animationSpeed: Number(document.getElementById("glAnimationSpeed").value),
      noiseTexturePow: Number(document.getElementById("glNoiseTexturePow").value),
      vectorFieldFactor: Number(document.getElementById("glVectorFieldFactor").value),
      animationIntensity: Number(document.getElementById("glAnimationIntensity").value),
      wavesCount: Number(document.getElementById("glWavesCount").value),
    },
  };

  return cleanStyle(style);
}

function setModeAndColor(modeId, colorId, value) {
  const modeEl = document.getElementById(modeId);
  const colorEl = document.getElementById(colorId);
  if (typeof value === "string" && value.startsWith("#")) {
    modeEl.value = "custom";
    const normalized = value.length === 9 ? value.slice(0, 7) : value;
    colorEl.value = normalized;
    return;
  }

  modeEl.value = value || "none";
}

function writeStyleToControls(style) {
  document.getElementById("styleParent").value = style.parent || "";
  document.getElementById("styleName").value = style.name || "";
  document.getElementById("fill").value = style.fill || "gradient";
  setModeAndColor("isolineColorMode", "isolineColorCustom", style.isolineColor || "inverted");
  document.getElementById("isolineText").checked = Boolean(style.isolineText);
  document.getElementById("vectorType").value = style.vectorType || "none";
  setModeAndColor("vectorColorMode", "vectorColorCustom", style.vectorColor || "inverted");
  document.getElementById("vectorFactor").value = String(style.vectorFactor ?? 1);
  setModeAndColor("streamLineColorMode", "streamLineColorCustom", style.streamLineColor || "none");
  document.getElementById("streamLineSpeedFactor").value = String(style.streamLineSpeedFactor ?? 1);
  document.getElementById("streamLineStatic").checked = Boolean(style.streamLineStatic);
  document.getElementById("showBelowMin").checked = Boolean(style.showBelowMin);
  document.getElementById("showAboveMax").checked = Boolean(style.showAboveMax);
  els.colorScheme.value = style.colorScheme || "";

  const hasColorMap = Array.isArray(style.colorMap) && style.colorMap.length > 0;
  if (hasColorMap) {
    document.getElementById("colors").value = "";
    document.getElementById("colorMap").value = JSON.stringify(style.colorMap);
    document.getElementById("levels").value = "";
  } else {
    document.getElementById("colors").value = style.colors ? JSON.stringify(style.colors) : "";
    document.getElementById("colorMap").value = style.colorMap ? JSON.stringify(style.colorMap) : "";
    document.getElementById("levels").value = Array.isArray(style.levels) ? JSON.stringify(style.levels.map((v) => +Number(v).toFixed(2))) : "";
  }
  document.getElementById("blurRadius").value = String(style.blurRadius ?? 0);
  document.getElementById("addDegrees").value = String(style.addDegrees ?? 0);

  // Units select: add the value as an option if it doesn't exist yet
  const unitsEl = document.getElementById("units");
  const unitsVal = style.units || "";
  if (unitsVal && !Array.from(unitsEl.options).some((o) => o.value === unitsVal)) {
    const opt = document.createElement("option");
    opt.value = unitsVal;
    opt.textContent = unitsVal;
    unitsEl.append(opt);
  }
  unitsEl.value = unitsVal;

  document.getElementById("extraUnits").value = style.extraUnits ? JSON.stringify(style.extraUnits) : "";
  document.getElementById("mask").value = style.mask || "none";
  document.getElementById("glAnimationSpeed").value = String(style.gl?.animationSpeed ?? 1);
  document.getElementById("glNoiseTexturePow").value = String(style.gl?.noiseTexturePow ?? 5);
  document.getElementById("glVectorFieldFactor").value = String(style.gl?.vectorFieldFactor ?? 1);
  document.getElementById("glAnimationIntensity").value = String(style.gl?.animationIntensity ?? 5);
  document.getElementById("glWavesCount").value = String(style.gl?.wavesCount ?? 4);
}

function drawLegend(style) {
  const canvas = els.legend;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const colors = getPaletteFromStyle(style);
  const gradient = ctx.createLinearGradient(10, 0, canvas.width - 10, 0);
  const count = Math.max(colors.length - 1, 1);
  for (let i = 0; i < colors.length; i += 1) {
    const color = colors[i];
    const noAlpha = color.length >= 7 ? color.slice(0, 7) : color;
    gradient.addColorStop(i / count, noAlpha);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = gradient;
  ctx.fillRect(10, 8, canvas.width - 20, 18);

  ctx.strokeStyle = "rgba(30,30,30,0.5)";
  ctx.strokeRect(10, 8, canvas.width - 20, 18);

  const units = style.units || "style units";
  ctx.fillStyle = "#111";
  ctx.font = "12px IBM Plex Mono";
  ctx.fillText(`Legend (${units})`, 12, 39);

  renderPalette(colors);

  // ── Map overlay legend ──────────────────────────────────────────────────
  const mapCanvas = document.getElementById("mapLegendCanvas");
  const mapTicks = document.getElementById("mapLegendTicks");
  const mapTitle = document.getElementById("mapLegendTitle");
  if (!mapCanvas) return;

  const mCtx = mapCanvas.getContext("2d");
  if (!mCtx) return;

  const mGrad = mCtx.createLinearGradient(0, 0, mapCanvas.width, 0);
  for (let i = 0; i < colors.length; i++) {
    const noAlpha = colors[i].length >= 7 ? colors[i].slice(0, 7) : colors[i];
    mGrad.addColorStop(i / Math.max(colors.length - 1, 1), noAlpha);
  }
  mCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  mCtx.fillStyle = mGrad;
  mCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

  // Tick marks — use style.levels if available, otherwise derive from variable meta
  if (mapTicks) {
    mapTicks.innerHTML = "";
    let levels = style.levels;
    if ((!Array.isArray(levels) || levels.length < 2) && state.wxsource) {
      // Prefer the resolved levels from the source (already in display units)
      const resolvedLevels = state.wxsource.getCurrentStyleObjectCopy()?.levels;
      if (Array.isArray(resolvedLevels) && resolvedLevels.length >= 2) {
        levels = resolvedLevels;
      } else {
        const varMeta = state.wxsource.getCurrentVariableMeta();
        if (typeof varMeta?.min === "number" && typeof varMeta?.max === "number") {
          const mn = varMeta.min;
          const mx = varMeta.max;
          const step = (mx - mn) / 4;
          levels = [mn, mn + step, mn + 2 * step, mn + 3 * step, mx];
        }
      }
    }
    if (Array.isArray(levels) && levels.length >= 2) {
      const minVal = levels[0];
      const maxVal = levels[levels.length - 1];
      const range = maxVal - minVal || 1;
      const tickCount = Math.min(5, levels.length);
      const step = (levels.length - 1) / Math.max(tickCount - 1, 1);
      for (let i = 0; i < tickCount; i++) {
        const idx = Math.min(Math.round(i * step), levels.length - 1);
        const val = levels[idx];
        const pos = ((val - minVal) / range) * 100;
        const tick = document.createElement("span");
        tick.className = "wx-legend-tick";
        tick.style.left = `${pos}%`;
        tick.textContent = Math.abs(val) >= 1000 ? val.toFixed(0) : val.toFixed(1);
        mapTicks.append(tick);
      }
    }
  }

  // Title: variable (units)
  if (mapTitle) {
    const varName = els.variable?.value ?? "";
    const displayUnits = style.units || "";
    mapTitle.textContent = varName ? `${varName}${displayUnits ? " (" + displayUnits + ")" : ""}` : "—";
  }
}

async function ensureWxSymbolFonts() {
  if (document.getElementById("wx-symbol-fonts")) return;

  try {
    const response = await fetch(WX_DEMO_CSS_URL);
    if (!response.ok) return;

    const cssText = await response.text();
    const fontFaceBlocks = (cssText.match(/@font-face\{[^}]+\}/g) || []).filter(
      (block) => block.includes("font-family:arrows") || block.includes("font-family:barbs"),
    );
    if (fontFaceBlocks.length === 0) return;

    const styleTag = document.createElement("style");
    styleTag.id = "wx-symbol-fonts";
    styleTag.textContent = fontFaceBlocks.join("\n");
    document.head.append(styleTag);

    await Promise.allSettled([document.fonts.load("32px arrows"), document.fonts.load("32px barbs")]);
  } catch {
    // If fonts fail to load, the map remains functional but symbols may fallback.
  }
}

async function ensureApi() {
  if (state.wxapi) return state.wxapi;

  state.wxapi = new WxAPI({
    dataServerURL: "https://tiles.metoceanapi.com/data/",
    maskURL: "auto",
    qtreeURL: "auto",
  });
  return state.wxapi;
}

function applyDatasetFilter() {
  const filter = els.datasetFilter.value.trim().toLowerCase();
  const selected = els.dataset.value;

  const filtered = filter
    ? state.allDatasets.filter((name) => name.toLowerCase().includes(filter))
    : state.allDatasets;

  els.dataset.innerHTML = "";
  for (const dataset of filtered) {
    const option = document.createElement("option");
    option.value = dataset;
    option.textContent = dataset;
    els.dataset.append(option);
  }

  if (filtered.length === 0) {
    setStatus("No datasets match filter.");
    return;
  }

  els.dataset.value = filtered.includes(selected) ? selected : filtered[0];
}

async function loadVariablesForDataset(datasetName, preferred) {
  const variables = await state.wxapi.getDatasetAllVariables(datasetName);
  els.variable.innerHTML = "";

  for (const variable of variables || []) {
    const option = document.createElement("option");
    option.value = variable;
    option.textContent = variable;
    els.variable.append(option);
  }

  if (!variables || variables.length === 0) {
    setStatus(`No variables found for dataset: ${datasetName}`);
    return;
  }

  if (preferred && variables.includes(preferred)) {
    els.variable.value = preferred;
  }

  syncThresholdVariableOptions(preferred || els.variable.value);
}

function fillTimes(times, preferred) {
  state.allTimes = times || [];
  els.timeSelect.innerHTML = "";
  for (const time of state.allTimes) {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    els.timeSelect.append(option);
  }

  if (preferred && state.allTimes.includes(preferred)) {
    els.timeSelect.value = preferred;
  }
}

function setLevelsFromCurrentMeta() {
  if (!state.wxsource) return;
  const meta = state.wxsource.getCurrentVariableMeta();
  if (typeof meta?.min !== "number" || typeof meta?.max !== "number") return;

  const min = Number(meta.min.toFixed(2));
  const max = Number(meta.max.toFixed(2));
  const levelsInput = document.getElementById("levels");
  levelsInput.value = JSON.stringify([min, max]);
  state.currentStyle.levels = [min, max];
}

async function reloadLayer(options = {}) {
  const { keepTime = false } = options;
  if (state.busy) return;

  setBusy(true);
  setStatus("Loading weather layer...");

  try {
    const dataset = els.dataset.value;
    const variable = els.variable.value;

    if (!dataset || !variable) {
      setStatus("Select a dataset and variable first.");
      return;
    }

    const previousTime = keepTime ? els.timeSelect.value : undefined;
    state.datasetManager = await state.wxapi.createDatasetManager(dataset);

    if (state.wxsource) {
      map.removeLayer(state.wxsource);
      state.wxsource = undefined;
    }

    state.wxsource = state.datasetManager.createSourceLayer(
      {
        variable,
        time: previousTime,
        wxstyle: cleanStyle(state.currentStyle),
      },
      {
        id: "wxsource",
        opacity: 0.92,
        attribution: "WxTiles",
      },
    );

    map.addLayer(state.wxsource);
    await new Promise((resolve) => state.wxsource.once("load", resolve));

    fillTimes(state.wxsource.getAllTimes(), previousTime || state.wxsource.getTime());

    const explicitStyle = {
      colors: state.currentStyle.colors,
      colorMap: state.currentStyle.colorMap,
      levels: state.currentStyle.levels,
    };

    const style = state.wxsource.getCurrentStyleObjectCopy();
    state.currentStyle = cleanStyle({ ...DEFAULT_STYLE, ...style });

    if (explicitStyle.colors === undefined) {
      delete state.currentStyle.colors;
    } else {
      state.currentStyle.colors = explicitStyle.colors;
    }

    if (explicitStyle.colorMap === undefined) {
      delete state.currentStyle.colorMap;
    } else {
      state.currentStyle.colorMap = explicitStyle.colorMap;
    }

    if (explicitStyle.levels === undefined) {
      delete state.currentStyle.levels;
    } else {
      state.currentStyle.levels = explicitStyle.levels;
    }

    // Populate units dropdown from the variable's native units
    const varMeta = state.wxsource.getCurrentVariableMeta();
    const nativeUnits = varMeta?.units || state.currentStyle.units || "";
    populateUnitsDropdown(nativeUnits, state.currentStyle.units);

    writeStyleToControls(state.currentStyle);
    updateStyleJson();
    drawLegend(state.currentStyle);

    setStatus(`Layer active: ${dataset} / ${variable}`);
    updateMetaAndValues();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to reload layer: ${message}`);
  } finally {
    setBusy(false);
    if (hasPendingStyleApply) {
      hasPendingStyleApply = false;
      const queued = pendingStyleObject;
      const forceReload = pendingForceReload;
      pendingStyleObject = undefined;
      pendingForceReload = false;
      void applyStyle(true, queued, forceReload);
    }
  }
}

async function setSelectedTime() {
  if (!state.wxsource || state.busy) return;
  const selectedTime = els.timeSelect.value;
  if (!selectedTime) return;

  setBusy(true);
  try {
    if (typeof state.wxsource.setTimeStep === "function") {
      await state.wxsource.setTimeStep(selectedTime);
    } else {
      await state.wxsource.setTime(selectedTime);
    }

    updateStyleJson();
    await state.wxsource.updateCurrentStyleObject(cleanStyle(state.currentStyle), true);
    drawLegend(state.currentStyle);

    updateMetaAndValues();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to set time: ${message}`);
  } finally {
    setBusy(false);
    if (hasPendingStyleApply) {
      hasPendingStyleApply = false;
      const queued = pendingStyleObject;
      const forceReload = pendingForceReload;
      pendingStyleObject = undefined;
      pendingForceReload = false;
      void applyStyle(true, queued, forceReload);
    }
  }
}

async function applyStyle(silent = false, explicitStyle, forceReload = false) {
  if (!state.wxsource) return;
  if (state.busy) {
    hasPendingStyleApply = true;
    pendingStyleObject = explicitStyle ? cleanStyle(explicitStyle) : getCurrentStyleFromControls();
    pendingForceReload = pendingForceReload || forceReload;
    return;
  }

  const style = explicitStyle ? cleanStyle(explicitStyle) : pendingStyleObject || getCurrentStyleFromControls();
  const queuedForceReload = pendingForceReload;
  pendingStyleObject = undefined;
  pendingForceReload = false;
  state.currentStyle = style;
  updateStyleJson();

  const shouldHardReload = forceReload || queuedForceReload;
  if (shouldHardReload) {
    await reloadLayer({ keepTime: true });
    if (!silent) {
      setStatus("Custom style applied.");
    }
    return;
  }

  setBusy(true);
  try {
    await state.wxsource.updateCurrentStyleObject(style, true);
    drawLegend(style);
    updateMetaAndValues();
    if (!silent) {
      setStatus("Custom style applied.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Style update failed: ${message}`);
  } finally {
    setBusy(false);
    if (hasPendingStyleApply) {
      hasPendingStyleApply = false;
      const queued = pendingStyleObject;
      const flushForceReload = pendingForceReload;
      pendingStyleObject = undefined;
      pendingForceReload = false;
      void applyStyle(true, queued, flushForceReload);
    }
  }
}

function scheduleLiveStyleApply(delay = 180) {
  if (!state.wxsource) return;
  state.currentStyle = getCurrentStyleFromControls();
  updateStyleJson();
  drawLegend(state.currentStyle);

  clearTimeout(liveStyleTimer);
  liveStyleTimer = setTimeout(() => {
    hasPendingStyleApply = true;
    void applyStyle(true);
  }, delay);
}

function stopAnimation() {
  state.animating = false;
  els.startBtn.textContent = "Start";
  if (state.animationAbort) {
    state.animationAbort.abort();
    state.animationAbort = undefined;
  }
}

async function startAnimation() {
  if (!state.wxsource || state.animating) return;

  state.animating = true;
  els.startBtn.textContent = "Stop";
  state.animationAbort = new AbortController();

  try {
    await state.wxsource.setCoarseLevel(2);
    const initialTimes = state.wxsource.getAllTimes() || [];
    const current = state.wxsource.getTime();
    const currentIndex = initialTimes.indexOf(current);
    let index = currentIndex >= 0 ? currentIndex + 1 : 0;
    while (state.animating) {
      const signal = state.animationAbort.signal;
      if (signal.aborted) break;

      const times = state.wxsource.getAllTimes();
      if (!times || times.length === 0) break;
      const next = index % times.length;
      index += 1;

      try {
        if (typeof state.wxsource.setTimeStep === "function") {
          await state.wxsource.setTimeStep(next);
        } else {
          await state.wxsource.setTime(times[next]);
        }
        els.timeSelect.value = state.wxsource.getTime() || times[next];
        updateMetaAndValues();
      } catch {
        // Continue animation attempts even if an individual time load fails.
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch {
    // ignore abort and transient errors during stop
  } finally {
    if (state.wxsource) {
      await state.wxsource.unsetCoarseLevel();
    }
    stopAnimation();
  }
}

function toggleAnimation() {
  if (state.animating) {
    stopAnimation();
    return;
  }
  void startAnimation();
}

function updateMetaAndValues() {
  if (!state.wxsource) return;

  const meta = state.wxsource.getCurrentVariableMeta();
  const datasetName = state.wxsource.wxdatasetManager.datasetName;
  const time = state.wxsource.getTime();
  const units = meta.units || state.currentStyle.units || "";

  els.meta.textContent = `dataset=${datasetName} variable=${els.variable.value} time=${time} min=${meta.min?.toFixed(2)} max=${meta.max?.toFixed(2)} ${units}`;

  const wrapped = state.cursorLatLng.wrap();
  const info = state.wxsource.getLayerInfoAtLatLon(wrapped, map);
  if (!info) {
    els.values.textContent = "style=outside source=outside";
    return;
  }

  const styleVals = info.inStyleUnits.map((n) => n.toFixed(2)).join(", ");
  const sourceVals = info.data.map((n) => n.toFixed(2)).join(", ");
  els.values.textContent = `style=${styleVals} ${info.styleUnits} source=${sourceVals} ${info.dataUnits}`;
}

async function initialize() {
  await ensureWxSymbolFonts();

  fillColorSchemes();
  writeStyleToControls(state.currentStyle);
  updateStyleJson();
  drawLegend(state.currentStyle);

  setStatus("Loading datasets...");
  const api = await ensureApi();

  state.allDatasets = await api.getAllDatasetsNames();
  state.allDatasets.sort();
  applyDatasetFilter();

  await loadVariablesForDataset(els.dataset.value);
  await reloadLayer();
}

function bindEvents() {
  els.datasetFilter.addEventListener("input", () => {
    applyDatasetFilter();
    if (els.dataset.value) {
      void loadVariablesForDataset(els.dataset.value).then(() => reloadLayer());
    }
  });

  els.dataset.addEventListener("change", async () => {
    await loadVariablesForDataset(els.dataset.value);
    await reloadLayer();
  });

  els.variable.addEventListener("change", async () => {
    syncThresholdVariableOptions(els.variable.value);
    await reloadLayer();
  });

  els.timeSelect.addEventListener("change", () => {
    void setSelectedTime();
  });

  els.startBtn.addEventListener("click", toggleAnimation);

  els.exportThresholdBtn.addEventListener("click", () => {
    void exportThresholdShapefile();
  });

  els.styleToggleBtn.addEventListener("click", () => {
    const collapsed = els.styleEditor.classList.toggle("collapsed");
    els.styleToggleBtn.textContent = collapsed ? "show Custom Style Editor" : "update Custom Style & Hide";
  });

  els.colorScheme.addEventListener("change", () => {
    // Populate the colors input with the selected scheme's hex codes, and clear colorMap.
    const schemeColors = COLOR_SCHEMES[els.colorScheme.value];
    const schemeLevels = COLOR_SCHEME_LEVELS[els.colorScheme.value];
    document.getElementById("colors").value = schemeColors ? JSON.stringify(schemeColors) : "";
    document.getElementById("colorMap").value = "";
    document.getElementById("levels").value = Array.isArray(schemeLevels) ? JSON.stringify(schemeLevels) : "";

    const style = getCurrentStyleFromControls();
    delete style.colorMap;

    state.currentStyle = cleanStyle(style);
    updateStyleJson();
    drawLegend(state.currentStyle);

    clearTimeout(liveStyleTimer);
    liveStyleTimer = setTimeout(() => {
      void applyStyle(true, state.currentStyle, false);
    }, 80);
  });

  document.querySelectorAll("#styleEditor input, #styleEditor select:not(#colorScheme)").forEach((node) => {
    node.addEventListener("input", () => {
      scheduleLiveStyleApply(180);
    });
    node.addEventListener("change", () => {
      scheduleLiveStyleApply(80);
    });
  });

  map.on("mousemove", (event) => {
    state.cursorLatLng = event.latlng;
    const wrapped = event.latlng.wrap();
    els.cursor.textContent = `lnglat=(${wrapped.lng.toFixed(2)}, ${wrapped.lat.toFixed(2)})`;
    updateMetaAndValues();
  });

  map.on("moveend", updateMetaAndValues);
  map.on("zoomend", updateMetaAndValues);
}

bindEvents();
void initialize();
