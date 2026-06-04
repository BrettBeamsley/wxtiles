import { WxAPI } from "https://esm.sh/@metoceanapi/wxtiles-leaflet";

const WX_DEMO_CSS_URL = "https://metoceanapi.github.io/wxtiles-leaflet/script/script.css";
const EXTENDED_VIEW_STORAGE_KEY = "wxtiles-main-extended-views";
const EXTENDED_VIEW_STORAGE_FALLBACK_KEYS = [
  EXTENDED_VIEW_STORAGE_KEY,
  "wxtiles-main-extended-views",
  "wxtiles-main-views",
];

function collectViewCandidates(parsed) {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;

  if (typeof parsed === "object") {
    if (Array.isArray(parsed.views)) return parsed.views;
    if (Array.isArray(parsed.items)) return parsed.items;

    const values = Object.values(parsed);
    if (values.length > 0 && values.every((v) => v && typeof v === "object")) {
      return values;
    }
  }

  return [];
}

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
  allDatasets: [],
  currentStyle: structuredClone(DEFAULT_STYLE),
  lockDatasets: false,
  lockVariables: false,
  lockTimeSteps: false,
  syncingView: false,
  syncingVariable: false,
  syncingTime: false,
  animating: false,
  animationRunId: 0,
  animationSpeedPreset: "normal",
  panels: [
    {
      wxsource: undefined,
      wxsourceSecondary: undefined,
      datasetManager: undefined,
      secondaryDatasetManager: undefined,
      style: structuredClone(DEFAULT_STYLE),
      secondaryStyle: structuredClone(DEFAULT_STYLE),
      cursorLatLng: L.latLng(0, 0),
      busy: false,
      warnings: { variable: "", time: "" },
    },
    {
      wxsource: undefined,
      wxsourceSecondary: undefined,
      datasetManager: undefined,
      secondaryDatasetManager: undefined,
      style: structuredClone(DEFAULT_STYLE),
      secondaryStyle: structuredClone(DEFAULT_STYLE),
      cursorLatLng: L.latLng(0, 0),
      busy: false,
      warnings: { variable: "", time: "" },
    },
    {
      wxsource: undefined,
      wxsourceSecondary: undefined,
      datasetManager: undefined,
      secondaryDatasetManager: undefined,
      style: structuredClone(DEFAULT_STYLE),
      secondaryStyle: structuredClone(DEFAULT_STYLE),
      cursorLatLng: L.latLng(0, 0),
      busy: false,
      warnings: { variable: "", time: "" },
    },
  ],
};

const els = {
  playBtn: document.getElementById("playBtn"),
  animationSpeedPreset: document.getElementById("animationSpeedPreset"),
  lockDatasets: document.getElementById("lockDatasets"),
  lockVariables: document.getElementById("lockVariables"),
  lockTimeSteps: document.getElementById("lockTimeSteps"),
  extendedViews: document.getElementById("extendedViews"),
  loadExtendedViewBtn: document.getElementById("loadExtendedViewBtn"),
  styleToggleBtn: document.getElementById("styleToggleBtn"),
  styleEditor: document.getElementById("styleEditor"),
  styleJson: document.getElementById("styleJson"),
  colorScheme: document.getElementById("colorScheme"),
  palettePreview: document.getElementById("palettePreview"),
};

function getAnimationDelayMs() {
  if (state.animationSpeedPreset === "slow") return 4200;
  if (state.animationSpeedPreset === "fast") return 500;
  return 1700;
}

function updatePlayButtonState() {
  if (!els.playBtn) return;
  els.playBtn.textContent = state.animating ? "Stop" : "Play";
  els.playBtn.classList.toggle("playing", state.animating);
}

function getSavedExtendedViews() {
  const byName = new Map();
  const storages = [localStorage, sessionStorage];

  for (const storage of storages) {
    const candidateKeys = new Set(EXTENDED_VIEW_STORAGE_FALLBACK_KEYS);
    try {
      for (let i = 0; i < storage.length; i++) {
        const dynamicKey = storage.key(i);
        if (!dynamicKey) continue;
        if (/wxtiles/i.test(dynamicKey) && /view/i.test(dynamicKey)) {
          candidateKeys.add(dynamicKey);
        }
      }
    } catch {
      // Ignore key enumeration errors.
    }

    for (const key of candidateKeys) {
      try {
        const raw = storage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        const candidates = collectViewCandidates(parsed);
        if (!Array.isArray(candidates) || candidates.length === 0) continue;

        for (const view of candidates) {
          if (!view || typeof view !== "object") continue;
          const name = typeof view.name === "string" ? view.name.trim() : "";
          if (!name) continue;

          const existing = byName.get(name);
          if (!existing) {
            byName.set(name, view);
            continue;
          }

          const nextSavedAt = Date.parse(view.savedAt || "");
          const prevSavedAt = Date.parse(existing.savedAt || "");
          if (Number.isFinite(nextSavedAt) && (!Number.isFinite(prevSavedAt) || nextSavedAt >= prevSavedAt)) {
            byName.set(name, view);
          }
        }
      } catch {
        // Ignore malformed storage values.
      }
    }
  }

  return Array.from(byName.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function refreshExtendedViewsDropdown(selectedName) {
  if (!els.extendedViews) return;
  const views = getSavedExtendedViews();
  const previousSelection = selectedName || els.extendedViews.value;
  els.extendedViews.innerHTML = "";

  if (views.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(no extended views found)";
    els.extendedViews.append(opt);
    return;
  }

  for (const view of views) {
    const opt = document.createElement("option");
    opt.value = view.name;
    opt.textContent = view.name;
    els.extendedViews.append(opt);
  }

  if (previousSelection && views.some((v) => v.name === previousSelection)) {
    els.extendedViews.value = previousSelection;
  } else {
    els.extendedViews.value = views[0].name;
  }
}

function bindExtendedViewRefresh() {
  if (!els.extendedViews) return;

  const refresh = () => {
    refreshExtendedViewsDropdown(els.extendedViews.value);
  };

  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener("storage", (event) => {
    if (!event.key || EXTENDED_VIEW_STORAGE_FALLBACK_KEYS.includes(event.key)) {
      refresh();
    }
  });

  els.extendedViews.addEventListener("pointerdown", refresh);
}

function stopAnimation() {
  state.animating = false;
  state.animationRunId += 1;
  void setAnimationCoarseLevel(false);
  updatePlayButtonState();
}

async function animateStepForward() {
  const basePanel = panels[0];
  const times = getSelectValues(basePanel.timeSelect);
  if (times.length === 0) {
    stopAnimation();
    return;
  }

  const currentIdx = Math.max(0, times.indexOf(basePanel.timeSelect.value));
  const nextIdx = (currentIdx + 1) % times.length;
  const nextTime = times[nextIdx];

  // During animation, force all panes to the same target timestamp.
  for (let i = 0; i < 3; i++) {
    await setPanelTime(i, nextTime);
  }
}

async function setAnimationCoarseLevel(enable) {
  const tasks = [];
  for (let i = 0; i < 3; i++) {
    const sources = [state.panels[i].wxsource, state.panels[i].wxsourceSecondary].filter(Boolean);
    for (const src of sources) {
      if (enable && typeof src.setCoarseLevel === "function") {
        tasks.push(src.setCoarseLevel(2).catch(() => {}));
      }
      if (!enable && typeof src.unsetCoarseLevel === "function") {
        tasks.push(src.unsetCoarseLevel().catch(() => {}));
      }
    }
  }
  await Promise.all(tasks);
}

function startAnimation() {
  if (state.animating) return;
  state.animating = true;
  state.animationRunId += 1;
  const runId = state.animationRunId;

  // Keep panels locked in time while animation is running.
  els.lockTimeSteps.checked = true;
  state.lockTimeSteps = true;

  updatePlayButtonState();

  const runLoop = async () => {
    await setAnimationCoarseLevel(true);
    while (state.animating && runId === state.animationRunId) {
      await animateStepForward();
      const frameDelay = getAnimationDelayMs();
      const chunks = Math.max(1, Math.round(frameDelay / 100));
      // Wait between frames but allow a quick stop response.
      for (let i = 0; i < chunks; i++) {
        if (!state.animating || runId !== state.animationRunId) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  };
  void runLoop();
}

function toggleAnimation() {
  if (state.animating) {
    stopAnimation();
    return;
  }
  startAnimation();
}

const panels = [
  {
    idx: 0,
    dataset: document.getElementById("dataset0"),
    variable: document.getElementById("variable0"),
    timeSelect: document.getElementById("timeSelect0"),
    meta: document.getElementById("meta0"),
    values: document.getElementById("values0"),
    times: document.getElementById("times0"),
    warning: document.getElementById("warning0"),
    map: L.map("map0", { center: [-40.75, 174.5], zoom: 7, worldCopyJump: true, zoomControl: false }),
    legend: document.getElementById("legend0"),
  },
  {
    idx: 1,
    dataset: document.getElementById("dataset1"),
    variable: document.getElementById("variable1"),
    timeSelect: document.getElementById("timeSelect1"),
    meta: document.getElementById("meta1"),
    values: document.getElementById("values1"),
    times: document.getElementById("times1"),
    warning: document.getElementById("warning1"),
    map: L.map("map1", { center: [-40.75, 174.5], zoom: 7, worldCopyJump: true, zoomControl: false }),
    legend: document.getElementById("legend1"),
  },
  {
    idx: 2,
    dataset: document.getElementById("dataset2"),
    variable: document.getElementById("variable2"),
    timeSelect: document.getElementById("timeSelect2"),
    meta: document.getElementById("meta2"),
    values: document.getElementById("values2"),
    times: document.getElementById("times2"),
    warning: document.getElementById("warning2"),
    map: L.map("map2", { center: [-40.75, 174.5], zoom: 7, worldCopyJump: true, zoomControl: false }),
    legend: document.getElementById("legend2"),
  },
];

// Add base tile layer to each map
for (const p of panels) {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(p.map);
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

function sortObjectKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeysDeep);
  if (!value || typeof value !== "object") return value;

  const sorted = {};
  for (const key of Object.keys(value).sort((a, b) => a.toUpperCase().localeCompare(b.toUpperCase()))) {
    sorted[key] = sortObjectKeysDeep(value[key]);
  }
  return sorted;
}

function updateStyleJson() {
  els.styleJson.value = JSON.stringify(sortObjectKeysDeep(cleanStyle(state.currentStyle)), null, 2);
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

function drawPanelLegend(panelIdx, style) {
  const panel = panels[panelIdx];
  const panelState = state.panels[panelIdx];
  const canvas = panel.legend;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const colors = getPaletteFromStyle(style);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  const count = Math.max(colors.length - 1, 1);
  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const noAlpha = color.length >= 7 ? color.slice(0, 7) : color;
    gradient.addColorStop(i / count, noAlpha);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = gradient;
  ctx.fillRect(8, 12, canvas.width - 16, 11);

  ctx.strokeStyle = "rgba(30,30,30,0.5)";
  ctx.strokeRect(8, 12, canvas.width - 16, 11);

  const meta = panelState.wxsource?.getCurrentVariableMeta();
  const legendUnits = style.units || meta?.units || "";

  let levels = style.levels;
  if ((!Array.isArray(levels) || levels.length < 2) && panelState.wxsource) {
    const resolvedLevels = panelState.wxsource.getCurrentStyleObjectCopy()?.levels;
    if (Array.isArray(resolvedLevels) && resolvedLevels.length >= 2) {
      levels = resolvedLevels;
    }
  }
  if ((!Array.isArray(levels) || levels.length < 2) && typeof meta?.min === "number" && typeof meta?.max === "number") {
    const step = (meta.max - meta.min) / 4;
    levels = [meta.min, meta.min + step, meta.min + 2 * step, meta.min + 3 * step, meta.max];
  }

  ctx.fillStyle = "#111";
  ctx.font = "10px IBM Plex Mono";
  const title = legendUnits ? `${panel.variable.value} (${legendUnits})` : panel.variable.value;
  ctx.fillText(title.slice(0, 38), 8, 9);

  if (Array.isArray(levels) && levels.length >= 2) {
    const minVal = levels[0];
    const maxVal = levels[levels.length - 1];
    const range = maxVal - minVal || 1;
    const tickCount = Math.min(5, levels.length);
    const step = (levels.length - 1) / Math.max(tickCount - 1, 1);

    ctx.strokeStyle = "rgba(20,20,20,0.75)";
    ctx.fillStyle = "#222";
    ctx.font = "9px IBM Plex Mono";

    for (let i = 0; i < tickCount; i++) {
      const idx = Math.min(Math.round(i * step), levels.length - 1);
      const val = levels[idx];
      const posPct = (val - minVal) / range;
      const x = 8 + posPct * (canvas.width - 16);
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x, 28);
      ctx.stroke();

      const label = Math.abs(val) >= 1000 ? val.toFixed(0) : val.toFixed(1);
      const centered = Math.max(2, Math.min(canvas.width - 26, x - 12));
      ctx.fillText(label, centered, 40);
    }
  }
}

function drawAllLegends() {
  for (let i = 0; i < 3; i++) {
    drawPanelLegend(i, state.currentStyle);
  }
}

function markSelectAvailability(selectEl, isAvailable, message = "") {
  if (isAvailable) {
    selectEl.classList.remove("unavailable");
    selectEl.removeAttribute("title");
    return;
  }
  selectEl.classList.add("unavailable");
  selectEl.title = message;
}

function setPanelWarning(panelIdx, key, message) {
  const panelState = state.panels[panelIdx];
  const panel = panels[panelIdx];
  panelState.warnings[key] = message || "";
  const joined = Object.values(panelState.warnings).filter(Boolean).join(" | ");
  panel.warning.textContent = joined;
  panel.warning.classList.toggle("active", Boolean(joined));
}

function getSelectValues(selectEl) {
  return Array.from(selectEl.options).map((opt) => opt.value);
}

function getCurrentStyleFromControls() {
  const style = {
    name: undefined,
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
  document.getElementById("fill").value = style.fill || "gradient";
  setModeAndColor("isolineColorMode", "isolineColorCustom", style.isolineColor || "none");
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
    document.getElementById("colorMap").value = "";
    document.getElementById("levels").value = Array.isArray(style.levels) ? JSON.stringify(style.levels.map((v) => +Number(v).toFixed(2))) : "";
  }

  document.getElementById("blurRadius").value = String(style.blurRadius ?? 0);
  document.getElementById("addDegrees").value = String(style.addDegrees ?? 0);

  const unitsEl = document.getElementById("units");
  const unitsVal = style.units || "";
  if (unitsVal && !Array.from(unitsEl.options).some((o) => o.value === unitsVal)) {
    const opt = document.createElement("option");
    opt.value = unitsVal;
    opt.textContent = unitsVal;
    unitsEl.append(opt);
  }
  unitsEl.value = unitsVal;

  document.getElementById("mask").value = style.mask || "none";
  document.getElementById("glAnimationSpeed").value = String(style.gl?.animationSpeed ?? 1);
  document.getElementById("glNoiseTexturePow").value = String(style.gl?.noiseTexturePow ?? 5);
  document.getElementById("glVectorFieldFactor").value = String(style.gl?.vectorFieldFactor ?? 1);
  document.getElementById("glAnimationIntensity").value = String(style.gl?.animationIntensity ?? 5);
  document.getElementById("glWavesCount").value = String(style.gl?.wavesCount ?? 4);
}

function populateUnitsDropdown(nativeUnits, currentUnits) {
  const unitsEl = document.getElementById("units");
  if (!unitsEl) return;

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
    opt.textContent = unit === nativeUnits ? `${unit} ★` : unit;
    unitsEl.append(opt);
  }

  unitsEl.value = options.includes(prevValue) ? prevValue : (nativeUnits || options[0] || "");
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
    // Fonts optional
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

function applyDatasetFilter(panelIdx) {
  const panel = panels[panelIdx];
  const filter = ""; // No filter UI for comparison view
  const filtered = filter ? state.allDatasets.filter((name) => name.toLowerCase().includes(filter)) : state.allDatasets;

  panel.dataset.innerHTML = "";
  for (const dataset of filtered) {
    const option = document.createElement("option");
    option.value = dataset;
    option.textContent = dataset;
    panel.dataset.append(option);
  }

  if (filtered.length === 0) return;
  panel.dataset.value = filtered[0];
}

async function loadVariablesForDataset(panelIdx, datasetName) {
  const panel = panels[panelIdx];
  const variables = await state.wxapi.getDatasetAllVariables(datasetName);
  panel.variable.innerHTML = "";

  for (const variable of variables || []) {
    const option = document.createElement("option");
    option.value = variable;
    option.textContent = variable;
    panel.variable.append(option);
  }

  if (!variables || variables.length === 0) return;
  panel.variable.value = variables[0];
}

function fillTimes(panelIdx, times, preferred) {
  const panel = panels[panelIdx];
  panel.timeSelect.innerHTML = "";
  for (const time of times || []) {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    panel.timeSelect.append(option);
  }
  if (times && times.length > 0) {
    panel.timeSelect.value = preferred && times.includes(preferred) ? preferred : times[0];
  }
}

async function reloadPanel(panelIdx, options = {}) {
  const panel = panels[panelIdx];
  const panelState = state.panels[panelIdx];
  if (panelState.busy) return;

  panelState.busy = true;

  try {
    const dataset = panel.dataset.value;
    const variable = panel.variable.value;
    const preferredTime = options.preferredTime || panel.timeSelect.value;

    if (!dataset || !variable) return;

    panelState.datasetManager = await state.wxapi.createDatasetManager(dataset);

    if (panelState.wxsource) {
      panel.map.removeLayer(panelState.wxsource);
      panelState.wxsource = undefined;
    }

    const panelStyle = cleanStyle(options.styleOverride || panelState.style || state.currentStyle);
    panelState.style = panelStyle;

    panelState.wxsource = panelState.datasetManager.createSourceLayer(
      {
        variable,
        time: preferredTime || undefined,
        wxstyle: panelStyle,
      },
      { id: `wxsource-${panelIdx}`, opacity: 0.92, attribution: "WxTiles" },
    );

    panel.map.addLayer(panelState.wxsource);
    await new Promise((resolve) => panelState.wxsource.once("load", resolve));

    fillTimes(panelIdx, panelState.wxsource.getAllTimes(), panelState.wxsource.getTime());
    markSelectAvailability(panel.timeSelect, true);
    markSelectAvailability(panel.variable, true);
    setPanelWarning(panelIdx, "time", "");
    setPanelWarning(panelIdx, "variable", "");

    const varMeta = panelState.wxsource.getCurrentVariableMeta();
    const nativeUnits = varMeta?.units || state.currentStyle.units || "";
    if (panelIdx === 0) {
      populateUnitsDropdown(nativeUnits, state.currentStyle.units);
    }

    updatePanelMeta(panelIdx);
    drawPanelLegend(panelIdx, panelState.style || state.currentStyle);
  } catch (error) {
    console.error(`Failed to reload panel ${panelIdx}:`, error);
  } finally {
    panelState.busy = false;
  }
}

async function setSourceTime(wxsource, targetTime, targetIndex) {
  if (!wxsource) return;
  const hasSetTimeStep = typeof wxsource.setTimeStep === "function";
  const hasSetTime = typeof wxsource.setTime === "function";

  if (hasSetTime) {
    await wxsource.setTime(targetTime);
  } else if (hasSetTimeStep) {
    await wxsource.setTimeStep(targetTime);
  }

  if (typeof wxsource.getTime === "function" && wxsource.getTime() === targetTime) return;

  if (hasSetTime) {
    await wxsource.setTime(targetTime);
    if (typeof wxsource.getTime === "function" && wxsource.getTime() === targetTime) return;
  }

  if (hasSetTimeStep && typeof wxsource.getAllTimes === "function") {
    const allTimes = wxsource.getAllTimes?.() || [];
    const stepIdx = allTimes.indexOf(targetTime);
    if (stepIdx >= 0) {
      await wxsource.setTimeStep(stepIdx);
      if (typeof wxsource.getTime === "function" && wxsource.getTime() === targetTime) return;
    }
  }

  // Final fallback to local select index if available.
  if (hasSetTimeStep && typeof targetIndex === "number" && targetIndex >= 0) {
    await wxsource.setTimeStep(targetIndex);
  }
}

async function setPanelTime(panelIdx, targetTime) {
  const panel = panels[panelIdx];
  const panelState = state.panels[panelIdx];
  const availableTimes = getSelectValues(panel.timeSelect);
  const targetIndex = availableTimes.indexOf(targetTime);

  if (targetIndex < 0) {
    markSelectAvailability(panel.timeSelect, false, `Time ${targetTime} is not available for this panel.`);
    setPanelWarning(panelIdx, "time", `Time ${targetTime} is unavailable on this dataset.`);
    return false;
  }

  markSelectAvailability(panel.timeSelect, true);
  setPanelWarning(panelIdx, "time", "");
  if (panel.timeSelect.value !== targetTime) {
    panel.timeSelect.value = targetTime;
  }

  if (panelState.wxsource) {
    try {
      await setSourceTime(panelState.wxsource, targetTime, targetIndex);

      // If a secondary overlay is present, try to keep it aligned to the same target time.
      if (panelState.wxsourceSecondary) {
        const secondaryTimes = panelState.wxsourceSecondary.getAllTimes?.() || [];
        const secondaryIndex = secondaryTimes.indexOf(targetTime);
        await setSourceTime(panelState.wxsourceSecondary, targetTime, secondaryIndex >= 0 ? secondaryIndex : undefined);
      }

      updatePanelMeta(panelIdx);
      drawPanelLegend(panelIdx, panelState.style || state.currentStyle);
    } catch (error) {
      console.error(`Failed to set time on panel ${panelIdx}:`, error);
      return false;
    }
  }
  return true;
}

async function syncTimeAcrossPanels(sourceIdx, targetTime) {
  if (state.syncingTime) return;
  state.syncingTime = true;
  try {
    for (let j = 0; j < 3; j++) {
      if (j === sourceIdx) continue;
      await setPanelTime(j, targetTime);
    }
  } finally {
    state.syncingTime = false;
  }
}

async function syncVariableAcrossPanels(sourceIdx, variableName) {
  if (state.syncingVariable) return;
  state.syncingVariable = true;
  try {
    const sourceTime = panels[sourceIdx].timeSelect.value;
    for (let j = 0; j < 3; j++) {
      if (j === sourceIdx) continue;
      const targetPanel = panels[j];
      const hasVariable = getSelectValues(targetPanel.variable).includes(variableName);
      if (!hasVariable) {
        markSelectAvailability(targetPanel.variable, false, `Variable ${variableName} is not available for ${targetPanel.dataset.value}.`);
        setPanelWarning(j, "variable", `Variable ${variableName} is unavailable for ${targetPanel.dataset.value}.`);
        continue;
      }

      markSelectAvailability(targetPanel.variable, true);
      setPanelWarning(j, "variable", "");
      if (targetPanel.variable.value !== variableName) {
        targetPanel.variable.value = variableName;
      }
      await reloadPanel(j, { preferredTime: els.lockTimeSteps.checked ? sourceTime : targetPanel.timeSelect.value });
      if (els.lockTimeSteps.checked) {
        await setPanelTime(j, sourceTime);
      }
    }
  } finally {
    state.syncingVariable = false;
  }
}

async function syncDatasetAcrossPanels(sourceIdx, datasetName) {
  for (let j = 0; j < 3; j++) {
    if (j === sourceIdx) continue;
    const targetPanel = panels[j];
    if (targetPanel.dataset.value !== datasetName) {
      targetPanel.dataset.value = datasetName;
    }
    await loadVariablesForDataset(j, datasetName);

    const sourceVariable = panels[sourceIdx].variable.value;
    if (els.lockVariables.checked && getSelectValues(targetPanel.variable).includes(sourceVariable)) {
      targetPanel.variable.value = sourceVariable;
      markSelectAvailability(targetPanel.variable, true);
      setPanelWarning(j, "variable", "");
    }

    const sourceTime = panels[sourceIdx].timeSelect.value;
    await reloadPanel(j, { preferredTime: els.lockTimeSteps.checked ? sourceTime : targetPanel.timeSelect.value });
    if (els.lockTimeSteps.checked) {
      await setPanelTime(j, sourceTime);
    }
  }
}

async function applyExtendedLayerToPanel(panelIdx, layerConfig) {
  if (!layerConfig) return;
  const panel = panels[panelIdx];
  const panelState = state.panels[panelIdx];
  const dataset = layerConfig.dataset || panel.dataset.value;
  panel.dataset.value = dataset;
  await loadVariablesForDataset(panelIdx, dataset);

  const availableVariables = getSelectValues(panel.variable);
  if (layerConfig.variable && availableVariables.includes(layerConfig.variable)) {
    panel.variable.value = layerConfig.variable;
    markSelectAvailability(panel.variable, true);
    setPanelWarning(panelIdx, "variable", "");
  }

  if (typeof layerConfig.opacity === "number") {
    panelState.wxsource?.setOpacity?.(layerConfig.opacity);
  }

  const preferredTime = layerConfig.time || panel.timeSelect.value;
  await reloadPanel(panelIdx, { preferredTime, styleOverride: layerConfig.style });
  if (layerConfig.time) {
    await setPanelTime(panelIdx, layerConfig.time);
  }

  if (typeof layerConfig.opacity === "number" && panelState.wxsource?.setOpacity) {
    panelState.wxsource.setOpacity(layerConfig.opacity);
  }
}

async function clearSecondaryOverlay(panelIdx) {
  const panel = panels[panelIdx];
  const panelState = state.panels[panelIdx];
  if (panelState.wxsourceSecondary && panel.map.hasLayer(panelState.wxsourceSecondary)) {
    panel.map.removeLayer(panelState.wxsourceSecondary);
  }
  panelState.wxsourceSecondary = undefined;
  panelState.secondaryDatasetManager = undefined;
}

async function applyExtendedSecondaryOverlayToPanel(panelIdx, layerConfig) {
  const panel = panels[panelIdx];
  const panelState = state.panels[panelIdx];
  await clearSecondaryOverlay(panelIdx);

  if (!layerConfig?.dataset || !layerConfig?.variable) return;

  panelState.secondaryDatasetManager = await state.wxapi.createDatasetManager(layerConfig.dataset);
  const secondaryStyle = cleanStyle(layerConfig.style || panelState.secondaryStyle || DEFAULT_STYLE);
  panelState.secondaryStyle = secondaryStyle;

  panelState.wxsourceSecondary = panelState.secondaryDatasetManager.createSourceLayer(
    {
      variable: layerConfig.variable,
      time: layerConfig.time || undefined,
      wxstyle: secondaryStyle,
    },
    {
      id: `wxsource-${panelIdx}-secondary`,
      opacity: typeof layerConfig.opacity === "number" ? layerConfig.opacity : 0.65,
      zIndex: 360,
      attribution: "WxTiles",
    },
  );

  panel.map.addLayer(panelState.wxsourceSecondary);
  await new Promise((resolve) => panelState.wxsourceSecondary.once("load", resolve));

  if (layerConfig.time) {
    const allTimes = panelState.wxsourceSecondary.getAllTimes?.() || [];
    const targetIndex = allTimes.indexOf(layerConfig.time);
    await setSourceTime(panelState.wxsourceSecondary, layerConfig.time, targetIndex);
  }

  if (panelState.wxsource && typeof panelState.wxsource.bringToFront === "function") {
    panelState.wxsource.bringToFront();
  }
  if (panelState.wxsourceSecondary && typeof panelState.wxsourceSecondary.bringToFront === "function") {
    panelState.wxsourceSecondary.bringToFront();
  }
}

function normalizeExtendedStyle(styleCandidate) {
  if (!styleCandidate || typeof styleCandidate !== "object") return undefined;
  return cleanStyle({ ...DEFAULT_STYLE, ...styleCandidate });
}

function extractExtendedStyle(layerView, view, layerKey) {
  if (!layerView || typeof layerView !== "object") {
    return normalizeExtendedStyle(layerKey === "A" ? view?.styleA || view?.style : view?.styleB || view?.styleA || view?.style);
  }

  return normalizeExtendedStyle(
    layerView.style ||
    layerView.wxstyle ||
    layerView.customStyle ||
    layerView.styleObject ||
    (layerKey === "A" ? view?.styleA || view?.style : view?.styleB || view?.styleA || view?.style),
  );
}

function extractExtendedLayerView(view, layerKey) {
  const layers = view?.layers;
  if (layers && typeof layers === "object") {
    if (layers[layerKey]) return layers[layerKey];
    if (layers[layerKey.toLowerCase()]) return layers[layerKey.toLowerCase()];
  }

  const directKey = layerKey === "A" ? "layerA" : "layerB";
  if (view?.[directKey] && typeof view[directKey] === "object") {
    return view[directKey];
  }

  return {};
}

async function applyStyleToPanel(panelIdx, styleObject) {
  const panelState = state.panels[panelIdx];
  if (!panelState.wxsource || !styleObject) return;

  const style = cleanStyle(styleObject);
  panelState.style = style;
  await panelState.wxsource.updateCurrentStyleObject(style, true);
  updatePanelMeta(panelIdx);
  drawPanelLegend(panelIdx, style);
}

async function applySecondaryStyleToPanel(panelIdx, styleObject) {
  const panelState = state.panels[panelIdx];
  if (!panelState.wxsourceSecondary || !styleObject) return;

  const style = cleanStyle(styleObject);
  panelState.secondaryStyle = style;
  await panelState.wxsourceSecondary.updateCurrentStyleObject(style, true);
}

async function loadExtendedViewByName(viewName) {
  const name = (viewName || "").trim();
  if (!name) return;

  const view = getSavedExtendedViews().find((v) => v.name === name);
  if (!view) return;

  stopAnimation();

  const layerAView = extractExtendedLayerView(view, "A");
  const layerBView = extractExtendedLayerView(view, "B");
  const datasetA = view.dataset || view.datasetA || panels[0].dataset.value;
  const datasetB = view.datasetB && view.datasetB !== "__same__" ? view.datasetB : datasetA;
  const styleA = extractExtendedStyle(layerAView, view, "A");
  const styleB = extractExtendedStyle(layerBView, view, "B") || styleA;

  // Overlay A (primary) in all panes.
  for (let i = 0; i < 3; i++) {
    await applyExtendedLayerToPanel(i, {
      dataset: datasetA,
      variable: layerAView.variable,
      time: layerAView.time,
      opacity: layerAView.opacity,
      style: styleA,
    });
  }

  // Overlay B (secondary) in all panes.
  for (let i = 0; i < 3; i++) {
    await applyExtendedSecondaryOverlayToPanel(i, {
      dataset: datasetB,
      variable: layerBView.variable,
      time: layerBView.time,
      opacity: layerBView.opacity,
      style: styleB,
    });
  }

  if (styleA || styleB) {
    for (let i = 0; i < 3; i++) {
      if (styleA) {
        await applyStyleToPanel(i, styleA);
      }
      if (styleB) {
        await applySecondaryStyleToPanel(i, styleB);
      }
    }

    state.currentStyle = styleA || styleB || structuredClone(DEFAULT_STYLE);
    writeStyleToControls(state.currentStyle);
    updateStyleJson();
  }

  console.info(`Loaded Extended view in Compare (A+B in all panes): ${name}`);
}

function syncMapView(sourceIdx) {
  if (state.syncingView) return;
  state.syncingView = true;
  try {
    const sourceMap = panels[sourceIdx].map;
    const center = sourceMap.getCenter();
    const zoom = sourceMap.getZoom();
    for (let j = 0; j < 3; j++) {
      if (j === sourceIdx) continue;
      panels[j].map.setView(center, zoom, { animate: false });
    }
  } finally {
    state.syncingView = false;
  }
}

function formatUtcTime(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  } catch {
    return isoString;
  }
}

function updatePanelMeta(panelIdx) {
  const panelState = state.panels[panelIdx];
  const panel = panels[panelIdx];
  if (!panelState.wxsource) return;

  const meta = panelState.wxsource.getCurrentVariableMeta();
  const datasetName = panelState.wxsource.wxdatasetManager.datasetName;
  const time = panelState.wxsource.getTime();
  const units = meta.units || panelState.style?.units || state.currentStyle.units || "";

  panel.meta.textContent = `dataset=${datasetName} variable=${panel.variable.value} min=${meta.min?.toFixed(2)} max=${meta.max?.toFixed(2)} ${units}`;

  // Build per-overlay UTC time row.
  if (panel.times) {
    const timeA = formatUtcTime(time);
    const secondaryTime = panelState.wxsourceSecondary?.getTime?.();
    if (secondaryTime) {
      const timeB = formatUtcTime(secondaryTime);
      panel.times.textContent = `A: ${timeA}  |  B: ${timeB}`;
    } else {
      panel.times.textContent = timeA ? `${timeA}` : "";
    }
  }

  if (!panelState.wxsource) {
    panel.values.textContent = "style=outside source=outside";
    return;
  }

  const wrapped = panelState.cursorLatLng.wrap();
  const info = panelState.wxsource.getLayerInfoAtLatLon(wrapped, panel.map);
  if (!info) {
    panel.values.textContent = "style=outside source=outside";
    return;
  }

  const styleVals = info.inStyleUnits.map((n) => n.toFixed(2)).join(", ");
  const sourceVals = info.data.map((n) => n.toFixed(2)).join(", ");
  panel.values.textContent = `style=${styleVals} ${info.styleUnits} source=${sourceVals} ${info.dataUnits}`;
}

async function applyStyleToAllPanels() {
  state.currentStyle = getCurrentStyleFromControls();
  updateStyleJson();
  drawAllLegends();

  for (let i = 0; i < 3; i++) {
    const panelState = state.panels[i];
    if (!panelState.wxsource) continue;
    try {
      panelState.style = cleanStyle(state.currentStyle);
      await panelState.wxsource.updateCurrentStyleObject(cleanStyle(state.currentStyle), true);
      updatePanelMeta(i);
    } catch (error) {
      console.error(`Failed to update style on panel ${i}:`, error);
    }
  }
}

async function initialize() {
  await ensureWxSymbolFonts();

  fillColorSchemes();
  writeStyleToControls(state.currentStyle);
  updateStyleJson();
  drawAllLegends();

  const api = await ensureApi();
  state.allDatasets = await api.getAllDatasetsNames();
  state.allDatasets.sort();

  for (let i = 0; i < 3; i++) {
    applyDatasetFilter(i);
    await loadVariablesForDataset(i, panels[i].dataset.value);
    await reloadPanel(i);
  }

  refreshExtendedViewsDropdown();
  bindExtendedViewRefresh();
}

function bindEvents() {
  els.lockDatasets.addEventListener("change", () => {
    state.lockDatasets = els.lockDatasets.checked;
  });

  els.lockVariables.addEventListener("change", () => {
    state.lockVariables = els.lockVariables.checked;
  });

  els.lockTimeSteps.addEventListener("change", () => {
    state.lockTimeSteps = els.lockTimeSteps.checked;
  });

  for (let i = 0; i < 3; i++) {
    (function(panelIdx) {
      const panel = panels[panelIdx];

      panel.dataset.addEventListener("change", async () => {
        stopAnimation();
        await loadVariablesForDataset(panelIdx, panel.dataset.value);
        markSelectAvailability(panel.variable, true);
        setPanelWarning(panelIdx, "variable", "");
        // Preserve the pane's imported style when switching datasets.
        const preservedStyle = state.panels[panelIdx].style;
        const preservedSecondary = {
          source: state.panels[panelIdx].wxsourceSecondary,
          manager: state.panels[panelIdx].secondaryDatasetManager,
          style: state.panels[panelIdx].secondaryStyle,
        };
        await reloadPanel(panelIdx, { preferredTime: panel.timeSelect.value, styleOverride: preservedStyle });
        // Re-attach secondary overlay if one was present.
        if (preservedSecondary.source && preservedSecondary.manager) {
          const ps = state.panels[panelIdx];
          ps.secondaryDatasetManager = preservedSecondary.manager;
          ps.secondaryStyle = preservedSecondary.style;
          if (!panel.map.hasLayer(preservedSecondary.source)) {
            panel.map.addLayer(preservedSecondary.source);
          }
          ps.wxsourceSecondary = preservedSecondary.source;
          if (ps.wxsource && typeof ps.wxsource.bringToFront === "function") ps.wxsource.bringToFront();
          if (ps.wxsourceSecondary && typeof ps.wxsourceSecondary.bringToFront === "function") ps.wxsourceSecondary.bringToFront();
        }

        if (els.lockDatasets.checked) {
          await syncDatasetAcrossPanels(panelIdx, panel.dataset.value);
          return;
        }

        if (els.lockVariables.checked) {
          await syncVariableAcrossPanels(panelIdx, panel.variable.value);
        }
        if (els.lockTimeSteps.checked) {
          await syncTimeAcrossPanels(panelIdx, panel.timeSelect.value);
        }
      });

      panel.variable.addEventListener("change", async () => {
        stopAnimation();
        markSelectAvailability(panel.variable, true);
        setPanelWarning(panelIdx, "variable", "");
        // Preserve the pane's imported style when switching variables.
        const preservedStyle = state.panels[panelIdx].style;
        const preservedSecondary = {
          source: state.panels[panelIdx].wxsourceSecondary,
          manager: state.panels[panelIdx].secondaryDatasetManager,
          style: state.panels[panelIdx].secondaryStyle,
        };
        await reloadPanel(panelIdx, { preferredTime: panel.timeSelect.value, styleOverride: preservedStyle });
        // Re-attach secondary overlay if one was present.
        if (preservedSecondary.source && preservedSecondary.manager) {
          const ps = state.panels[panelIdx];
          ps.secondaryDatasetManager = preservedSecondary.manager;
          ps.secondaryStyle = preservedSecondary.style;
          if (!panel.map.hasLayer(preservedSecondary.source)) {
            panel.map.addLayer(preservedSecondary.source);
          }
          ps.wxsourceSecondary = preservedSecondary.source;
          if (ps.wxsource && typeof ps.wxsource.bringToFront === "function") ps.wxsource.bringToFront();
          if (ps.wxsourceSecondary && typeof ps.wxsourceSecondary.bringToFront === "function") ps.wxsourceSecondary.bringToFront();
        }

        if (els.lockVariables.checked) {
          await syncVariableAcrossPanels(panelIdx, panel.variable.value);
        }
        if (els.lockTimeSteps.checked) {
          await syncTimeAcrossPanels(panelIdx, panel.timeSelect.value);
        }
      });

      panel.timeSelect.addEventListener("change", async () => {
        stopAnimation();
        const newTime = panel.timeSelect.value;
        await setPanelTime(panelIdx, newTime);
        if (els.lockTimeSteps.checked) {
          await syncTimeAcrossPanels(panelIdx, newTime);
        }
      });

      panel.map.on("mousemove", (event) => {
        // Keep value readouts aligned across panes for the same hovered lat/lon.
        for (let j = 0; j < 3; j++) {
          state.panels[j].cursorLatLng = event.latlng;
          updatePanelMeta(j);
        }
      });

      panel.map.on("moveend", () => {
        syncMapView(panelIdx);
        updatePanelMeta(panelIdx);
      });
      panel.map.on("zoomend", () => {
        syncMapView(panelIdx);
        updatePanelMeta(panelIdx);
      });
    })(i);
  }

  els.styleToggleBtn.addEventListener("click", () => {
    const collapsed = els.styleEditor.classList.toggle("collapsed");
    els.styleToggleBtn.textContent = collapsed ? "show Custom Style" : "hide Custom Style";
  });

  els.playBtn.addEventListener("click", () => {
    toggleAnimation();
  });

  if (els.loadExtendedViewBtn) {
    els.loadExtendedViewBtn.addEventListener("click", () => {
      refreshExtendedViewsDropdown(els.extendedViews.value);
      void loadExtendedViewByName(els.extendedViews.value);
    });
  }

  els.animationSpeedPreset.addEventListener("change", () => {
    state.animationSpeedPreset = els.animationSpeedPreset.value || "normal";
  });

  els.colorScheme.addEventListener("change", () => {
    const schemeColors = COLOR_SCHEMES[els.colorScheme.value];
    document.getElementById("colors").value = schemeColors ? JSON.stringify(schemeColors) : "";
    document.getElementById("colorMap").value = "";

    void applyStyleToAllPanels();
  });

  // All other style controls
  document.querySelectorAll("#styleEditor input, #styleEditor select:not(#colorScheme)").forEach((node) => {
    node.addEventListener("change", () => {
      void applyStyleToAllPanels();
    });
  });
}

bindEvents();
updatePlayButtonState();
void initialize();
