import { WxAPI } from "https://esm.sh/@metoceanapi/wxtiles-leaflet";

const WX_DEMO_CSS_URL = "https://metoceanapi.github.io/wxtiles-leaflet/script/script.css";
const VIEW_STORAGE_KEY = "wxtiles-main-extended-views";

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

const UNIT_ALTERNATIVES = {
  K: ["K", "C", "F"],
  C: ["C", "K", "F"],
  degC: ["degC", "K", "F"],
  "m.s^{-1}": ["m.s^{-1}", "knot", "km.h^{-1}", "mph", "Beaufort"],
  knot: ["knot", "m.s^{-1}", "km.h^{-1}", "mph"],
  Pa: ["Pa", "hPa", "mbar"],
  hPa: ["hPa", "Pa", "mbar"],
  "(0 - 1)": ["(0 - 1)", "percent"],
  percent: ["percent", "(0 - 1)"],
  "%": ["%"],
  m: ["m", "cm", "mm", "ft", "km"],
  cm: ["cm", "m", "mm", "ft"],
  mm: ["mm", "cm", "m", "in"],
  ft: ["ft", "m"],
  km: ["km", "m", "miles", "nm"],
  "kg.m^{-2}.s^{-1}": ["kg.m^{-2}.s^{-1}", "mm.h^{-1}", "in.h^{-1}"],
  "mm/h": ["mm/h", "in/h"],
  "W.m^{-2}": ["W.m^{-2}"],
  "J.kg^{-1}": ["J.kg^{-1}"],
  deg: ["deg", "rad"],
  s: ["s", "min", "h"],
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

const OMITTED_STYLE_KEYS = new Set(["isolineTextSizeEm", "isolineTextBackground"]);

const state = {
  wxapi: undefined,
  datasetManager: undefined,
  datasetManagers: new Map(),
  allDatasets: [],
  cursorLatLng: L.latLng(0, 0),
  animating: false,
  animationRunId: 0,
  recording: false,
  recordingFrameBusy: false,
  recordingIntervalId: undefined,
  recordingCanvas: undefined,
  recordingContext: undefined,
  mediaRecorder: undefined,
  mediaStream: undefined,
  mediaChunks: [],
  layers: {
    A: { source: undefined, style: structuredClone(DEFAULT_STYLE), busy: false, zIndex: 350, opacity: 0.92 },
    B: { source: undefined, style: structuredClone(DEFAULT_STYLE), busy: false, zIndex: 360, opacity: 0.65 },
  },
};

const map = L.map("map", {
  center: [-40.75, 174.5],
  zoom: 7,
  worldCopyJump: true,
  zoomControl: true,
});

const basemapLayers = {
  osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    zIndex: 1,
    attribution: "&copy; OpenStreetMap contributors",
  }),
  esriWorldImagery: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      zIndex: 1,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
  ),
};
let activeBasemapLayer = basemapLayers.osm;
activeBasemapLayer.addTo(map);

const els = {
  status: document.getElementById("status"),
  cursor: document.getElementById("cursor"),
  mapTimeUtc: document.getElementById("mapTimeUtc"),
  datasetFilter: document.getElementById("datasetFilter"),
  dataset: document.getElementById("dataset"),
  basemapSelect: document.getElementById("basemapSelect"),
  animateBtn: document.getElementById("animateBtn"),
  recordBtn: document.getElementById("recordBtn"),
  animationSpeed: document.getElementById("animationSpeed"),
  lockAnimation: document.getElementById("lockAnimation"),
  viewName: document.getElementById("viewName"),
  saveViewBtn: document.getElementById("saveViewBtn"),
  savedViews: document.getElementById("savedViews"),
  loadViewBtn: document.getElementById("loadViewBtn"),
  deleteViewBtn: document.getElementById("deleteViewBtn"),
  exportViewBtn: document.getElementById("exportViewBtn"),
  importViewBtn: document.getElementById("importViewBtn"),
  importViewFile: document.getElementById("importViewFile"),
  layers: {
    A: {
      variable: document.getElementById("variableA"),
      time: document.getElementById("timeA"),
      opacity: document.getElementById("opacityA"),
      toggle: document.getElementById("styleToggleA"),
      editor: document.getElementById("styleEditorA"),
      meta: document.getElementById("metaA"),
      values: document.getElementById("valuesA"),
      legend: document.getElementById("legendA"),
      palette: document.getElementById("paletteA"),
    },
    B: {
      dataset: document.getElementById("datasetB"),
      variable: document.getElementById("variableB"),
      time: document.getElementById("timeB"),
      opacity: document.getElementById("opacityB"),
      toggle: document.getElementById("styleToggleB"),
      editor: document.getElementById("styleEditorB"),
      meta: document.getElementById("metaB"),
      values: document.getElementById("valuesB"),
      legend: document.getElementById("legendB"),
      palette: document.getElementById("paletteB"),
    },
  },
};

const styleControls = { A: undefined, B: undefined };

function setStatus(msg) {
  els.status.textContent = msg;
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
  const text = String(value || "").trim();
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

function sortObjectKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (!value || typeof value !== "object") return value;

  const sorted = {};
  for (const key of Object.keys(value).sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()))) {
    sorted[key] = sortObjectKeysDeep(value[key]);
  }
  return sorted;
}

function buildStyleEditorMarkup(layerKey) {
  return `
    <h3>customStyle ${layerKey}</h3>
    <div class="control-group"><label for="styleJson${layerKey}">json</label><textarea id="styleJson${layerKey}" rows="8" readonly></textarea></div>
    <div class="control-group"><label for="styleParent${layerKey}">parent</label><input id="styleParent${layerKey}" type="text" placeholder="base" /></div>
    <div class="control-group"><label for="styleName${layerKey}">name</label><input id="styleName${layerKey}" type="text" placeholder="custom" /></div>
    <div class="control-group"><label for="fill${layerKey}">fill</label><select id="fill${layerKey}"><option value="gradient">gradient</option><option value="solid">solid</option><option value="none">none</option></select></div>
    <div class="grid-two"><div class="control-group"><label for="isolineColorMode${layerKey}">isolineColor</label><select id="isolineColorMode${layerKey}"><option value="inverted">inverted</option><option value="fill">fill</option><option value="none">none</option><option value="custom">custom</option></select></div><div class="control-group"><label for="isolineColorCustom${layerKey}">isolineColorCustom</label><input id="isolineColorCustom${layerKey}" type="color" value="#000000" /></div></div>
    <div class="grid-two toggles"><label><input id="isolineText${layerKey}" type="checkbox" checked /> isolineText</label></div>
    <div class="control-group"><label for="vectorFactor${layerKey}">vectorFactor</label><input id="vectorFactor${layerKey}" type="number" min="0.1" max="10" step="0.1" value="1" /></div>
    <div class="control-group"><label for="vectorType${layerKey}">vectorType</label><select id="vectorType${layerKey}"><option value="arrows">arrows</option><option value="barbs">barbs</option><option value="none">none</option></select></div>
    <div class="grid-two"><div class="control-group"><label for="vectorColorMode${layerKey}">vectorColor</label><select id="vectorColorMode${layerKey}"><option value="inverted">inverted</option><option value="fill">fill</option><option value="none">none</option><option value="custom">custom</option></select></div><div class="control-group"><label for="vectorColorCustom${layerKey}">vectorColorCustom</label><input id="vectorColorCustom${layerKey}" type="color" value="#000000" /></div></div>
    <div class="grid-two"><div class="control-group"><label for="streamLineColorMode${layerKey}">streamLineColor</label><select id="streamLineColorMode${layerKey}"><option value="inverted">inverted</option><option value="fill">fill</option><option value="none">none</option><option value="custom">custom</option></select></div><div class="control-group"><label for="streamLineColorCustom${layerKey}">streamLineColorCustom</label><input id="streamLineColorCustom${layerKey}" type="color" value="#000000" /></div></div>
    <div class="control-group"><label for="streamLineSpeedFactor${layerKey}">streamLineSpeedFactor</label><input id="streamLineSpeedFactor${layerKey}" type="range" min="0.1" max="10" step="0.1" value="1" /></div>
    <div class="grid-two toggles"><label><input id="streamLineStatic${layerKey}" type="checkbox" /> streamLineStatic</label><label><input id="showBelowMin${layerKey}" type="checkbox" checked /> showBelowMin</label><label><input id="showAboveMax${layerKey}" type="checkbox" checked /> showAboveMax</label></div>
    <div class="control-group"><label for="colorScheme${layerKey}">colorScheme</label><select id="colorScheme${layerKey}"></select></div>
    <div class="control-group"><label for="colors${layerKey}">colors</label><input id="colors${layerKey}" type="text" placeholder='["#0000ffff", "#00ffffff", "#ff0000ff"]' /></div>
    <div class="control-group"><label for="colorMap${layerKey}">colorMap</label><input id="colorMap${layerKey}" type="text" placeholder='[[0, "#0000ff"], [20, "#ff0000"]]' /></div>
    <div class="control-group"><label for="levels${layerKey}">levels</label><input id="levels${layerKey}" type="text" placeholder='[0,5,10,15,20]' /></div>
    <div class="control-group"><label for="blurRadius${layerKey}">blurRadius</label><input id="blurRadius${layerKey}" type="range" min="0" max="10" step="1" value="0" /></div>
    <div class="control-group"><label for="addDegrees${layerKey}">addDegrees</label><input id="addDegrees${layerKey}" type="number" min="0" max="360" step="1" value="0" /></div>
    <div class="control-group"><label for="units${layerKey}">units</label><select id="units${layerKey}"></select></div>
    <div class="control-group"><label for="extraUnits${layerKey}">extraUnits</label><input id="extraUnits${layerKey}" type="text" placeholder='{"m.s^{-1}": ["m/s", 1]}' /></div>
    <div class="control-group"><label for="mask${layerKey}">mask</label><select id="mask${layerKey}"><option value="none">none</option><option value="sea">sea</option><option value="land">land</option></select></div>
    <div class="control-group"><label for="glAnimationSpeed${layerKey}">animationSpeed</label><input id="glAnimationSpeed${layerKey}" type="range" min="0.1" max="10" step="0.1" value="1" /></div>
    <div class="control-group"><label for="glNoiseTexturePow${layerKey}">noiseTexturePow</label><input id="glNoiseTexturePow${layerKey}" type="range" min="5" max="8" step="1" value="5" /></div>
    <div class="control-group"><label for="glVectorFieldFactor${layerKey}">vectorFieldFactor</label><input id="glVectorFieldFactor${layerKey}" type="range" min="0.1" max="3" step="0.1" value="1" /></div>
    <div class="control-group"><label for="glAnimationIntensity${layerKey}">animationIntensity</label><input id="glAnimationIntensity${layerKey}" type="range" min="0.1" max="10" step="0.1" value="5" /></div>
    <div class="control-group"><label for="glWavesCount${layerKey}">wavesCount</label><input id="glWavesCount${layerKey}" type="range" min="2" max="10" step="1" value="4" /></div>
  `;
}

function initStyleEditors() {
  for (const layerKey of ["A", "B"]) {
    els.layers[layerKey].editor.innerHTML = buildStyleEditorMarkup(layerKey);
  }
}

function getStyleControls(layerKey) {
  const id = (n) => document.getElementById(`${n}${layerKey}`);
  return {
    styleJson: id("styleJson"), styleParent: id("styleParent"), styleName: id("styleName"),
    fill: id("fill"), isolineColorMode: id("isolineColorMode"), isolineColorCustom: id("isolineColorCustom"), isolineText: id("isolineText"),
    vectorType: id("vectorType"), vectorColorMode: id("vectorColorMode"), vectorColorCustom: id("vectorColorCustom"), vectorFactor: id("vectorFactor"),
    streamLineColorMode: id("streamLineColorMode"), streamLineColorCustom: id("streamLineColorCustom"), streamLineSpeedFactor: id("streamLineSpeedFactor"),
    streamLineStatic: id("streamLineStatic"), showBelowMin: id("showBelowMin"), showAboveMax: id("showAboveMax"),
    colorScheme: id("colorScheme"), colors: id("colors"), colorMap: id("colorMap"), levels: id("levels"),
    blurRadius: id("blurRadius"), addDegrees: id("addDegrees"), units: id("units"), extraUnits: id("extraUnits"), mask: id("mask"),
    glAnimationSpeed: id("glAnimationSpeed"), glNoiseTexturePow: id("glNoiseTexturePow"), glVectorFieldFactor: id("glVectorFieldFactor"), glAnimationIntensity: id("glAnimationIntensity"), glWavesCount: id("glWavesCount"),
  };
}

function fillColorSchemes(layerKey) {
  const select = styleControls[layerKey].colorScheme;
  select.innerHTML = "";
  for (const key of Object.keys(COLOR_SCHEMES)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key;
    select.append(option);
  }
}

function getPaletteFromStyle(style) {
  if (Array.isArray(style.colors) && style.colors.length > 0) return style.colors;
  return COLOR_SCHEMES[style.colorScheme] || COLOR_SCHEMES.rainbow;
}

function renderPalette(layerKey, colors) {
  const host = els.layers[layerKey].palette;
  host.innerHTML = "";
  for (const color of colors) {
    const chip = document.createElement("span");
    chip.className = "palette-chip";
    chip.style.background = color;
    chip.title = color;
    host.append(chip);
  }
}

function updateStyleJson(layerKey) {
  styleControls[layerKey].styleJson.value = JSON.stringify(sortObjectKeysDeep(cleanStyle(state.layers[layerKey].style)), null, 2);
}

function setModeAndColor(modeEl, colorEl, value) {
  if (typeof value === "string" && value.startsWith("#")) {
    modeEl.value = "custom";
    colorEl.value = value.length === 9 ? value.slice(0, 7) : value;
    return;
  }
  modeEl.value = value || "none";
}

function writeStyleToControls(layerKey, style) {
  const sc = styleControls[layerKey];
  sc.styleParent.value = style.parent || "";
  sc.styleName.value = style.name || "";
  sc.fill.value = style.fill || "gradient";
  setModeAndColor(sc.isolineColorMode, sc.isolineColorCustom, style.isolineColor || "none");
  sc.isolineText.checked = Boolean(style.isolineText);
  sc.vectorType.value = style.vectorType || "none";
  setModeAndColor(sc.vectorColorMode, sc.vectorColorCustom, style.vectorColor || "inverted");
  sc.vectorFactor.value = String(style.vectorFactor ?? 1);
  setModeAndColor(sc.streamLineColorMode, sc.streamLineColorCustom, style.streamLineColor || "none");
  sc.streamLineSpeedFactor.value = String(style.streamLineSpeedFactor ?? 1);
  sc.streamLineStatic.checked = Boolean(style.streamLineStatic);
  sc.showBelowMin.checked = Boolean(style.showBelowMin);
  sc.showAboveMax.checked = Boolean(style.showAboveMax);
  sc.colorScheme.value = style.colorScheme || "";

  if (Array.isArray(style.colorMap) && style.colorMap.length > 0) {
    sc.colors.value = "";
    sc.colorMap.value = JSON.stringify(style.colorMap);
    sc.levels.value = "";
  } else {
    sc.colors.value = style.colors ? JSON.stringify(style.colors) : "";
    sc.colorMap.value = style.colorMap ? JSON.stringify(style.colorMap) : "";
    sc.levels.value = Array.isArray(style.levels) ? JSON.stringify(style.levels.map((v) => +Number(v).toFixed(2))) : "";
  }

  sc.blurRadius.value = String(style.blurRadius ?? 0);
  sc.addDegrees.value = String(style.addDegrees ?? 0);

  const unitsVal = style.units || "";
  if (unitsVal && !Array.from(sc.units.options).some((o) => o.value === unitsVal)) {
    const opt = document.createElement("option");
    opt.value = unitsVal;
    opt.textContent = unitsVal;
    sc.units.append(opt);
  }
  sc.units.value = unitsVal;

  sc.extraUnits.value = style.extraUnits ? JSON.stringify(style.extraUnits) : "";
  sc.mask.value = style.mask || "none";
  sc.glAnimationSpeed.value = String(style.gl?.animationSpeed ?? 1);
  sc.glNoiseTexturePow.value = String(style.gl?.noiseTexturePow ?? 5);
  sc.glVectorFieldFactor.value = String(style.gl?.vectorFieldFactor ?? 1);
  sc.glAnimationIntensity.value = String(style.gl?.animationIntensity ?? 5);
  sc.glWavesCount.value = String(style.gl?.wavesCount ?? 4);

  updateStyleJson(layerKey);
  drawLegend(layerKey, style);
}

function populateUnitsDropdown(layerKey, nativeUnits, currentUnits) {
  const unitsEl = styleControls[layerKey].units;
  const alternatives = UNIT_ALTERNATIVES[nativeUnits] ?? (nativeUnits ? [nativeUnits] : []);
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
    opt.textContent = unit === nativeUnits ? `${unit} *` : unit;
    unitsEl.append(opt);
  }
  unitsEl.value = options.includes(prevValue) ? prevValue : (nativeUnits || options[0] || "");
}

function getCurrentStyleFromControls(layerKey) {
  const sc = styleControls[layerKey];
  const style = {
    parent: sc.styleParent.value || undefined,
    name: sc.styleName.value || undefined,
    fill: sc.fill.value,
    isolineColor: modeToValue(sc.isolineColorMode, sc.isolineColorCustom),
    isolineText: sc.isolineText.checked,
    vectorType: sc.vectorType.value,
    vectorColor: modeToValue(sc.vectorColorMode, sc.vectorColorCustom),
    vectorFactor: Number(sc.vectorFactor.value),
    streamLineColor: modeToValue(sc.streamLineColorMode, sc.streamLineColorCustom),
    streamLineSpeedFactor: Number(sc.streamLineSpeedFactor.value),
    streamLineStatic: sc.streamLineStatic.checked,
    showBelowMin: sc.showBelowMin.checked,
    showAboveMax: sc.showAboveMax.checked,
    colorScheme: sc.colorScheme.value,
    colors: parseMaybeJson(sc.colors.value),
    colorMap: parseMaybeJson(sc.colorMap.value),
    levels: parseMaybeJson(sc.levels.value),
    blurRadius: Number(sc.blurRadius.value),
    addDegrees: Number(sc.addDegrees.value),
    units: sc.units.value,
    extraUnits: parseMaybeJson(sc.extraUnits.value),
    mask: sc.mask.value,
    gl: {
      animationSpeed: Number(sc.glAnimationSpeed.value),
      noiseTexturePow: Number(sc.glNoiseTexturePow.value),
      vectorFieldFactor: Number(sc.glVectorFieldFactor.value),
      animationIntensity: Number(sc.glAnimationIntensity.value),
      wavesCount: Number(sc.glWavesCount.value),
    },
  };
  return cleanStyle(style);
}

function drawLegend(layerKey, style) {
  const canvas = els.layers[layerKey].legend;
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
  ctx.fillStyle = "#111";
  ctx.font = "12px IBM Plex Mono";
  ctx.fillText(`Legend ${layerKey} (${style.units || "style units"})`, 12, 39);

  renderPalette(layerKey, colors);
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
    // optional fonts
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

function applyBasemapLayer(name) {
  const nextLayer = basemapLayers[name] || basemapLayers.osm;
  if (nextLayer === activeBasemapLayer) return;
  if (activeBasemapLayer && map.hasLayer(activeBasemapLayer)) map.removeLayer(activeBasemapLayer);
  nextLayer.addTo(map);
  activeBasemapLayer = nextLayer;
  syncLayerOrdering();
}

function applyDatasetFilter() {
  const filter = els.datasetFilter.value.trim().toLowerCase();
  const selected = els.dataset.value;
  const filtered = filter ? state.allDatasets.filter((n) => n.toLowerCase().includes(filter)) : state.allDatasets;

  els.dataset.innerHTML = "";
  for (const dataset of filtered) {
    const option = document.createElement("option");
    option.value = dataset;
    option.textContent = dataset;
    els.dataset.append(option);
  }

  if (filtered.length === 0) {
    setStatus("No datasets match filter.");
    return false;
  }

  els.dataset.value = filtered.includes(selected) ? selected : filtered[0];
  refreshOverlayBDatasetOptions();
  return true;
}

function getLayerDatasetName(layerKey) {
  if (layerKey !== "B") return els.dataset.value;
  const selected = els.layers.B.dataset.value;
  if (!selected || selected === "__same__") return els.dataset.value;
  return selected;
}

function isObsDataset(datasetName) {
  return /^obs/i.test(datasetName || "");
}

function refreshOverlayBDatasetOptions(preferredValue) {
  const select = els.layers.B.dataset;
  const previous = preferredValue || select.value || "__same__";
  const obsDatasets = state.allDatasets.filter((dataset) => isObsDataset(dataset));

  select.innerHTML = "";

  const sameOpt = document.createElement("option");
  sameOpt.value = "__same__";
  sameOpt.textContent = "Use Dataset A";
  select.append(sameOpt);

  for (const dataset of obsDatasets) {
    const option = document.createElement("option");
    option.value = dataset;
    option.textContent = dataset;
    select.append(option);
  }

  if (previous && !Array.from(select.options).some((o) => o.value === previous)) {
    const customOpt = document.createElement("option");
    customOpt.value = previous;
    customOpt.textContent = `${previous} (saved)`;
    select.append(customOpt);
  }

  select.value = Array.from(select.options).some((o) => o.value === previous) ? previous : "__same__";
}

async function ensureDatasetManager(datasetName) {
  if (!datasetName) return undefined;
  const existing = state.datasetManagers.get(datasetName);
  if (existing) return existing;
  const manager = await state.wxapi.createDatasetManager(datasetName);
  state.datasetManagers.set(datasetName, manager);
  return manager;
}

async function getDatasetVariables(datasetName) {
  return await state.wxapi.getDatasetAllVariables(datasetName);
}

function fillVariableOptions(layerKey, variables, preferred) {
  const select = els.layers[layerKey].variable;
  select.innerHTML = "";
  for (const variable of variables || []) {
    const option = document.createElement("option");
    option.value = variable;
    option.textContent = variable;
    select.append(option);
  }
  if (!variables || variables.length === 0) return;
  if (preferred && variables.includes(preferred)) {
    select.value = preferred;
  } else if (layerKey === "B" && variables.length > 1 && variables[0] === els.layers.A.variable.value) {
    select.value = variables[1];
  }
}

function fillTimes(layerKey, times, preferred) {
  const select = els.layers[layerKey].time;
  select.innerHTML = "";
  for (const time of times || []) {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    select.append(option);
  }
  if (preferred && (times || []).includes(preferred)) select.value = preferred;
}

function syncLayerOrdering() {
  for (const layerKey of ["A", "B"]) {
    const layerState = state.layers[layerKey];
    const src = layerState.source;
    if (!src || !map.hasLayer(src)) continue;
    if (typeof src.setZIndex === "function") src.setZIndex(layerState.zIndex);
    if (typeof src.setOpacity === "function") src.setOpacity(layerState.opacity);
  }

  const srcA = state.layers.A.source;
  const srcB = state.layers.B.source;
  if (srcA && srcB) {
    if (typeof srcA.bringToFront === "function") srcA.bringToFront();
    if (typeof srcB.bringToFront === "function") srcB.bringToFront();
  }
}

async function setAnimationQualityLock(enabled) {
  const tasks = [];
  for (const layerKey of ["A", "B"]) {
    const source = state.layers[layerKey].source;
    if (!source) continue;
    if (enabled && typeof source.setCoarseLevel === "function") {
      tasks.push(Promise.resolve(source.setCoarseLevel(2)));
      continue;
    }
    if (!enabled && typeof source.unsetCoarseLevel === "function") {
      tasks.push(Promise.resolve(source.unsetCoarseLevel()));
    }
  }
  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}

async function reloadLayer(layerKey, { keepTime = false } = {}) {
  const layerState = state.layers[layerKey];
  if (layerState.busy) return;

  const datasetName = getLayerDatasetName(layerKey);
  const datasetManager = await ensureDatasetManager(datasetName);
  if (!datasetManager) return;

  const layerEls = els.layers[layerKey];
  const variable = layerEls.variable.value;
  if (!variable) return;

  layerState.busy = true;
  try {
    const previousTime = keepTime ? layerEls.time.value : undefined;
    if (layerState.source) {
      map.removeLayer(layerState.source);
      layerState.source = undefined;
    }

    layerState.source = datasetManager.createSourceLayer(
      { variable, time: previousTime, wxstyle: cleanStyle(layerState.style) },
      { id: `wxsource-${layerKey}`, opacity: layerState.opacity, zIndex: layerState.zIndex, attribution: "WxTiles" },
    );

    map.addLayer(layerState.source);
    await new Promise((resolve) => layerState.source.once("load", resolve));

    if (state.animating && typeof layerState.source.setCoarseLevel === "function") {
      await Promise.resolve(layerState.source.setCoarseLevel(2));
    }

    fillTimes(layerKey, layerState.source.getAllTimes(), previousTime || layerState.source.getTime());

    const explicit = { colors: layerState.style.colors, colorMap: layerState.style.colorMap, levels: layerState.style.levels };
    const resolvedStyle = layerState.source.getCurrentStyleObjectCopy();
    layerState.style = cleanStyle({ ...DEFAULT_STYLE, ...resolvedStyle });

    if (explicit.colors === undefined) delete layerState.style.colors; else layerState.style.colors = explicit.colors;
    if (explicit.colorMap === undefined) delete layerState.style.colorMap; else layerState.style.colorMap = explicit.colorMap;
    if (explicit.levels === undefined) delete layerState.style.levels; else layerState.style.levels = explicit.levels;

    const varMeta = layerState.source.getCurrentVariableMeta();
    const nativeUnits = varMeta?.units || layerState.style.units || "";
    populateUnitsDropdown(layerKey, nativeUnits, layerState.style.units);

    writeStyleToControls(layerKey, layerState.style);
    updateLayerMetaAndValues(layerKey);
    syncLayerOrdering();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Failed to reload overlay ${layerKey}: ${message}`);
  } finally {
    layerState.busy = false;
  }
}

async function setLayerTime(layerKey) {
  await reloadLayer(layerKey, { keepTime: true });
}

async function applyStyle(layerKey) {
  const layerState = state.layers[layerKey];
  if (!layerState.source || layerState.busy) return;

  const style = getCurrentStyleFromControls(layerKey);
  layerState.style = style;
  updateStyleJson(layerKey);
  drawLegend(layerKey, style);

  try {
    await layerState.source.updateCurrentStyleObject(style, true);
    updateLayerMetaAndValues(layerKey);
    setStatus(`Overlay ${layerKey} style applied.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Style update failed for ${layerKey}: ${message}`);
  }
}

function scheduleStyleApply(layerKey, delay = 140) {
  const timerKey = `_styleTimer${layerKey}`;
  if (state[timerKey]) clearTimeout(state[timerKey]);
  state[timerKey] = setTimeout(() => {
    void applyStyle(layerKey);
  }, delay);
}

function updateMapTimeUtcText() {
  if (!els.mapTimeUtc) return;
  const tA = els.layers.A.time.value || "--";
  const tB = els.layers.B.time.value || "--";
  els.mapTimeUtc.textContent = `UTC A: ${tA} | UTC B: ${tB}`;
}

function updateLayerMetaAndValues(layerKey) {
  updateMapTimeUtcText();
  const layerState = state.layers[layerKey];
  const layerEls = els.layers[layerKey];
  const prefix = `${layerKey}: `;

  if (!layerState.source) {
    layerEls.meta.textContent = `${prefix}dataset=loading...`;
    layerEls.values.textContent = `${prefix}style=outside source=outside`;
    return;
  }

  const meta = layerState.source.getCurrentVariableMeta();
  const datasetName = layerState.source.wxdatasetManager.datasetName;
  const time = layerState.source.getTime();
  const units = meta.units || layerState.style.units || "";

  layerEls.meta.textContent = `${prefix}dataset=${datasetName} variable=${layerEls.variable.value} time=${time} min=${meta.min?.toFixed(2)} max=${meta.max?.toFixed(2)} ${units}`;

  const wrapped = state.cursorLatLng.wrap();
  const info = layerState.source.getLayerInfoAtLatLon(wrapped, map);
  if (!info) {
    layerEls.values.textContent = `${prefix}style=outside source=outside`;
    return;
  }

  const styleVals = info.inStyleUnits.map((n) => n.toFixed(2)).join(", ");
  const sourceVals = info.data.map((n) => n.toFixed(2)).join(", ");
  layerEls.values.textContent = `${prefix}style=${styleVals} ${info.styleUnits} source=${sourceVals} ${info.dataUnits}`;
}

function getAnimationDelayMs() {
  const mode = els.animationSpeed?.value || "normal";
  if (mode === "slow") return 2600;
  if (mode === "fast") return 650;
  return 1400;
}

function pickRecordingMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const mimeType of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return "";
}

function sanitizeFileToken(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function downloadRecordedAnimation(blob) {
  const datasetA = sanitizeFileToken(els.dataset.value || "datasetA");
  const datasetB = sanitizeFileToken(getLayerDatasetName("B") || "datasetB");
  const varA = sanitizeFileToken(els.layers.A.variable.value || "varA");
  const varB = sanitizeFileToken(els.layers.B.variable.value || "varB");
  const timeA = sanitizeFileToken(els.layers.A.time.value || "time").replace(/:/g, "-");
  const name = `${datasetA}_${varA}__${datasetB}_${varB}_${timeA}_animation.webm`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function cleanupRecordingState() {
  if (state.recordingIntervalId) {
    clearInterval(state.recordingIntervalId);
    state.recordingIntervalId = undefined;
  }

  if (state.mediaStream) {
    for (const track of state.mediaStream.getTracks()) {
      track.stop();
    }
  }

  state.mediaStream = undefined;
  state.mediaRecorder = undefined;
  state.mediaChunks = [];
  state.recordingCanvas = undefined;
  state.recordingContext = undefined;
  state.recordingFrameBusy = false;
  state.recording = false;
  if (els.recordBtn) {
    els.recordBtn.textContent = "Save Animation";
  }
}

async function captureMapFrameToRecordingCanvas() {
  if (state.recordingFrameBusy || !state.recordingCanvas || !state.recordingContext) return;
  if (!state.recording) return;

  const mapEl = document.getElementById("map");
  if (!mapEl) return;

  state.recordingFrameBusy = true;
  try {
    const rendered = await window.html2canvas(mapEl, {
      backgroundColor: null,
      useCORS: true,
      logging: false,
      scale: 1,
    });
    state.recordingContext.clearRect(0, 0, state.recordingCanvas.width, state.recordingCanvas.height);
    state.recordingContext.drawImage(rendered, 0, 0, state.recordingCanvas.width, state.recordingCanvas.height);
  } catch {
    // Continue recording despite occasional frame-capture errors.
  } finally {
    state.recordingFrameBusy = false;
  }
}

function stopRecording(saveFile = true) {
  if (!state.mediaRecorder) {
    cleanupRecordingState();
    return;
  }

  const recorder = state.mediaRecorder;
  recorder.onstop = () => {
    if (saveFile && state.mediaChunks.length > 0) {
      const mimeType = recorder.mimeType || "video/webm";
      const blob = new Blob(state.mediaChunks, { type: mimeType });
      downloadRecordedAnimation(blob);
      setStatus("Animation saved (.webm).");
    } else {
      setStatus("Animation recording stopped.");
    }
    cleanupRecordingState();
  };

  if (recorder.state !== "inactive") {
    recorder.stop();
  } else {
    cleanupRecordingState();
  }
}

async function toggleRecording() {
  if (state.recording) {
    stopRecording(true);
    return;
  }

  if (typeof window.html2canvas !== "function" || typeof MediaRecorder === "undefined") {
    setStatus("Animation recording is not supported in this browser.");
    return;
  }

  const mimeType = pickRecordingMimeType();
  if (!mimeType) {
    setStatus("No supported WebM recorder codec was found.");
    return;
  }

  try {
    const mapEl = document.getElementById("map");
    if (!mapEl) {
      setStatus("Map element was not found for recording.");
      return;
    }

    const width = Math.max(2, Math.floor(mapEl.clientWidth));
    const height = Math.max(2, Math.floor(mapEl.clientHeight));

    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = width;
    recordingCanvas.height = height;
    const ctx = recordingCanvas.getContext("2d", { alpha: false });
    if (!ctx) {
      setStatus("Failed to initialize recording canvas.");
      return;
    }

    const stream = recordingCanvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType });

    state.recordingCanvas = recordingCanvas;
    state.recordingContext = ctx;
    state.mediaStream = stream;
    state.mediaRecorder = recorder;
    state.mediaChunks = [];
    state.recording = true;
    if (els.recordBtn) {
      els.recordBtn.textContent = "Stop Save";
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.mediaChunks.push(event.data);
      }
    };

    recorder.start(500);
    if (!state.animating) {
      void startAnimation();
    }

    await captureMapFrameToRecordingCanvas();
    state.recordingIntervalId = setInterval(() => {
      void captureMapFrameToRecordingCanvas();
    }, 150);

    setStatus("Recording map animation... choose Stop Save when finished.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Animation recording failed: ${message}`);
    cleanupRecordingState();
  }
}

function setAnimationButtonState() {
  els.animateBtn.textContent = state.animating ? "Stop Animation" : "Start Animation";
}

function stopAnimation() {
  state.animating = false;
  state.animationRunId += 1;
  setAnimationButtonState();
}

function getLayerTimesMs(layerKey) {
  return Array.from(els.layers[layerKey].time.options)
    .map((option) => Date.parse(option.value))
    .filter((value) => Number.isFinite(value));
}

function getMedianStepMs(timesMs) {
  if (!Array.isArray(timesMs) || timesMs.length < 2) return Number.POSITIVE_INFINITY;
  const sorted = [...timesMs].sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff > 0) diffs.push(diff);
  }
  if (diffs.length === 0) return Number.POSITIVE_INFINITY;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function findNearestIndex(timesMs, targetMs, currentIdx = -1) {
  let nearestIdx = -1;
  let nearestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < timesMs.length; i += 1) {
    const diff = Math.abs(timesMs[i] - targetMs);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestIdx = i;
      continue;
    }
    if (diff === nearestDiff && i === currentIdx) {
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

async function stepLayersSyncedByClosestTime() {
  const timesA = getLayerTimesMs("A");
  const timesB = getLayerTimesMs("B");
  if (timesA.length === 0 || timesB.length === 0) {
    await stepLayerTime("A");
    await stepLayerTime("B");
    return;
  }

  const stepA = getMedianStepMs(timesA);
  const stepB = getMedianStepMs(timesB);
  const finerKey = stepA <= stepB ? "A" : "B";
  const coarserKey = finerKey === "A" ? "B" : "A";

  await stepLayerTime(finerKey);

  const targetMs = Date.parse(els.layers[finerKey].time.value);
  if (!Number.isFinite(targetMs)) return;

  const coarseSelect = els.layers[coarserKey].time;
  const coarseValues = Array.from(coarseSelect.options).map((option) => option.value);
  const coarseTimesMs = coarseValues.map((value) => Date.parse(value));
  const currentIdx = coarseValues.indexOf(coarseSelect.value);
  const nearestIdx = findNearestIndex(coarseTimesMs, targetMs, currentIdx);
  if (nearestIdx < 0) return;

  const nearestValue = coarseValues[nearestIdx];
  if (nearestValue !== coarseSelect.value) {
    coarseSelect.value = nearestValue;
    await setLayerTime(coarserKey);
  }
}

async function syncOtherLayerToClosestTime(changedLayerKey) {
  const otherLayerKey = changedLayerKey === "A" ? "B" : "A";
  const changedMs = Date.parse(els.layers[changedLayerKey].time.value);
  if (!Number.isFinite(changedMs)) return;

  const otherSelect = els.layers[otherLayerKey].time;
  const otherValues = Array.from(otherSelect.options).map((option) => option.value);
  const otherTimesMs = otherValues.map((value) => Date.parse(value));
  const currentIdx = otherValues.indexOf(otherSelect.value);
  const nearestIdx = findNearestIndex(otherTimesMs, changedMs, currentIdx);
  if (nearestIdx < 0) return;

  const nearestValue = otherValues[nearestIdx];
  if (nearestValue !== otherSelect.value) {
    otherSelect.value = nearestValue;
    await setLayerTime(otherLayerKey);
  }
}

async function stepLayerTime(layerKey) {
  const sel = els.layers[layerKey].time;
  const times = Array.from(sel.options).map((o) => o.value);
  if (times.length === 0) return;
  const currentIdx = Math.max(0, times.indexOf(sel.value));
  const nextIdx = (currentIdx + 1) % times.length;
  sel.value = times[nextIdx];
  await setLayerTime(layerKey);
}

async function startAnimation() {
  if (state.animating) return;
  state.animating = true;
  state.animationRunId += 1;
  const runId = state.animationRunId;
  setAnimationButtonState();

  await setAnimationQualityLock(true);

  try {
    while (state.animating && runId === state.animationRunId) {
      const syncMode = (els.lockAnimation?.value || "sync") === "sync";
      if (syncMode) {
        await stepLayersSyncedByClosestTime();
      } else {
        await stepLayerTime("A");
        await stepLayerTime("B");
      }
      await new Promise((resolve) => setTimeout(resolve, getAnimationDelayMs()));
    }
  } catch {
    // continue through transient animation errors
  } finally {
    await setAnimationQualityLock(false);
    if (state.animating && runId === state.animationRunId) {
      stopAnimation();
    }
  }
}

function toggleAnimation() {
  if (state.animating) {
    stopAnimation();
    return;
  }
  void startAnimation();
}

function getSavedViews() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSavedViews(views) {
  localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(views));
}

function refreshSavedViewsDropdown(selectedName) {
  const views = getSavedViews();
  els.savedViews.innerHTML = "";

  if (views.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no saved views)";
    els.savedViews.append(opt);
    return;
  }

  for (const view of views) {
    const opt = document.createElement("option");
    opt.value = view.name;
    opt.textContent = view.name;
    els.savedViews.append(opt);
  }

  if (selectedName && views.some((v) => v.name === selectedName)) {
    els.savedViews.value = selectedName;
  }
}

function snapshotCurrentView(name) {
  return {
    name,
    savedAt: new Date().toISOString(),
    dataset: els.dataset.value,
    datasetB: els.layers.B.dataset.value,
    basemap: els.basemapSelect.value,
    animationSpeed: els.animationSpeed.value,
    lockAnimation: els.lockAnimation.value,
    layers: {
      A: {
        variable: els.layers.A.variable.value,
        time: els.layers.A.time.value,
        opacity: Number(els.layers.A.opacity.value),
        style: structuredClone(state.layers.A.style),
      },
      B: {
        variable: els.layers.B.variable.value,
        time: els.layers.B.time.value,
        opacity: Number(els.layers.B.opacity.value),
        style: structuredClone(state.layers.B.style),
      },
    },
  };
}

function saveCurrentView() {
  const name = (els.viewName.value || "").trim();
  if (!name) {
    setStatus("Enter a view name first.");
    return;
  }

  const views = getSavedViews();
  const next = views.filter((v) => v.name !== name);
  next.push(snapshotCurrentView(name));
  next.sort((a, b) => a.name.localeCompare(b.name));
  setSavedViews(next);
  refreshSavedViewsDropdown(name);
  setStatus(`Saved view: ${name}`);
}

async function loadViewByName(name) {
  const targetName = (name || "").trim();
  if (!targetName) {
    setStatus("Select a saved view first.");
    return;
  }

  const view = getSavedViews().find((v) => v.name === targetName);
  if (!view) {
    setStatus(`Saved view not found: ${targetName}`);
    return;
  }

  await applyViewSettings(view, `Loaded view: ${targetName}`);
}

async function applyViewSettings(view, successStatus) {
  if (!view || typeof view !== "object") {
    setStatus("Invalid view settings.");
    return;
  }

  stopAnimation();

  if (view.basemap) {
    els.basemapSelect.value = view.basemap;
    applyBasemapLayer(view.basemap);
  }
  if (view.animationSpeed) els.animationSpeed.value = view.animationSpeed;
  if (view.lockAnimation) els.lockAnimation.value = view.lockAnimation;

  if (view.dataset) {
    els.dataset.value = view.dataset;
    if (view.datasetB) refreshOverlayBDatasetOptions(view.datasetB);
    await reloadDataset();
  }

  for (const layerKey of ["A", "B"]) {
    const layerView = view.layers?.[layerKey];
    if (!layerView) continue;

    if (layerView.variable) els.layers[layerKey].variable.value = layerView.variable;
    if (typeof layerView.opacity === "number") {
      state.layers[layerKey].opacity = layerView.opacity;
      els.layers[layerKey].opacity.value = String(layerView.opacity);
    }
    if (layerView.style) {
      state.layers[layerKey].style = cleanStyle(layerView.style);
      writeStyleToControls(layerKey, state.layers[layerKey].style);
    }

    await reloadLayer(layerKey, { keepTime: false });

    if (layerView.time) {
      els.layers[layerKey].time.value = layerView.time;
      await setLayerTime(layerKey);
    }
  }

  syncLayerOrdering();
  setStatus(successStatus || "View settings applied.");
}

function deleteViewByName(name) {
  const targetName = (name || "").trim();
  if (!targetName) {
    setStatus("Select a saved view first.");
    return;
  }
  setSavedViews(getSavedViews().filter((v) => v.name !== targetName));
  refreshSavedViewsDropdown();
  setStatus(`Deleted view: ${targetName}`);
}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function buildExportViewObject() {
  const selectedName = (els.savedViews.value || "").trim();
  const typedName = (els.viewName.value || "").trim();
  const baseName = selectedName || typedName || "shared-view";
  return snapshotCurrentView(baseName);
}

function exportCurrentViewToFile() {
  const view = buildExportViewObject();

  const payload = {
    format: "wxtiles-extended-view",
    version: 1,
    exportedAt: new Date().toISOString(),
    view,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = sanitizeFileNamePart(view.name) || "view";

  anchor.href = url;
  anchor.download = `wxtiles-extended-${safeName}-${stamp}.json`;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus(`Exported current view settings: ${view.name}`);
}

function normalizeImportedViews(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];

  if (Array.isArray(input.views)) return input.views;
  if (input.view && typeof input.view === "object") return [input.view];
  if (input.overlayA || input.overlayB) {
    return [
      {
        name: String(input.name || "imported-view"),
        dataset: input.dataset,
        datasetB: input.datasetB,
        basemap: input.basemap,
        animationSpeed: input.animationSpeed,
        lockAnimation: input.lockAnimation,
        layers: {
          A: input.overlayA || {},
          B: input.overlayB || {},
        },
      },
    ];
  }
  if (input.layers && typeof input.layers === "object") return [input];

  return [];
}

function isValidImportedView(view) {
  if (!view || typeof view !== "object") return false;
  if (!String(view.name || "").trim()) return false;
  if (!view.layers || typeof view.layers !== "object") return false;
  if (!view.layers.A || !view.layers.B) return false;
  return true;
}

async function importViewsFromText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    setStatus("Import failed: invalid JSON file.");
    return;
  }

  const candidateViews = normalizeImportedViews(parsed);
  const importedViews = candidateViews
    .filter(isValidImportedView)
    .map((view, index) => ({
      ...view,
      name: String(view.name || `imported-view-${index + 1}`).trim(),
      importedAt: new Date().toISOString(),
    }));

  if (importedViews.length === 0) {
    setStatus("Import failed: no valid Extended views found in file.");
    return;
  }

  const existing = getSavedViews();
  const mergedMap = new Map(existing.map((view) => [String(view.name), view]));
  for (const view of importedViews) {
    mergedMap.set(view.name, view);
  }

  const mergedViews = Array.from(mergedMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  setSavedViews(mergedViews);

  const firstImportedName = importedViews[0].name;
  refreshSavedViewsDropdown(firstImportedName);
  await applyViewSettings(importedViews[0], `Imported and applied view: ${firstImportedName}`);

  setStatus(
    importedViews.length === 1
      ? `Imported and applied 1 view: ${firstImportedName}`
      : `Imported ${importedViews.length} views and applied: ${firstImportedName}`,
  );
}

function triggerImportViewFile() {
  if (!els.importViewFile) return;
  els.importViewFile.value = "";
  els.importViewFile.click();
}

function readFileAsText(file) {
  if (!file) return Promise.reject(new Error("No file provided"));
  if (typeof file.text === "function") return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsText(file);
  });
}

async function reloadBothLayers() {
  await reloadLayer("A", { keepTime: true });
  await reloadLayer("B", { keepTime: true });
}

async function reloadDataset() {
  const dataset = els.dataset.value;
  if (!dataset) return;

  stopAnimation();
  setStatus("Loading dataset and overlays...");
  state.datasetManager = await ensureDatasetManager(dataset);

  refreshOverlayBDatasetOptions();

  const varsA = await getDatasetVariables(dataset);
  fillVariableOptions("A", varsA, els.layers.A.variable.value);

  const datasetB = getLayerDatasetName("B");
  const varsB = await getDatasetVariables(datasetB);
  fillVariableOptions("B", varsB, els.layers.B.variable.value);

  await reloadBothLayers();
  setStatus(datasetB === dataset ? `Overlays active on ${dataset}` : `Overlay A=${dataset}, Overlay B=${datasetB}`);
}

function bindStyleEvents(layerKey) {
  const layerEls = els.layers[layerKey];
  const editor = layerEls.editor;
  const sc = styleControls[layerKey];

  layerEls.toggle.addEventListener("click", () => {
    const collapsed = layerEls.editor.classList.toggle("collapsed");
    layerEls.toggle.textContent = collapsed ? `Custom Style ${layerKey}` : `Update Custom Style ${layerKey} & Hide`;
  });

  sc.colorScheme.addEventListener("change", () => {
    const schemeColors = COLOR_SCHEMES[sc.colorScheme.value];
    const schemeLevels = COLOR_SCHEME_LEVELS[sc.colorScheme.value];
    sc.colors.value = schemeColors ? JSON.stringify(schemeColors) : "";
    sc.colorMap.value = "";
    sc.levels.value = Array.isArray(schemeLevels) ? JSON.stringify(schemeLevels) : "";

    state.layers[layerKey].style = getCurrentStyleFromControls(layerKey);
    updateStyleJson(layerKey);
    drawLegend(layerKey, state.layers[layerKey].style);
    scheduleStyleApply(layerKey, 60);
  });

  editor.querySelectorAll("input, select:not([id^='colorScheme'])").forEach((node) => {
    node.addEventListener("input", () => {
      state.layers[layerKey].style = getCurrentStyleFromControls(layerKey);
      updateStyleJson(layerKey);
      drawLegend(layerKey, state.layers[layerKey].style);
      scheduleStyleApply(layerKey, 180);
    });
    node.addEventListener("change", () => {
      state.layers[layerKey].style = getCurrentStyleFromControls(layerKey);
      updateStyleJson(layerKey);
      drawLegend(layerKey, state.layers[layerKey].style);
      scheduleStyleApply(layerKey, 80);
    });
  });
}

function bindEvents() {
  els.datasetFilter.addEventListener("input", () => {
    if (!applyDatasetFilter()) return;
    void reloadDataset();
  });

  els.dataset.addEventListener("change", () => {
    void reloadDataset();
  });

  els.layers.B.dataset.addEventListener("change", () => {
    stopAnimation();
    void (async () => {
      const datasetB = getLayerDatasetName("B");
      const varsB = await getDatasetVariables(datasetB);
      fillVariableOptions("B", varsB, els.layers.B.variable.value);
      await reloadLayer("B", { keepTime: true });
      setStatus(datasetB === els.dataset.value ? `Overlay B now follows Dataset A (${datasetB})` : `Overlay B switched to ${datasetB}`);
    })();
  });

  els.basemapSelect.addEventListener("change", () => {
    applyBasemapLayer(els.basemapSelect.value);
  });

  els.animateBtn.addEventListener("click", () => {
    toggleAnimation();
  });

  if (els.recordBtn) {
    els.recordBtn.addEventListener("click", () => {
      void toggleRecording();
    });
  }

  els.saveViewBtn.addEventListener("click", () => {
    saveCurrentView();
  });

  els.loadViewBtn.addEventListener("click", () => {
    void loadViewByName(els.savedViews.value);
  });

  els.deleteViewBtn.addEventListener("click", () => {
    deleteViewByName(els.savedViews.value);
  });

  if (els.exportViewBtn) {
    els.exportViewBtn.addEventListener("click", () => {
      exportCurrentViewToFile();
    });
  }

  if (els.importViewBtn) {
    els.importViewBtn.addEventListener("click", () => {
      triggerImportViewFile();
    });
  }

  if (els.importViewFile) {
    els.importViewFile.addEventListener("change", () => {
      const file = els.importViewFile.files?.[0];
      if (!file) return;
      void readFileAsText(file)
        .then((text) => importViewsFromText(text))
        .catch(() => {
          setStatus("Import failed: unable to read file.");
        });
    });
  }

  for (const layerKey of ["A", "B"]) {
    const layerEls = els.layers[layerKey];

    layerEls.variable.addEventListener("change", () => {
      stopAnimation();
      void reloadLayer(layerKey, { keepTime: true });
    });

    layerEls.time.addEventListener("change", () => {
      stopAnimation();
      void (async () => {
        await setLayerTime(layerKey);
        const syncMode = (els.lockAnimation?.value || "sync") === "sync";
        if (syncMode) {
          await syncOtherLayerToClosestTime(layerKey);
        }
      })();
    });

    layerEls.opacity.addEventListener("input", () => {
      state.layers[layerKey].opacity = Number(layerEls.opacity.value);
      if (state.layers[layerKey].source && typeof state.layers[layerKey].source.setOpacity === "function") {
        state.layers[layerKey].source.setOpacity(state.layers[layerKey].opacity);
      }
    });

    bindStyleEvents(layerKey);
  }

  map.on("mousemove", (event) => {
    state.cursorLatLng = event.latlng;
    const wrapped = event.latlng.wrap();
    els.cursor.textContent = `lnglat=(${wrapped.lng.toFixed(2)}, ${wrapped.lat.toFixed(2)})`;
    updateLayerMetaAndValues("A");
    updateLayerMetaAndValues("B");
  });

  map.on("moveend", () => {
    updateLayerMetaAndValues("A");
    updateLayerMetaAndValues("B");
  });

  map.on("zoomend", () => {
    updateLayerMetaAndValues("A");
    updateLayerMetaAndValues("B");
  });
}

async function initialize() {
  initStyleEditors();
  styleControls.A = getStyleControls("A");
  styleControls.B = getStyleControls("B");

  fillColorSchemes("A");
  fillColorSchemes("B");
  writeStyleToControls("A", state.layers.A.style);
  writeStyleToControls("B", state.layers.B.style);

  bindEvents();

  await ensureWxSymbolFonts();
  await ensureApi();

  setStatus("Loading datasets...");
  state.allDatasets = await state.wxapi.getAllDatasetsNames();
  state.allDatasets.sort();

  if (!applyDatasetFilter()) return;
  refreshOverlayBDatasetOptions();
  await reloadDataset();

  updateMapTimeUtcText();

  refreshSavedViewsDropdown();
  setAnimationButtonState();
}

void initialize();
