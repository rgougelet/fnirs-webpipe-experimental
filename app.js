// app.js

const APP_VERSION = "0.3.9";
const APP_LAST_UPDATED = "2026-05-06 13:12 EDT";
const PROTOCOL_SCHEMA_VERSION = 1;
const VERBOSE_LOGGING = true;

const input = document.getElementById("input");
const metaDiv = document.getElementById("meta");
const controls = document.getElementById("controls");
const protocolHost = document.getElementById("protocolHost");
const plotGrid = document.getElementById("plotGrid");
const plotScrollerHost = document.getElementById("plotScrollerHost");
const stageSummaryHost = document.getElementById("stageSummaryHost");
const appVersionEl = document.getElementById("appVersion");
const appLastUpdatedEl = document.getElementById("appLastUpdated");

const plotHostEl = document.getElementById("plot");
let plotHeaderEl = null;
let plotController = null;
let currentPlotDurationSeconds = 0;

let samplingRate = null;
let data = { wl1: null, wl2: null };
let events = [];
let channelLabels = [];
let channelLabelSource = "default";
let channelDistancesMm = [];
let wavelengthsNm = [760, 850];

let currentWavelength = "wl1";
let currentChannel = 0;
let wavelengthModeNoteEl = null;
let viewWindowSecondsInput = null;
let viewOffsetSlider = null;
let viewOffsetSummaryEl = null;

let exclusionTable = null;
let lowCutEnabled = true;
let highCutEnabled = true;
let lowCutInput = null;
let highCutInput = null;
let lowCutSixDbInput = null;
let highCutSixDbInput = null;
let lowToggleBtn = null;
let highToggleBtn = null;
let filterEngineSelect = null;
let dcRestoreCheckbox = null;
let edgePaddingCheckbox = null;
let edgePaddingSecondsInput = null;
let plotModeSelect = null;
let signalDomainSelect = null;
let filterStepCheckbox = null;
let trimStepCheckbox = null;
let pipelineSummaryEl = null;
let dpfWl1Input = null;
let dpfWl2Input = null;
let filterStepEnabled = false;
let trimStepEnabled = true;
let amplitudePreservationMode = "none";

let notesInput = null;
let branchTagInput = null;

let datasetLabel = "unknown-dataset";
let inputTypeLabel = "unknown";

let sources = {
  hdr: null,
  wl1: null,
  wl2: null,
  evt: null,
  probeMat: null,
  samplingRateFrom: null,
  eventsFrom: null,
  channelLabelsFrom: null
};

let pendingProtocol = null;
let recordingSummaryContentEl = null;
let fileSourcesContentEl = null;
let eventsContentEl = null;

/* Protocol UI state */
let protocolFilenameLabelEl = null;
let lastProtocolFilename = "";
let protocolSummaryEl = null;
let themeToggleBtn = null;
let currentTheme = "dark";
const THEME_STORAGE_KEY = "fnirs-webpipe-theme";
const PLOT_MODE_STORAGE_KEY = "fnirs-webpipe-plot-mode";
const DEFAULT_PASSBAND_RIPPLE_DB = 0.1;
const DEFAULT_STOPBAND_ATTENUATION_DB = 6.0;
const MIN_EDGE_PADDING_SECONDS = 10.0;
let currentPlotMode = "raw";
let plotScrollerEl = null;
let plotTabBarEl = null;
let plotTabButtons = [];
let logSequence = 0;
let debugLogEntries = [];
let debugLogPanelEl = null;

const DEFAULT_CHANNEL_DISTANCE_MM = 30.0;
const DEFAULT_DPF = {
  wl1: 6.0,
  wl2: 6.0
};
const protocolApi = window.fnirsProtocol;
if (!protocolApi) {
  throw new Error("fnirsProtocol API missing. Ensure protocol.js loads before app.js.");
}
// Extinction coefficients below match Homer3 GetExtinctions default spectrum
// (Wray et al., 1988) at 760/850 nm after 2.303 scaling. Values are stored in
// [(1/cm)/(mmol/L)] so the MBLL solve returns mmol/L before conversion to uM.
const MBLL_EXTINCTION_BY_WAVELENGTH = {
  760: { hbo: 1.4866, hbr: 3.8437 },
  850: { hbo: 2.5264, hbr: 1.7986 }
};

initTheme();
initPlotMode();
input.addEventListener("change", handleInput);
initPlotLayout();
buildControls();
renderAppLastUpdated();

initUrlProtocolListener();

function renderAppLastUpdated() {
  if (appVersionEl) appVersionEl.textContent = APP_VERSION;
  if (!appLastUpdatedEl) return;
  appLastUpdatedEl.textContent = "Last updated: " + APP_LAST_UPDATED;
}

function clearDebugLog() {
  debugLogEntries = [];
  updateDebugLogPanel();
}

function pushDebugEntry(level, scope, details, stack) {
  const entry = {
    seq: ++logSequence,
    level,
    scope,
    details: details === undefined ? "" : details,
    stack: stack || ""
  };
  debugLogEntries.push(entry);
  if (debugLogEntries.length > 200) debugLogEntries = debugLogEntries.slice(debugLogEntries.length - 200);
  updateDebugLogPanel();
  return entry;
}

function formatDebugDetails(details) {
  if (details === undefined || details === null) return "";
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function debugLog(scope, details) {
  if (!VERBOSE_LOGGING) return;
  const entry = pushDebugEntry("log", scope, formatDebugDetails(details), "");
  const prefix = "[fnirs-webpipe " + String(entry.seq).padStart(4, "0") + "]";
  if (details === undefined) {
    console.log(prefix, scope);
    return;
  }
  console.log(prefix, scope, details);
}

function debugError(scope, err) {
  if (!VERBOSE_LOGGING) return;
  const message = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? err.stack : null;
  const entry = pushDebugEntry("error", scope, message, stack || "");
  console.error("[fnirs-webpipe " + String(entry.seq).padStart(4, "0") + "]", scope, message, stack || "");
}

function summarizeMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length || !matrix[0] || !Number.isFinite(matrix[0].length)) {
    return { rows: 0, columns: 0 };
  }
  return {
    rows: matrix.length,
    columns: matrix[0].length
  };
}

function updateDebugLogPanel() {
  if (!debugLogPanelEl) return;
  if (!debugLogEntries.length) {
    debugLogPanelEl.textContent = "No debug logs yet.";
    return;
  }
  debugLogPanelEl.textContent = debugLogEntries.map(entry => {
    const prefix = "[fnirs-webpipe " + String(entry.seq).padStart(4, "0") + "] " + entry.level.toUpperCase() + " " + entry.scope;
    const details = entry.details ? "\n" + entry.details : "";
    const stack = entry.stack ? "\n" + entry.stack : "";
    return prefix + details + stack;
  }).join("\n\n");
  debugLogPanelEl.scrollTop = debugLogPanelEl.scrollHeight;
}

/* ================= Input ================= */

async function handleInput(evt) {
  resetUiOnly();
  clearDebugLog();
  const files = Array.from(evt.target.files);
  debugLog("handleInput:selectedFiles", files.map(f => ({
    name: f.name,
    sizeBytes: f.size
  })));

  if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
    inputTypeLabel = "zip";
    datasetLabel = stem(files[0].name);
    debugLog("handleInput:mode", { inputTypeLabel, datasetLabel });
    await loadZip(files[0]);
  } else {
    inputTypeLabel = "files";
    const hdr = files.find(f => f.name.toLowerCase().endsWith(".hdr"));
    datasetLabel = hdr ? stem(hdr.name) : (files[0] ? stem(files[0].name) : "unknown-dataset");
    debugLog("handleInput:mode", { inputTypeLabel, datasetLabel });
    await loadFiles(files);
  }
}

function resetUiOnly() {
  metaDiv.innerHTML = "";
  protocolSummaryEl = null;
  protocolFilenameLabelEl = null;
  recordingSummaryContentEl = null;
  fileSourcesContentEl = null;
  eventsContentEl = null;
  currentPlotDurationSeconds = 0;
  if (plotController) plotController.clear();
}

function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  document.body.classList.toggle("theme-dark", currentTheme === "dark");
  if (themeToggleBtn) {
    themeToggleBtn.textContent = currentTheme === "dark" ? "Dark: On" : "Dark: Off";
  }
}

function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  } catch (e) {}
}

function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (e) {}
  applyTheme(saved === "light" ? "light" : "dark");
}

function initPlotMode() {
  try {
    const saved = localStorage.getItem(PLOT_MODE_STORAGE_KEY);
    currentPlotMode = normalizePlotMode(saved);
  } catch (e) {}
}

function setPlotMode(mode) {
  currentPlotMode = normalizePlotMode(mode);
  try {
    localStorage.setItem(PLOT_MODE_STORAGE_KEY, currentPlotMode);
  } catch (e) {}
  applyPlotMode();
  redraw();
}

function resetAllState() {
  samplingRate = null;
  data = { wl1: null, wl2: null };
  events = [];
  channelLabels = [];
  channelLabelSource = "default";
  channelDistancesMm = [];
  wavelengthsNm = [760, 850];

  currentWavelength = "wl1";
  currentChannel = 0;

  lowCutEnabled = true;
  highCutEnabled = true;

  sources = {
    hdr: null,
    wl1: null,
    wl2: null,
    evt: null,
    probeMat: null,
    samplingRateFrom: null,
    eventsFrom: null,
    channelLabelsFrom: null
  };

  if (stageSummaryHost) stageSummaryHost.innerHTML = "";
}

function normalizePlotMode(mode) {
  switch (mode) {
    case "filtered":
    case "trimmed":
    case "hbo":
    case "hbr":
    case "hbt":
    case "raw":
      return mode;
    case "both":
      return "raw";
    default:
      return "raw";
  }
}

function isHemoglobinPlotMode(mode) {
  return mode === "hbo" || mode === "hbr" || mode === "hbt";
}

/* ================= ZIP handling (auto detect protocol ZIP) ================= */

async function loadZip(zipFile) {
  debugLog("loadZip:start", { name: zipFile.name, sizeBytes: zipFile.size });
  const zip = await JSZip.loadAsync(zipFile);
  debugLog("loadZip:entries", {
    entryCount: Object.keys(zip.files || {}).length,
    name: zipFile.name
  });

  const protoFile =
    zip.file("protocol.pipe") ||
    zip.file("protocol.json");

  if (protoFile) {
    const txt = await protoFile.async("text");
    try {
      const obj = JSON.parse(txt);
      const normalized = normalizeProtocol(obj);
      if (data.wl1) {
        applyProtocol(normalized);
      } else {
        pendingProtocol = normalized;
      }
      lastProtocolFilename = basename(zipFile.name);
      updateProtocolFilenameLabel();
      metaDiv.textContent = "Protocol imported from ZIP. Load data to apply it to plots.";
    } catch (e) {
      metaDiv.textContent = "Protocol ZIP detected, but protocol file could not be parsed: " + e;
    }
    return;
  }

  const hdr = findZipEntryBySuffix(zip, ".hdr");
  const wl1 = findZipEntryBySuffix(zip, ".wl1");
  const wl2 = findZipEntryBySuffix(zip, ".wl2");
  const evt = findZipEntryBySuffix(zip, ".evt");
  const probeMat = findZipEntryByContainsAndSuffix(zip, "probeinfo", ".mat");
  debugLog("loadZip:resolvedEntries", {
    hdr: hdr ? hdr.name : null,
    wl1: wl1 ? wl1.name : null,
    wl2: wl2 ? wl2.name : null,
    evt: evt ? evt.name : null,
    probeMat: probeMat ? probeMat.name : null
  });

  await loadNirxDatasetFromReaders({
    hdr: hdr ? { name: hdr.name, readText: () => hdr.async("text") } : null,
    wl1: wl1 ? { name: wl1.name, readText: () => wl1.async("text") } : null,
    wl2: wl2 ? { name: wl2.name, readText: () => wl2.async("text") } : null,
    evt: evt ? { name: evt.name, readText: () => evt.async("text") } : null,
    probeMat: probeMat ? { name: probeMat.name, readArrayBuffer: () => probeMat.async("arraybuffer") } : null
  });
}

/* ================= Loading NIRx data ================= */

async function loadFiles(files) {
  resetAllState();
  debugLog("loadFiles:start", files.map(f => ({
    name: f.name,
    sizeBytes: f.size
  })));

  const hdr = files.find(f => f.name.toLowerCase().endsWith(".hdr"));
  const wl1 = files.find(f => f.name.toLowerCase().endsWith(".wl1"));
  const wl2 = files.find(f => f.name.toLowerCase().endsWith(".wl2"));
  const evt = files.find(f => f.name.toLowerCase().endsWith(".evt"));
  const probeMat = files.find(f =>
    f.name.toLowerCase().includes("probeinfo") &&
    f.name.toLowerCase().endsWith(".mat")
  );

  sources.hdr = hdr ? hdr.name : null;
  sources.wl1 = wl1 ? wl1.name : null;
  sources.wl2 = wl2 ? wl2.name : null;
  sources.evt = evt ? evt.name : null;
  sources.probeMat = probeMat ? probeMat.name : null;

  if (!hdr || !wl1 || !wl2) {
    metaDiv.textContent = "Missing required files (.hdr, .wl1, .wl2)";
    return;
  }

  await loadNirxDatasetFromReaders({
    hdr: { name: hdr.name, readText: () => hdr.text() },
    wl1: { name: wl1.name, readText: () => wl1.text() },
    wl2: { name: wl2.name, readText: () => wl2.text() },
    evt: evt ? { name: evt.name, readText: () => evt.text() } : null,
    probeMat: probeMat ? { name: probeMat.name, readArrayBuffer: () => probeMat.arrayBuffer() } : null
  });
}

function findZipEntryBySuffix(zip, suffix) {
  const wanted = String(suffix || "").toLowerCase();
  for (const name in zip.files) {
    const entry = zip.files[name];
    if (!entry.dir && name.toLowerCase().endsWith(wanted)) return entry;
  }
  return null;
}

function findZipEntryByContainsAndSuffix(zip, fragment, suffix) {
  const wantedFragment = String(fragment || "").toLowerCase();
  const wantedSuffix = String(suffix || "").toLowerCase();
  for (const name in zip.files) {
    const entry = zip.files[name];
    const lower = name.toLowerCase();
    if (!entry.dir && lower.includes(wantedFragment) && lower.endsWith(wantedSuffix)) return entry;
  }
  return null;
}

async function loadNirxDatasetFromReaders(parts) {
  resetAllState();
  debugLog("loadDataset:start", {
    hdr: parts && parts.hdr ? parts.hdr.name : null,
    wl1: parts && parts.wl1 ? parts.wl1.name : null,
    wl2: parts && parts.wl2 ? parts.wl2.name : null,
    evt: parts && parts.evt ? parts.evt.name : null,
    probeMat: parts && parts.probeMat ? parts.probeMat.name : null
  });

  const hdr = parts && parts.hdr ? parts.hdr : null;
  const wl1 = parts && parts.wl1 ? parts.wl1 : null;
  const wl2 = parts && parts.wl2 ? parts.wl2 : null;
  const evt = parts && parts.evt ? parts.evt : null;
  const probeMat = parts && parts.probeMat ? parts.probeMat : null;

  sources.hdr = hdr ? hdr.name : null;
  sources.wl1 = wl1 ? wl1.name : null;
  sources.wl2 = wl2 ? wl2.name : null;
  sources.evt = evt ? evt.name : null;
  sources.probeMat = probeMat ? probeMat.name : null;

  if (!hdr || !wl1 || !wl2) {
    metaDiv.textContent = "Missing required files (.hdr, .wl1, .wl2)";
    return;
  }

  try {
    const loadStartMs = performance.now();
    const hdrT = await hdr.readText();
    debugLog("loadDataset:hdrRead", { chars: hdrT.length, name: hdr.name });
    samplingRate = parseSamplingRate(hdrT);
    sources.samplingRateFrom = hdr.name;
    const parsedWavelengths = parseHdrWavelengths(hdrT);
    if (parsedWavelengths.length >= 2) wavelengthsNm = parsedWavelengths.slice(0, 2);
    const activeChannelIndices = parseHdrActiveChannelIndices(hdrT);
    const hdrChannelLabels = extractHdrChannelLabels(hdrT);
    let channelCountHint = activeChannelIndices.length
      || hdrChannelLabels.length
      || parseHdrChannelDistancesMm(hdrT).length
      || parseHdrChannelCountHint(hdrT);
    debugLog("loadDataset:hdrParsed", {
      samplingRate,
      wavelengthsNm,
      activeChannelCount: activeChannelIndices.length,
      hdrChannelLabelCount: hdrChannelLabels.length,
      channelCountHint
    });

    const matBuf = probeMat ? await probeMat.readArrayBuffer() : null;
    if (matBuf) {
      channelLabels = extractChannelLabels(matBuf, channelCountHint || undefined);
      channelLabelSource = "probeInfo.mat";
      sources.channelLabelsFrom = probeMat.name;
      if (channelLabels.length) channelCountHint = channelLabels.length;
    } else {
      channelLabels = [];
      channelLabelSource = "default (probeInfo.mat not found)";
      sources.channelLabelsFrom = "default";
    }
    debugLog("loadDataset:probeInfo", {
      hasProbeInfo: !!matBuf,
      channelLabelSource,
      channelLabelCount: channelLabels.length
    });

    const matrixColumnIndices = activeChannelIndices.length ? activeChannelIndices : null;
    debugLog("loadDataset:matrixSelection", {
      selectedColumnCount: matrixColumnIndices ? matrixColumnIndices.length : null,
      selectedColumnMaxIndex: matrixColumnIndices && matrixColumnIndices.length ? matrixColumnIndices[matrixColumnIndices.length - 1] : null
    });

    const wl1T = await wl1.readText();
    debugLog("loadDataset:wl1Read", { chars: wl1T.length, name: wl1.name });
    data.wl1 = parseMatrix(wl1T, matrixColumnIndices, "wl1");

    const wl2T = await wl2.readText();
    debugLog("loadDataset:wl2Read", { chars: wl2T.length, name: wl2.name });
    data.wl2 = parseMatrix(wl2T, matrixColumnIndices, "wl2");

    const actualChannelCount = inferMatrixChannelCount(data.wl1, data.wl2);
    debugLog("loadDataset:matrixParsed", {
      wl1: summarizeMatrix(data.wl1),
      wl2: summarizeMatrix(data.wl2),
      actualChannelCount
    });
    channelDistancesMm = normalizeNumericList(
      parseHdrChannelDistancesMm(hdrT),
      actualChannelCount,
      DEFAULT_CHANNEL_DISTANCE_MM
    );
    if (channelLabels.length) {
      channelLabels = channelLabels.slice(0, actualChannelCount);
      if (channelLabels.length !== actualChannelCount) {
        channelLabels = hdrChannelLabels.slice(0, actualChannelCount);
        if (channelLabels.length === actualChannelCount) {
          channelLabelSource = "hdr S-D-Key";
          sources.channelLabelsFrom = hdr.name;
        } else {
          channelLabels = buildDefaultChannelLabels(actualChannelCount);
          channelLabelSource = "default (probeInfo channel count mismatch)";
          sources.channelLabelsFrom = "default";
        }
      }
    } else {
      channelLabels = hdrChannelLabels.slice(0, actualChannelCount);
      if (channelLabels.length === actualChannelCount) {
        channelLabelSource = "hdr S-D-Key";
        sources.channelLabelsFrom = hdr.name;
      } else {
        channelLabels = buildDefaultChannelLabels(actualChannelCount);
      }
    }

    const evtT = evt ? await evt.readText() : null;
    events = evtT ? parseEvents(evtT) : [];
    sources.eventsFrom = evt ? evt.name : "none";
    debugLog("loadDataset:eventsParsed", {
      eventCount: events.length,
      eventsFrom: sources.eventsFrom
    });

    const controlsStartMs = performance.now();
    buildControls();
    debugLog("loadDataset:buildControls", {
      ms: Number((performance.now() - controlsStartMs).toFixed(1))
    });
    controls.classList.remove("hidden");

    if (pendingProtocol) {
      applyProtocol(pendingProtocol);
      pendingProtocol = null;
    }

    const metaStartMs = performance.now();
    renderMeta();
    debugLog("loadDataset:renderMeta", {
      ms: Number((performance.now() - metaStartMs).toFixed(1))
    });
    const redrawStartMs = performance.now();
    redraw();
    debugLog("loadDataset:redraw", {
      ms: Number((performance.now() - redrawStartMs).toFixed(1))
    });
    debugLog("loadDataset:complete", {
      datasetLabel,
      elapsedMs: Number((performance.now() - loadStartMs).toFixed(1))
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    metaDiv.textContent = "Failed to load dataset: " + message;
    debugError("loadDataset:failed", err);
  }
}

/* ================= Controls ================= */

function buildControls() {
  controls.innerHTML = "";
  controls.classList.remove("hidden");
  controls.className = "bg-white rounded p-3 flex flex-col gap-2 border border-slate-200";
  if (protocolHost) {
    protocolHost.classList.add("hidden");
    protocolHost.innerHTML = "";
  }

  const btnGroup = document.createElement("div");
  btnGroup.className = "flex items-center gap-1.5 flex-wrap";

  const exportBtn = document.createElement("button");
  exportBtn.className = "btn";
  exportBtn.textContent = "Save";
  exportBtn.onclick = exportProtocol;

  const importBtn = document.createElement("button");
  importBtn.className = "btn";
  importBtn.textContent = "Load";
  importBtn.onclick = importProtocol;

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn";
  resetBtn.textContent = "Reset";
  resetBtn.onclick = resetProtocolUiOnly;

  const copyLinkBtn = document.createElement("button");
  copyLinkBtn.className = "btn";
  copyLinkBtn.textContent = "Link";
  copyLinkBtn.onclick = copyProtocolLink;

  themeToggleBtn = document.createElement("button");
  themeToggleBtn.className = "btn";
  themeToggleBtn.onclick = toggleTheme;
  applyTheme(currentTheme);

  protocolFilenameLabelEl = document.createElement("div");
  protocolFilenameLabelEl.className = "text-xs text-slate-600 break-all";
  updateProtocolFilenameLabel();
  btnGroup.appendChild(exportBtn);
  btnGroup.appendChild(importBtn);
  btnGroup.appendChild(resetBtn);
  btnGroup.appendChild(copyLinkBtn);
  btnGroup.appendChild(themeToggleBtn);
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "pt-2 flex flex-col gap-2";
  actionsDiv.appendChild(btnGroup);
  actionsDiv.appendChild(protocolFilenameLabelEl);

  const protocolDiv = document.createElement("div");
  protocolDiv.className = "pt-2 flex flex-col gap-2";
  const labelTitle = document.createElement("div");
  labelTitle.className = "text-xs text-slate-600 font-semibold";
  labelTitle.textContent = "Label";
  branchTagInput = document.createElement("input");
  branchTagInput.type = "text";
  branchTagInput.placeholder = "e.g., fs32, qc1, motionTrim";
  branchTagInput.oninput = renderMeta;
  branchTagInput.className = "p-2 border rounded bg-white w-full";
  const summaryTitle = document.createElement("div");
  summaryTitle.className = "text-xs text-slate-600 font-semibold";
  summaryTitle.textContent = "Summary";
  protocolSummaryEl = document.createElement("div");
  protocolSummaryEl.className = "text-[13px] leading-tight whitespace-pre-wrap max-h-20 overflow-y-auto text-slate-700";
  protocolSummaryEl.textContent = "No protocol summary yet.";
  protocolDiv.appendChild(labelTitle);
  protocolDiv.appendChild(branchTagInput);
  protocolDiv.appendChild(summaryTitle);
  protocolDiv.appendChild(protocolSummaryEl);

  const importDiv = document.createElement("div");
  importDiv.className = "pt-2 flex flex-col gap-2";
  const importHelp = document.createElement("div");
  importHelp.className = "text-xs text-slate-600";
  importHelp.textContent = "Load a NIRx ZIP or folder set.";
  metaDiv.className = "text-sm text-slate-600";
  input.className = "block w-full p-2 border rounded bg-white";
  importDiv.appendChild(input);
  importDiv.appendChild(importHelp);
  importDiv.appendChild(metaDiv);

  const debugDiv = document.createElement("div");
  debugDiv.className = "pt-2 flex flex-col gap-2";
  const debugHelp = document.createElement("div");
  debugHelp.className = "text-xs text-slate-600";
  debugHelp.textContent = "Verbose diagnostics and error stacks for the current load.";
  debugLogPanelEl = document.createElement("pre");
  debugLogPanelEl.className = "debug-log-panel";
  debugDiv.appendChild(debugHelp);
  debugDiv.appendChild(debugLogPanelEl);
  updateDebugLogPanel();

  const wlDiv = document.createElement("div");
  wlDiv.className = "pt-2 flex flex-col gap-2";
  const wlRow = document.createElement("div");
  wlRow.className = "wl-choice-row";

  ["wl1", "wl2"].forEach((wl) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice-btn wl-choice-btn";
    b.dataset.wlChoice = wl;
    b.textContent = wl === "wl1" ? "760" : "850";
    b.onclick = () => {
      currentWavelength = wl;
      rebuildRadioSelections();
      redraw();
      renderMeta();
    };
    wlRow.appendChild(b);
  });
  wlDiv.appendChild(wlRow);
  wavelengthModeNoteEl = document.createElement("div");
  wavelengthModeNoteEl.className = "plot-mode-note";
  wavelengthModeNoteEl.textContent = "HbO, HbR, and HbT use both wavelengths. Wavelength selection is disabled in those tabs.";
  wlDiv.appendChild(wavelengthModeNoteEl);

  const chDiv = document.createElement("div");
  chDiv.className = "pt-2 flex flex-col gap-2";

  const groups = groupChannelsBySource(channelLabels);
  groups.forEach(g => {
    const row = document.createElement("div");
    row.className = "channel-group-row";

    const src = document.createElement("div");
    src.className = "channel-source-label";
    src.textContent = g.source + ":";
    row.appendChild(src);

    const btnWrap = document.createElement("div");
    btnWrap.className = "channel-choice-row";

    g.items.forEach(item => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice-btn channel-choice-btn";
      b.dataset.chChoice = String(item.index);
      b.textContent = item.detectorLabel;
      b.title = item.fullLabel;
      b.onclick = () => {
        currentChannel = item.index;
        rebuildRadioSelections();
        redraw();
        renderMeta();
      };
      btnWrap.appendChild(b);
    });

    row.appendChild(btnWrap);
    chDiv.appendChild(row);
  });

  const pipelineDiv = document.createElement("div");
  pipelineDiv.className = "pt-2 flex flex-col gap-2";

  const domainRow = document.createElement("div");
  domainRow.className = "grid grid-cols-[auto_1fr] gap-2 items-center";
  const domainLbl = document.createElement("div");
  domainLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  domainLbl.textContent = "Signal:";
  signalDomainSelect = document.createElement("select");
  signalDomainSelect.className = "p-2 border rounded bg-white w-full text-sm";
  [{ value: "intensity", label: "Intensity (a.u.)" }, { value: "delta_od", label: "Delta OD" }].forEach(opt => {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    signalDomainSelect.appendChild(o);
  });
  signalDomainSelect.value = "intensity";
  signalDomainSelect.onchange = () => {
    updatePipelineSummary();
    redraw();
    renderMeta();
  };
  domainRow.appendChild(domainLbl);
  domainRow.appendChild(signalDomainSelect);

  const flagsRow = document.createElement("div");
  flagsRow.className = "grid grid-cols-2 gap-2";

  const filterMasterRow = document.createElement("label");
  filterMasterRow.className = "inline-flex items-center gap-2 text-sm";
  filterStepCheckbox = document.createElement("input");
  filterStepCheckbox.type = "checkbox";
  filterStepCheckbox.className = "h-4 w-4";
  filterStepCheckbox.checked = false;
  filterStepCheckbox.onchange = () => {
    filterStepEnabled = !!filterStepCheckbox.checked;
    updateFilterToggleButtons();
    updatePipelineSummary();
    redraw();
    renderMeta();
  };
  filterMasterRow.appendChild(filterStepCheckbox);
  filterMasterRow.appendChild(document.createTextNode("Enable filter"));

  const trimMasterRow = document.createElement("label");
  trimMasterRow.className = "inline-flex items-center gap-2 text-sm";
  trimStepCheckbox = document.createElement("input");
  trimStepCheckbox.type = "checkbox";
  trimStepCheckbox.className = "h-4 w-4";
  trimStepCheckbox.checked = true;
  trimStepCheckbox.onchange = () => {
    trimStepEnabled = !!trimStepCheckbox.checked;
    updatePipelineSummary();
    redraw();
    renderMeta();
  };
  trimMasterRow.appendChild(trimStepCheckbox);
  trimMasterRow.appendChild(document.createTextNode("Enable trim"));

  flagsRow.appendChild(filterMasterRow);
  flagsRow.appendChild(trimMasterRow);

  pipelineSummaryEl = document.createElement("div");
  pipelineSummaryEl.className = "text-xs text-slate-600 leading-tight";

  const physiologyRow = document.createElement("div");
  physiologyRow.className = "grid grid-cols-[auto_auto_68px_auto_68px] gap-2 items-center";
  const physiologyLbl = document.createElement("div");
  physiologyLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  physiologyLbl.textContent = "MBLL DPF:";
  dpfWl1Input = document.createElement("input");
  dpfWl1Input.type = "text";
  dpfWl1Input.inputMode = "decimal";
  dpfWl1Input.value = String(DEFAULT_DPF.wl1);
  dpfWl1Input.className = "p-2 border rounded bg-white w-full text-sm";
  dpfWl1Input.title = "Differential pathlength factor for wavelength 1.";
  dpfWl1Input.oninput = () => {
    redraw();
    renderMeta();
  };
  dpfWl2Input = document.createElement("input");
  dpfWl2Input.type = "text";
  dpfWl2Input.inputMode = "decimal";
  dpfWl2Input.value = String(DEFAULT_DPF.wl2);
  dpfWl2Input.className = "p-2 border rounded bg-white w-full text-sm";
  dpfWl2Input.title = "Differential pathlength factor for wavelength 2.";
  dpfWl2Input.oninput = () => {
    redraw();
    renderMeta();
  };
  const dpfWl1Lbl = document.createElement("div");
  dpfWl1Lbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  const dpfWl2Lbl = document.createElement("div");
  dpfWl2Lbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  dpfWl1Lbl.textContent = getWavelengthLabel(0);
  dpfWl2Lbl.textContent = getWavelengthLabel(1);
  physiologyRow.appendChild(physiologyLbl);
  physiologyRow.appendChild(dpfWl1Lbl);
  physiologyRow.appendChild(dpfWl1Input);
  physiologyRow.appendChild(dpfWl2Lbl);
  physiologyRow.appendChild(dpfWl2Input);

  const physiologyNote = document.createElement("div");
  physiologyNote.className = "text-xs text-slate-600 leading-tight";
  physiologyNote.textContent = "Derived physiology uses delta OD at both wavelengths and channel distance from the NIRx header to estimate relative HbO/HbR/HbT.";

  pipelineDiv.appendChild(domainRow);
  pipelineDiv.appendChild(flagsRow);
  pipelineDiv.appendChild(physiologyRow);
  pipelineDiv.appendChild(physiologyNote);
  pipelineDiv.appendChild(pipelineSummaryEl);

  const exDiv = document.createElement("div");
  exDiv.className = "pt-2 flex flex-col space-y-2";

  exclusionTable = document.createElement("textarea");
  exclusionTable.rows = 6;
  exclusionTable.placeholder = "23, 25\n34, 36";
  exclusionTable.oninput = () => { redraw(); renderMeta(); };
  exclusionTable.className = "p-2 border rounded bg-white w-full";
  exclusionTable.style.resize = "vertical";
  exDiv.appendChild(exclusionTable);

  const fDiv = document.createElement("div");
  fDiv.className = "pt-2 flex flex-col space-y-2";

  lowCutInput = document.createElement("input");
  lowCutInput.type = "text";
  lowCutInput.inputMode = "decimal";
  lowCutInput.placeholder = "1.0";
  lowCutInput.title = "Lower in-band edge in Hz. In [0.5 1 9 9.5] with shape [0 1 1 0], this is the second value where gain reaches the flat in-band region.";
  lowCutInput.oninput = () => { redraw(); renderMeta(); };
  lowCutInput.className = "p-2 border rounded bg-white w-full";
  lowCutInput.value = "0.1";
  const lowLbl = document.createElement("div");
  lowLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  lowLbl.textContent = "Low edge:";
  lowCutSixDbInput = document.createElement("input");
  lowCutSixDbInput.type = "text";
  lowCutSixDbInput.inputMode = "decimal";
  lowCutSixDbInput.placeholder = "0.05";
  lowCutSixDbInput.title = "Lower stop edge in Hz. In [0.5 1 9 9.5] with shape [0 1 1 0], this is the first value on the rise into the in-band region.";
  lowCutSixDbInput.oninput = () => { redraw(); renderMeta(); };
  lowCutSixDbInput.className = "p-2 border rounded bg-white w-full";
  lowCutSixDbInput.value = "0.05";
  const lowSixDbLbl = document.createElement("div");
  lowSixDbLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  lowSixDbLbl.textContent = "Stop low (-6 dB):";
  lowToggleBtn = document.createElement("button");
  lowToggleBtn.type = "button";
  lowToggleBtn.className = "filter-toggle-btn";
  lowToggleBtn.title = "Toggle the high-pass stage.";
  lowToggleBtn.onclick = () => {
    lowCutEnabled = !lowCutEnabled;
    updateFilterToggleButtons();
    redraw();
    renderMeta();
  };
  const lowRow = document.createElement("div");
  lowRow.className = "grid grid-cols-[auto_72px_auto_72px_auto] gap-2 items-center";
  lowRow.appendChild(lowSixDbLbl);
  lowRow.appendChild(lowCutSixDbInput);
  lowRow.appendChild(lowLbl);
  lowRow.appendChild(lowCutInput);
  lowRow.appendChild(lowToggleBtn);

  highCutInput = document.createElement("input");
  highCutInput.type = "text";
  highCutInput.inputMode = "decimal";
  highCutInput.placeholder = "9.0";
  highCutInput.title = "Upper in-band edge in Hz. In [0.5 1 9 9.5] with shape [0 1 1 0], this is the third value where the flat in-band region ends.";
  highCutInput.oninput = () => { redraw(); renderMeta(); };
  highCutInput.className = "p-2 border rounded bg-white w-full";
  highCutInput.value = "10.0";
  const highLbl = document.createElement("div");
  highLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  highLbl.textContent = "High edge:";
  highCutSixDbInput = document.createElement("input");
  highCutSixDbInput.type = "text";
  highCutSixDbInput.inputMode = "decimal";
  highCutSixDbInput.placeholder = "12.5";
  highCutSixDbInput.title = "Upper stop edge in Hz. In [0.5 1 9 9.5] with shape [0 1 1 0], this is the fourth value on the fall out of the in-band region.";
  highCutSixDbInput.oninput = () => { redraw(); renderMeta(); };
  highCutSixDbInput.className = "p-2 border rounded bg-white w-full";
  highCutSixDbInput.value = "12.5";
  const highSixDbLbl = document.createElement("div");
  highSixDbLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  highSixDbLbl.textContent = "Stop high (-6 dB):";
  highToggleBtn = document.createElement("button");
  highToggleBtn.type = "button";
  highToggleBtn.className = "filter-toggle-btn";
  highToggleBtn.title = "Toggle the low-pass stage.";
  highToggleBtn.onclick = () => {
    highCutEnabled = !highCutEnabled;
    updateFilterToggleButtons();
    redraw();
    renderMeta();
  };
  const highRow = document.createElement("div");
  highRow.className = "grid grid-cols-[auto_72px_auto_72px_auto] gap-2 items-center";
  highRow.appendChild(highLbl);
  highRow.appendChild(highCutInput);
  highRow.appendChild(highSixDbLbl);
  highRow.appendChild(highCutSixDbInput);
  highRow.appendChild(highToggleBtn);

  const dcRow = document.createElement("div");
  dcRow.className = "grid grid-cols-[auto_1fr] gap-2 items-center";
  const dcLbl = document.createElement("div");
  dcLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  dcLbl.textContent = "DC restore:";
  dcRestoreCheckbox = document.createElement("input");
  dcRestoreCheckbox.type = "checkbox";
  dcRestoreCheckbox.className = "h-4 w-4 justify-self-start";
  dcRestoreCheckbox.checked = true;
  dcRestoreCheckbox.onchange = () => {
    redraw();
    renderMeta();
  };
  dcRow.appendChild(dcLbl);
  dcRow.appendChild(dcRestoreCheckbox);
  dcRestoreCheckbox.title = "Restore original mean after filtering/scaling.";

  const padRow = document.createElement("div");
  padRow.className = "grid grid-cols-[auto_auto_72px] gap-2 items-center";
  const padLbl = document.createElement("div");
  padLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  padLbl.textContent = "Zero pad:";
  edgePaddingCheckbox = document.createElement("input");
  edgePaddingCheckbox.type = "checkbox";
  edgePaddingCheckbox.className = "h-4 w-4 justify-self-start";
  edgePaddingCheckbox.checked = true;
  edgePaddingCheckbox.onchange = () => {
    updateFilterToggleButtons();
    redraw();
    renderMeta();
  };
  edgePaddingCheckbox.title = "Zero-pad before filtering. Uses at least 10 seconds on each side, adjusted by sampling rate.";
  edgePaddingSecondsInput = document.createElement("input");
  edgePaddingSecondsInput.type = "text";
  edgePaddingSecondsInput.inputMode = "decimal";
  edgePaddingSecondsInput.placeholder = String(MIN_EDGE_PADDING_SECONDS);
  edgePaddingSecondsInput.value = String(MIN_EDGE_PADDING_SECONDS);
  edgePaddingSecondsInput.className = "p-2 border rounded bg-white w-full";
  edgePaddingSecondsInput.title = "Zero-padding duration in seconds on each side. Values below 10 seconds are raised to 10.";
  edgePaddingSecondsInput.oninput = () => {
    redraw();
    renderMeta();
  };
  padRow.appendChild(padLbl);
  padRow.appendChild(edgePaddingCheckbox);
  padRow.appendChild(edgePaddingSecondsInput);

  const durationNote = document.createElement("div");
  durationNote.className = "text-xs text-slate-600 leading-tight";
  durationNote.textContent = "Rule of thumb: 0.1 Hz needs about 10 s per cycle, 0.01 Hz about 100 s. One cycle is the minimum; several cycles are preferred.";

  const viewCard = document.createElement("div");
  viewCard.className = "rounded border border-slate-200 p-3 flex flex-col space-y-2";
  const layoutNote = document.createElement("div");
  layoutNote.className = "text-xs text-slate-600 leading-tight";
  layoutNote.textContent = "Layout: single plot with tabs. Raw, Trimmed, Filtered, HbO, HbR, and HbT share the current time window.";
  viewCard.appendChild(layoutNote);

  const windowRow = document.createElement("div");
  windowRow.className = "grid grid-cols-[auto_88px] gap-2 items-center";
  const windowLbl = document.createElement("div");
  windowLbl.className = "text-xs text-slate-600 font-semibold whitespace-nowrap";
  windowLbl.textContent = "Data window (s):";
  viewWindowSecondsInput = document.createElement("input");
  viewWindowSecondsInput.type = "text";
  viewWindowSecondsInput.inputMode = "decimal";
  viewWindowSecondsInput.value = "60";
  viewWindowSecondsInput.className = "p-2 border rounded bg-white w-full text-sm";
  viewWindowSecondsInput.title = "Visible time span in seconds. Larger than the record duration shows the full trace.";
  viewWindowSecondsInput.oninput = () => {
    updateViewNavigationUi(currentPlotDurationSeconds || getReferenceDurationSeconds());
    redraw();
  };
  windowRow.appendChild(windowLbl);
  windowRow.appendChild(viewWindowSecondsInput);
  viewCard.appendChild(windowRow);

  fDiv.appendChild(lowRow);
  fDiv.appendChild(highRow);
  fDiv.appendChild(dcRow);
  fDiv.appendChild(padRow);
  fDiv.appendChild(durationNote);
  const notesDiv = document.createElement("div");
  notesDiv.className = "pt-2 flex flex-col space-y-2";
  notesInput = document.createElement("textarea");
  notesInput.rows = 1;
  notesInput.placeholder = "Notes about processing choices, rationale, caveats...";
  notesInput.oninput = renderMeta;
  notesInput.style.maxHeight = "56px";
  notesInput.style.overflowY = "auto";
  notesInput.style.resize = "vertical";
  notesInput.className = "p-2 border rounded bg-white w-full text-sm";
  notesDiv.appendChild(notesInput);

  const accordionStack = document.createElement("div");
  accordionStack.className = "flex flex-col gap-2";
  accordionStack.appendChild(createAccordionSection("Import", importDiv, true));
  accordionStack.appendChild(createAccordionSection("Debug Log", debugDiv, true));
  accordionStack.appendChild(createAccordionSection("Actions", actionsDiv, false));
  accordionStack.appendChild(createAccordionSection("Protocol", protocolDiv, false));
  accordionStack.appendChild(createAccordionSection("Plot View", viewCard, false));
  if (data.wl1) {
    recordingSummaryContentEl = document.createElement("div");
    recordingSummaryContentEl.className = "pt-2";
    fileSourcesContentEl = document.createElement("div");
    fileSourcesContentEl.className = "pt-2";
    eventsContentEl = document.createElement("div");
    eventsContentEl.className = "pt-2";
    accordionStack.appendChild(createAccordionSection("Recording Summary", recordingSummaryContentEl, true));
    accordionStack.appendChild(createAccordionSection("File Sources", fileSourcesContentEl, false));
    accordionStack.appendChild(createAccordionSection("Events", eventsContentEl, false));
    accordionStack.appendChild(createAccordionSection("Wavelength", wlDiv, true));
    accordionStack.appendChild(createAccordionSection("Channel", chDiv, true));
    accordionStack.appendChild(createAccordionSection("Pipeline", pipelineDiv, false));
    accordionStack.appendChild(createAccordionSection("Filter", fDiv, true));
    accordionStack.appendChild(createAccordionSection("Cut Intervals", exDiv, false));
    accordionStack.appendChild(createAccordionSection("Notes", notesDiv, false));
  }
  controls.appendChild(accordionStack);
  rebuildRadioSelections();
  updateFilterToggleButtons();
  updatePipelineSummary();
  updateViewNavigationUi(getReferenceDurationSeconds());
}

function createAccordionSection(title, contentEl, openByDefault) {
  const detail = document.createElement("details");
  detail.className = "rounded border border-slate-200 p-2";
  detail.open = !!openByDefault;
  const summary = document.createElement("summary");
  summary.className = "font-semibold cursor-pointer select-none";
  summary.textContent = title;
  detail.appendChild(summary);
  detail.appendChild(contentEl);
  return detail;
}

function updateProtocolFilenameLabel() {
  if (!protocolFilenameLabelEl) return;
  if (!lastProtocolFilename) {
    protocolFilenameLabelEl.textContent = "";
    return;
  }
  protocolFilenameLabelEl.textContent = "file: " + lastProtocolFilename;
}

function updateProtocolSummaryLabel(text) {
  if (!protocolSummaryEl) return;
  protocolSummaryEl.textContent = text || "No protocol summary yet.";
}

function updateFilterToggleButtons() {
  const filterMasterEnabled = !!filterStepEnabled;
  const lowStageEnabled = filterMasterEnabled && !!lowCutEnabled;
  const highStageEnabled = filterMasterEnabled && !!highCutEnabled;
  const anyFilterStageEnabled = lowStageEnabled || highStageEnabled;

  if (lowToggleBtn) {
    lowToggleBtn.textContent = lowCutEnabled ? "✅" : "❌";
    lowToggleBtn.classList.toggle("active", lowCutEnabled);
    lowToggleBtn.classList.toggle("inactive", !lowCutEnabled);
    lowToggleBtn.disabled = !filterMasterEnabled;
  }
  if (highToggleBtn) {
    highToggleBtn.textContent = highCutEnabled ? "✅" : "❌";
    highToggleBtn.classList.toggle("active", highCutEnabled);
    highToggleBtn.classList.toggle("inactive", !highCutEnabled);
    highToggleBtn.disabled = !filterMasterEnabled;
  }
  if (lowCutInput) lowCutInput.disabled = !lowStageEnabled;
  if (lowCutSixDbInput) lowCutSixDbInput.disabled = !lowStageEnabled;
  if (highCutInput) highCutInput.disabled = !highStageEnabled;
  if (highCutSixDbInput) highCutSixDbInput.disabled = !highStageEnabled;
  if (dcRestoreCheckbox) dcRestoreCheckbox.disabled = !anyFilterStageEnabled;
  if (filterEngineSelect) filterEngineSelect.disabled = !anyFilterStageEnabled;
  if (edgePaddingCheckbox) edgePaddingCheckbox.disabled = !anyFilterStageEnabled;
  if (edgePaddingSecondsInput) edgePaddingSecondsInput.disabled = !anyFilterStageEnabled || !edgePaddingCheckbox || !edgePaddingCheckbox.checked;
}

function getSignalDomain() {
  if (!signalDomainSelect) return "intensity";
  return signalDomainSelect.value === "delta_od" ? "delta_od" : "intensity";
}

function updatePipelineSummary() {
  if (!pipelineSummaryEl) return;
  const filterLabel = filterStepEnabled ? "Filter on" : "Filter off";
  const trimLabel = trimStepEnabled ? "Trim on" : "Trim off";
  pipelineSummaryEl.textContent = "Intensity -> Delta OD -> " + filterLabel + " -> " + trimLabel + " -> MBLL Hb";
}

function intensityToDeltaOd(series) {
  if (!Array.isArray(series) || !series.length) return [];
  // Method matches Homer3/NIRS-KIT intensity->OD: dOD = -log(|I| / mean(|I|)).
  const safe = series.map(v => Math.abs(Number(v)));
  const meanAbs = safe.reduce((sum, v) => sum + v, 0) / safe.length;
  if (!Number.isFinite(meanAbs) || meanAbs <= 0) return series.slice();
  return safe.map(v => {
    const denom = v <= 0 ? Number.EPSILON : v;
    return -Math.log(denom / meanAbs);
  });
}

function getWavelengthNm(index) {
  return Array.isArray(wavelengthsNm) && Number.isFinite(wavelengthsNm[index]) ? Number(wavelengthsNm[index]) : (index === 0 ? 760 : 850);
}

function getWavelengthLabel(index) {
  return getWavelengthNm(index) + " nm";
}

function getCurrentChannelDistanceMm() {
  const value = Array.isArray(channelDistancesMm) ? channelDistancesMm[currentChannel] : null;
  if (Number.isFinite(value) && value > 0) {
    return {
      distanceMm: Number(value),
      source: "HDR"
    };
  }
  return {
    distanceMm: DEFAULT_CHANNEL_DISTANCE_MM,
    source: "default"
  };
}

function getCurrentMbllConfig() {
  const wl1Nm = getWavelengthNm(0);
  const wl2Nm = getWavelengthNm(1);
  const coeff1 = MBLL_EXTINCTION_BY_WAVELENGTH[wl1Nm];
  const coeff2 = MBLL_EXTINCTION_BY_WAVELENGTH[wl2Nm];
  const dpf1 = numberOrNull(dpfWl1Input ? dpfWl1Input.value : DEFAULT_DPF.wl1);
  const dpf2 = numberOrNull(dpfWl2Input ? dpfWl2Input.value : DEFAULT_DPF.wl2);
  const channelDistance = getCurrentChannelDistanceMm();

  if (!coeff1 || !coeff2) {
    return {
      supported: false,
      reason: "MBLL is currently configured only for 760/850 nm datasets.",
      wl1Nm,
      wl2Nm,
      dpf1,
      dpf2,
      distanceMm: channelDistance.distanceMm,
      distanceSource: channelDistance.source
    };
  }

  if (!Number.isFinite(dpf1) || dpf1 <= 0 || !Number.isFinite(dpf2) || dpf2 <= 0) {
    return {
      supported: false,
      reason: "DPF values must be positive numbers.",
      wl1Nm,
      wl2Nm,
      dpf1,
      dpf2,
      distanceMm: channelDistance.distanceMm,
      distanceSource: channelDistance.source
    };
  }

  return {
    supported: true,
    wl1Nm,
    wl2Nm,
    dpf1,
    dpf2,
    distanceMm: channelDistance.distanceMm,
    distanceSource: channelDistance.source,
    coeff1,
    coeff2
  };
}

function deltaOdToHemoglobin(deltaOdWl1, deltaOdWl2, config) {
  if (!config || !config.supported) return null;
  const length = Math.min(
    Array.isArray(deltaOdWl1) ? deltaOdWl1.length : 0,
    Array.isArray(deltaOdWl2) ? deltaOdWl2.length : 0
  );
  if (!length) return { hbo: [], hbr: [], hbt: [] };

  const rhoCm = config.distanceMm / 10.0;
  const a11 = config.coeff1.hbo * rhoCm * config.dpf1;
  const a12 = config.coeff1.hbr * rhoCm * config.dpf1;
  const a21 = config.coeff2.hbo * rhoCm * config.dpf2;
  const a22 = config.coeff2.hbr * rhoCm * config.dpf2;
  const det = a11 * a22 - a12 * a21;

  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

  const hbo = new Array(length);
  const hbr = new Array(length);
  const hbt = new Array(length);
  for (let i = 0; i < length; i++) {
    const d1 = Number(deltaOdWl1[i]) || 0;
    const d2 = Number(deltaOdWl2[i]) || 0;
    const hbOMm = (d1 * a22 - a12 * d2) / det;
    const hbRMm = (a11 * d2 - d1 * a21) / det;
    hbo[i] = hbOMm * 1000.0;
    hbr[i] = hbRMm * 1000.0;
    hbt[i] = hbo[i] + hbr[i];
  }
  return { hbo, hbr, hbt };
}

function resetProtocolUiOnly() {
  if (!data.wl1) return;

  currentWavelength = "wl1";
  currentChannel = 0;

  if (branchTagInput) branchTagInput.value = "";
  if (notesInput) notesInput.value = "";

  if (exclusionTable) exclusionTable.value = "";

  lowCutEnabled = true;
  highCutEnabled = true;
  updateFilterToggleButtons();
  if (lowCutInput) lowCutInput.value = "0.1";
  if (lowCutSixDbInput) lowCutSixDbInput.value = "0.05";
  if (highCutInput) highCutInput.value = "10.0";
  if (highCutSixDbInput) highCutSixDbInput.value = "12.5";
  if (filterEngineSelect) filterEngineSelect.value = "rjg_sos";
  if (dcRestoreCheckbox) dcRestoreCheckbox.checked = true;
  if (edgePaddingCheckbox) edgePaddingCheckbox.checked = true;
  if (edgePaddingSecondsInput) edgePaddingSecondsInput.value = String(MIN_EDGE_PADDING_SECONDS);
  if (signalDomainSelect) signalDomainSelect.value = "intensity";
  if (dpfWl1Input) dpfWl1Input.value = String(DEFAULT_DPF.wl1);
  if (dpfWl2Input) dpfWl2Input.value = String(DEFAULT_DPF.wl2);
  filterStepEnabled = false;
  trimStepEnabled = true;
  amplitudePreservationMode = "none";
  if (filterStepCheckbox) filterStepCheckbox.checked = filterStepEnabled;
  if (trimStepCheckbox) trimStepCheckbox.checked = trimStepEnabled;
  if (plotModeSelect) plotModeSelect.value = currentPlotMode;

  lastProtocolFilename = "";
  updateProtocolFilenameLabel();
  updatePipelineSummary();

  rebuildRadioSelections();
  renderMeta();
  redraw();
}

/* ================= Plotting ================= */

function redraw() {
  if (!data.wl1) return;
  const redrawStartMs = performance.now();
  debugLog("redraw:start", {
    currentWavelength,
    currentChannel,
    plotMode: currentPlotMode,
    samples: data.wl1.length,
    channels: data.wl1[0] ? data.wl1[0].length : 0
  });

  if (currentWavelength !== "wl1" && currentWavelength !== "wl2") currentWavelength = "wl1";
  const maxChannelIndex = Math.max(0, inferMatrixChannelCount(data[currentWavelength]) - 1);
  if (!Number.isFinite(currentChannel) || currentChannel < 0) currentChannel = 0;
  if (currentChannel > maxChannelIndex) currentChannel = maxChannelIndex;

  const rawIntensity = data[currentWavelength].map(r => r[currentChannel]);
  const signalDomain = getSignalDomain();
  const raw = signalDomain === "delta_od" ? intensityToDeltaOd(rawIntensity) : rawIntensity.slice();
  const requestedSpec = getRequestedFilterSpec();
  const validated = validateFilterSpec(samplingRate, requestedSpec);
  const activeFilterSpec = filterStepEnabled && validated.enabled ? validated : null;
  const filterEngine = getFilterEngine();
  const dcRestore = isDcRestoreEnabled();
  const filterLabel = activeFilterSpec
    ? describeFilterSpec(activeFilterSpec)
    : (filterStepEnabled ? "no filter" : "disabled");

  const intervals = parseIntervals(exclusionTable.value);
  const rawEvents = events.map(e => ({ time: e.sample / samplingRate, code: e.code, label: eventDisplayLabel(e) }));
  const requestedStartSeconds = getRequestedWindowStartSecondsInput();
  const rawDisplay = getDisplayWindow(raw, rawEvents, intervals, samplingRate, activeFilterSpec);
  const rawRequestedWindow = getRequestedPlotWindowSeconds(rawDisplay.series.length / samplingRate);
  const rawWindowed = sliceDisplayByTimeWindow(rawDisplay, samplingRate, requestedStartSeconds, rawRequestedWindow);

  const wlLabel = currentWavelength === "wl1" ? getWavelengthLabel(0) : getWavelengthLabel(1);
  const chLabel = channelLabels[currentChannel] || ("ch" + String(currentChannel + 1));
  const domainLabel = signalDomain === "delta_od" ? "Delta OD" : "Intensity";

  const stageSummaryVisible = !!(stageSummaryHost && stageSummaryHost.style.display !== "none");
  const needsTrimmedCurrent = currentPlotMode === "trimmed";
  const needsFilteredCurrent = currentPlotMode === "filtered" || stageSummaryVisible;
  const needsHemoglobin = isHemoglobinPlotMode(currentPlotMode) || stageSummaryVisible;
  let trimmedEvents = null;
  let trimmedDisplay = null;
  let trimmedWindowed = null;
  let filteredDisplay = null;
  let filteredWindowed = null;
  let hbWindowed = null;
  let stageSummaryModel = null;
  let activePlotHeader = "";
  let activePlotModel = null;

  if (needsTrimmedCurrent || needsFilteredCurrent || needsHemoglobin) {
    trimmedEvents = trimStepEnabled
      ? adjustEvents(events, intervals)
      : rawEvents.map(e => ({ time: e.time, code: e.code, label: e.label }));
  }

  if (currentPlotMode === "raw") {
    const rawRangeLabel = formatWindowRangeLabel(rawWindowed.startSeconds, rawWindowed.series.length / samplingRate);
    activePlotHeader = wlLabel + " " + chLabel + " Input (" + domainLabel + ", " + rawRangeLabel + ") | " + formatStats(computeStats(rawWindowed.series));
    activePlotModel = buildPlotRenderModel(rawWindowed, rawDisplay, {
      yLabel: signalDomain === "delta_od" ? "Delta OD" : "Intensity (a.u.)",
      stroke: "#0f172a"
    });
  }

  if (needsTrimmedCurrent) {
    const trimmed = trimStepEnabled ? applyExclusions(raw, intervals) : raw.slice();
    trimmedDisplay = getDisplayWindow(trimmed, trimmedEvents, null, samplingRate, null);
    trimmedWindowed = sliceDisplayByTimeWindow(
      trimmedDisplay,
      samplingRate,
      requestedStartSeconds,
      getRequestedPlotWindowSeconds(trimmedDisplay.series.length / samplingRate)
    );

    if (currentPlotMode === "trimmed") {
      const trimmedRangeLabel = formatWindowRangeLabel(trimmedWindowed.startSeconds, trimmedWindowed.series.length / samplingRate);
      activePlotHeader = wlLabel + " " + chLabel + " Trimmed (" + (trimStepEnabled ? "trim on" : "trim off") + ", " + trimmedRangeLabel + ") | " + formatStats(computeStats(trimmedWindowed.series));
      activePlotModel = buildPlotRenderModel(trimmedWindowed, trimmedDisplay, {
        yLabel: signalDomain === "delta_od" ? "Delta OD" : "Intensity (a.u.)",
        stroke: "#475569"
      });
    }
  }

  if (needsFilteredCurrent) {
    const filtered = applyConfiguredFilter(raw, activeFilterSpec, filterEngine, dcRestore);
    const filteredThenTrimmed = trimStepEnabled ? applyExclusions(filtered, intervals) : filtered.slice();
    filteredDisplay = getDisplayWindow(filteredThenTrimmed, trimmedEvents, null, samplingRate, activeFilterSpec);
    filteredWindowed = sliceDisplayByTimeWindow(
      filteredDisplay,
      samplingRate,
      requestedStartSeconds,
      getRequestedPlotWindowSeconds(filteredDisplay.series.length / samplingRate)
    );

    if (currentPlotMode === "filtered") {
      const filteredRangeLabel = formatWindowRangeLabel(filteredWindowed.startSeconds, filteredWindowed.series.length / samplingRate);
      activePlotHeader = wlLabel + " " + chLabel + " Filtered (" + filterLabel + (trimStepEnabled ? ", trim on" : ", trim off") + ", " + filteredRangeLabel + ") | " + formatStats(computeStats(filteredWindowed.series));
      activePlotModel = buildPlotRenderModel(filteredWindowed, filteredDisplay, {
        yLabel: signalDomain === "delta_od" ? "Delta OD" : "Intensity (a.u.)",
        stroke: "#0f766e"
      });
    }
  }

  if (needsHemoglobin) {
    const rawIntensityWl1 = data.wl1.map(r => r[currentChannel]);
    const rawIntensityWl2 = data.wl2.map(r => r[currentChannel]);
    const deltaOdWl1 = intensityToDeltaOd(rawIntensityWl1);
    const deltaOdWl2 = intensityToDeltaOd(rawIntensityWl2);
    const filteredOdWl1 = applyConfiguredFilter(deltaOdWl1, activeFilterSpec, filterEngine, dcRestore);
    const filteredOdWl2 = applyConfiguredFilter(deltaOdWl2, activeFilterSpec, filterEngine, dcRestore);
    const processedOdWl1 = trimStepEnabled ? applyExclusions(filteredOdWl1, intervals) : filteredOdWl1.slice();
    const processedOdWl2 = trimStepEnabled ? applyExclusions(filteredOdWl2, intervals) : filteredOdWl2.slice();
    const mbllConfig = getCurrentMbllConfig();
    const hbSeries = deltaOdToHemoglobin(processedOdWl1, processedOdWl2, mbllConfig);

    if (hbSeries) {
      hbWindowed = {};
      if (currentPlotMode === "hbo" || stageSummaryVisible) {
        const hbDisplayHbo = getDisplayWindow(hbSeries.hbo, trimmedEvents, null, samplingRate, activeFilterSpec);
        hbWindowed.hbo = sliceDisplayByTimeWindow(
          hbDisplayHbo,
          samplingRate,
          requestedStartSeconds,
          getRequestedPlotWindowSeconds(hbDisplayHbo.series.length / samplingRate)
        );
      }
      if (currentPlotMode === "hbr" || stageSummaryVisible) {
        const hbDisplayHbr = getDisplayWindow(hbSeries.hbr, trimmedEvents, null, samplingRate, activeFilterSpec);
        hbWindowed.hbr = sliceDisplayByTimeWindow(
          hbDisplayHbr,
          samplingRate,
          requestedStartSeconds,
          getRequestedPlotWindowSeconds(hbDisplayHbr.series.length / samplingRate)
        );
      }
      if (currentPlotMode === "hbt" || stageSummaryVisible) {
        const hbDisplayHbt = getDisplayWindow(hbSeries.hbt, trimmedEvents, null, samplingRate, activeFilterSpec);
        hbWindowed.hbt = sliceDisplayByTimeWindow(
          hbDisplayHbt,
          samplingRate,
          requestedStartSeconds,
          getRequestedPlotWindowSeconds(hbDisplayHbt.series.length / samplingRate)
        );
      }
    }

    if (currentPlotMode === "hbo") {
      if (hbWindowed && hbWindowed.hbo && hbWindowed.hbo.series.length) {
        const hboRangeLabel = formatWindowRangeLabel(hbWindowed.hbo.startSeconds, hbWindowed.hbo.series.length / samplingRate);
        activePlotHeader = chLabel + " HbO (MBLL, " + hboRangeLabel + ") | " + formatStats(computeStats(hbWindowed.hbo.series));
        activePlotModel = buildPlotRenderModel(hbWindowed.hbo, {
          series: hbSeries.hbo
        }, {
          yLabel: "Delta HbO (uM)",
          stroke: "#dc2626"
        });
      } else {
        activePlotHeader = chLabel + " HbO (MBLL unavailable)";
      }
    }

    if (currentPlotMode === "hbr") {
      if (hbWindowed && hbWindowed.hbr && hbWindowed.hbr.series.length) {
        const hbrRangeLabel = formatWindowRangeLabel(hbWindowed.hbr.startSeconds, hbWindowed.hbr.series.length / samplingRate);
        activePlotHeader = chLabel + " HbR (MBLL, " + hbrRangeLabel + ") | " + formatStats(computeStats(hbWindowed.hbr.series));
        activePlotModel = buildPlotRenderModel(hbWindowed.hbr, {
          series: hbSeries.hbr
        }, {
          yLabel: "Delta HbR (uM)",
          stroke: "#2563eb"
        });
      } else {
        activePlotHeader = chLabel + " HbR (MBLL unavailable)";
      }
    }

    if (currentPlotMode === "hbt") {
      if (hbWindowed && hbWindowed.hbt && hbWindowed.hbt.series.length) {
        const hbtRangeLabel = formatWindowRangeLabel(hbWindowed.hbt.startSeconds, hbWindowed.hbt.series.length / samplingRate);
        activePlotHeader = chLabel + " HbT (MBLL, " + hbtRangeLabel + ") | " + formatStats(computeStats(hbWindowed.hbt.series));
        activePlotModel = buildPlotRenderModel(hbWindowed.hbt, {
          series: hbSeries.hbt
        }, {
          yLabel: "Delta HbT (uM)",
          stroke: "#047857"
        });
      } else {
        activePlotHeader = chLabel + " HbT (MBLL unavailable)";
      }
    }

    if (stageSummaryVisible) {
      const intensityDisplayWl1 = getDisplayWindow(rawIntensityWl1, rawEvents, intervals, samplingRate, activeFilterSpec);
      const intensityDisplayWl2 = getDisplayWindow(rawIntensityWl2, rawEvents, intervals, samplingRate, activeFilterSpec);
      const deltaOdDisplayWl1 = getDisplayWindow(deltaOdWl1, rawEvents, intervals, samplingRate, activeFilterSpec);
      const deltaOdDisplayWl2 = getDisplayWindow(deltaOdWl2, rawEvents, intervals, samplingRate, activeFilterSpec);
      const processedOdDisplayWl1 = getDisplayWindow(processedOdWl1, trimmedEvents, null, samplingRate, activeFilterSpec);
      const processedOdDisplayWl2 = getDisplayWindow(processedOdWl2, trimmedEvents, null, samplingRate, activeFilterSpec);

      stageSummaryModel = {
        filterLabel,
        trimEnabled: trimStepEnabled,
        intensityWindowedWl1: sliceDisplayByTimeWindow(intensityDisplayWl1, samplingRate, requestedStartSeconds, rawRequestedWindow),
        intensityWindowedWl2: sliceDisplayByTimeWindow(intensityDisplayWl2, samplingRate, requestedStartSeconds, rawRequestedWindow),
        deltaOdWindowedWl1: sliceDisplayByTimeWindow(deltaOdDisplayWl1, samplingRate, requestedStartSeconds, rawRequestedWindow),
        deltaOdWindowedWl2: sliceDisplayByTimeWindow(deltaOdDisplayWl2, samplingRate, requestedStartSeconds, rawRequestedWindow),
        processedOdWindowedWl1: sliceDisplayByTimeWindow(processedOdDisplayWl1, samplingRate, requestedStartSeconds, rawRequestedWindow),
        processedOdWindowedWl2: sliceDisplayByTimeWindow(processedOdDisplayWl2, samplingRate, requestedStartSeconds, rawRequestedWindow),
        hbWindowed,
        mbllConfig
      };
    }
  }

  currentPlotDurationSeconds = activePlotModel
    ? Math.max(0, activePlotModel.domainMax - activePlotModel.domainMin)
    : (rawDisplay.series.length / samplingRate);
  updateViewNavigationUi(currentPlotDurationSeconds);
  if (plotHeaderEl) plotHeaderEl.textContent = activePlotHeader || "No plot data";
  if (plotController) {
    if (activePlotModel) plotController.setModel(activePlotModel);
    else plotController.clear();
  }

  renderStageSummary(stageSummaryVisible ? stageSummaryModel : null);
  debugLog("redraw:end", {
    elapsedMs: Number((performance.now() - redrawStartMs).toFixed(1)),
    rawSamples: rawWindowed.series.length,
    processedSamples: filteredWindowed ? filteredWindowed.series.length : 0,
    plotMode: currentPlotMode,
    hbAvailable: !!(hbWindowed && (
      (hbWindowed.hbo && hbWindowed.hbo.series.length) ||
      (hbWindowed.hbr && hbWindowed.hbr.series.length) ||
      (hbWindowed.hbt && hbWindowed.hbt.series.length)
    ))
  });
}

/* ================= Meta and protocol summary ================= */

function renderMeta() {
  if (!data.wl1 || !samplingRate) return;
  if (!recordingSummaryContentEl || !fileSourcesContentEl || !eventsContentEl) return;
  debugLog("renderMeta:start", {
    samples: data.wl1.length,
    channels: data.wl1[0] ? data.wl1[0].length : 0,
    eventCount: events.length
  });

  const summary = buildProtocolSummary(buildProtocolObject());
  updateProtocolSummaryLabel(summary);
  metaDiv.textContent = "";

  const bHdr = basename(sources.hdr) || "missing";
  const bWl1 = basename(sources.wl1) || "missing";
  const bWl2 = basename(sources.wl2) || "missing";
  const bEvt = basename(sources.evt) || "none";
  const bProbe = basename(sources.probeMat) || "none";

  const validated = validateFilterSpec(samplingRate, getRequestedFilterSpec());
  const mbllConfig = getCurrentMbllConfig();

  let filterText = filterStepEnabled ? "no filter" : "disabled";
  if (validated.enabled) filterText = describeFilterSpec(validated);
  const dcRestore = isDcRestoreEnabled();
  const filterWarning = validated.warning ? escapeHtml(validated.warning) : "";
  const durationGuide = escapeHtml(buildDurationGuidance(validated, data.wl1.length / samplingRate));
  const wavelengthsText = escapeHtml(getWavelengthLabel(0) + ", " + getWavelengthLabel(1));
  const distanceText = escapeHtml(formatMetricNumber(mbllConfig.distanceMm) + " mm (" + mbllConfig.distanceSource + ")");
  const dpfText = escapeHtml(formatMetricNumber(mbllConfig.dpf1) + ", " + formatMetricNumber(mbllConfig.dpf2));
  const physiologyText = escapeHtml(mbllConfig.supported ? "relative HbO/HbR/HbT via MBLL" : mbllConfig.reason);

  const labelText = (branchTagInput ? branchTagInput.value.trim() : "") || "none";
  let eventRows = "";
  if (!events.length) {
    eventRows = "<tr><td class='border px-2 py-2 text-slate-600' colspan='2'>No events found</td></tr>";
  } else {
    events.forEach(e => {
      eventRows += "<tr>"
        + "<td class='border px-2 py-1' style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + (e.sample / samplingRate).toFixed(2) + "</td>"
        + "<td class='border px-2 py-1' style='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + escapeHtml(eventDisplayLabel(e)) + "</td>"
        + "</tr>";
    });
  }

  recordingSummaryContentEl.innerHTML = ""
    + "<div class='grid grid-cols-2 gap-x-3 gap-y-1 text-sm'>"
    + "  <div class='text-slate-600'>Dataset</div><div class='break-all'>" + escapeHtml(datasetLabel) + "</div>"
    + "  <div class='text-slate-600'>Input type</div><div>" + escapeHtml(inputTypeLabel) + "</div>"
    + "  <div class='text-slate-600'>Sampling rate</div><div>" + samplingRate + " Hz</div>"
    + "  <div class='text-slate-600'>Samples</div><div>" + data.wl1.length + "</div>"
    + "  <div class='text-slate-600'>Duration</div><div>" + (data.wl1.length / samplingRate).toFixed(2) + " s</div>"
    + "  <div class='text-slate-600'>Channels</div><div>" + data.wl1[0].length + "</div>"
    + "  <div class='text-slate-600'>Signal domain</div><div>" + (getSignalDomain() === "delta_od" ? "Delta OD" : "Intensity (a.u.)") + "</div>"
    + "  <div class='text-slate-600'>Wavelengths</div><div>" + wavelengthsText + "</div>"
    + "  <div class='text-slate-600'>Channel distance</div><div>" + distanceText + "</div>"
    + "  <div class='text-slate-600'>Filter</div><div>" + escapeHtml(filterText) + "</div>"
    + "  <div class='text-slate-600'>Filter step</div><div>" + (filterStepEnabled ? "on" : "off") + "</div>"
    + "  <div class='text-slate-600'>DC restore</div><div>" + (dcRestore ? "on" : "off") + "</div>"
    + "  <div class='text-slate-600'>Trim step</div><div>" + (trimStepEnabled ? "on" : "off") + "</div>"
    + "  <div class='text-slate-600'>MBLL DPF</div><div>" + dpfText + "</div>"
    + "  <div class='text-slate-600'>Physiology</div><div>" + physiologyText + "</div>"
    + "  <div class='text-slate-600'>Filter note</div><div>" + (filterWarning || "none") + "</div>"
    + "  <div class='text-slate-600'>Duration guide</div><div>" + durationGuide + "</div>"
    + "  <div class='text-slate-600'>Protocol label</div><div>" + escapeHtml(labelText) + "</div>"
    + "  <div class='text-slate-600'>App version</div><div>" + APP_VERSION + "</div>"
    + "  <div class='text-slate-600'>Protocol schema</div><div>" + PROTOCOL_SCHEMA_VERSION + "</div>"
    + "</div>";

  fileSourcesContentEl.innerHTML = ""
    + "<div class='grid grid-cols-2 gap-x-3 gap-y-1 text-sm'>"
    + "  <div class='text-slate-600'>HDR</div><div>" + escapeHtml(bHdr) + "</div>"
    + "  <div class='text-slate-600'>WL1</div><div>" + escapeHtml(bWl1) + "</div>"
    + "  <div class='text-slate-600'>WL2</div><div>" + escapeHtml(bWl2) + "</div>"
    + "  <div class='text-slate-600'>EVT</div><div>" + escapeHtml(bEvt) + "</div>"
    + "  <div class='text-slate-600'>probeInfo</div><div>" + escapeHtml(bProbe) + "</div>"
    + "  <div class='text-slate-600'>Sampling rate from</div><div>" + escapeHtml(basename(sources.samplingRateFrom) || "?") + "</div>"
    + "  <div class='text-slate-600'>Events from</div><div>" + escapeHtml(basename(sources.eventsFrom) || "?") + "</div>"
    + "  <div class='text-slate-600'>Channel labels from</div><div>" + escapeHtml(basename(sources.channelLabelsFrom) || "?") + "</div>"
    + "</div>";

  eventsContentEl.innerHTML = ""
    + "<table class='w-full text-sm border-collapse' style='table-layout: fixed;'>"
    + "  <thead>"
    + "    <tr class='bg-slate-50'>"
    + "      <th class='border px-2 py-1 text-left' style='width: 80px;'>Time (s)</th>"
    + "      <th class='border px-2 py-1 text-left' style='width: 60px;'>Code</th>"
    + "    </tr>"
    + "  </thead>"
    + "  <tbody>"
    + eventRows
    + "  </tbody>"
    + "</table>";
  debugLog("renderMeta:end", {
    datasetLabel,
    channelLabelSource,
    eventsRendered: events.length
  });
}

/* ================= Protocol object, export, import ================= */

function getProtocolSummaryDeps() {
  return {
    currentWavelength,
    currentChannel,
    channelLabels,
    numberOrNull,
    formatHz
  };
}

function getProtocolNormalizationDeps() {
  return {
    protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    datasetLabel,
    minEdgePaddingSeconds: MIN_EDGE_PADDING_SECONDS,
    defaultPassbandRippleDb: DEFAULT_PASSBAND_RIPPLE_DB,
    defaultStopbandAttenuationDb: DEFAULT_STOPBAND_ATTENUATION_DB,
    defaultDpf: DEFAULT_DPF,
    defaultChannelDistanceMm: DEFAULT_CHANNEL_DISTANCE_MM,
    numberOrNull,
    deriveDefaultHighpassSixDbHz,
    deriveDefaultLowpassSixDbHz,
    normalizePlotMode
  };
}

function getProtocolBuildDeps() {
  return {
    protocolSchemaVersion: PROTOCOL_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    datasetLabel,
    protocolLabel: branchTagInput ? branchTagInput.value.trim() : "",
    currentWavelength,
    currentChannel,
    intervals: parseIntervals(exclusionTable ? exclusionTable.value : ""),
    validatedFilter: validateFilterSpec(samplingRate, getRequestedFilterSpec()),
    filterStepEnabled,
    trimStepEnabled,
    notes: notesInput ? notesInput.value : "",
    sources,
    signalDomain: getSignalDomain(),
    filterEngine: getFilterEngine(),
    dcRestore: isDcRestoreEnabled(),
    currentPlotMode,
    amplitudePreservationMode,
    mbllConfig: getCurrentMbllConfig(),
    defaultPassbandRippleDb: DEFAULT_PASSBAND_RIPPLE_DB,
    defaultStopbandAttenuationDb: DEFAULT_STOPBAND_ATTENUATION_DB,
    ...getProtocolSummaryDeps()
  };
}

function getProtocolProjectionDeps() {
  return {
    ...getProtocolNormalizationDeps(),
    currentPlotMode,
    maxChannelCount: data.wl1 && data.wl1[0] ? data.wl1[0].length : 0
  };
}

function buildProtocolObject() {
  return protocolApi.buildProtocolObject(getProtocolBuildDeps());
}

function buildProtocolSummary(protocol) {
  return protocolApi.buildProtocolSummary(protocol, getProtocolSummaryDeps());
}

function exportProtocol() {
  if (!data.wl1) return;

  const proto = buildProtocolObject();
  const blob = new Blob([JSON.stringify(proto, null, 2)], { type: "application/json" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = defaultProtocolFilename(proto);
  a.click();

  lastProtocolFilename = a.download;
  updateProtocolFilenameLabel();
}

function importProtocol() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".pipe,.json,.zip,application/json";

  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".zip")) {
      handleInput({ target: { files: [file] } });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);
        const normalized = normalizeProtocol(raw);
        if (data.wl1) applyProtocol(normalized);
        else pendingProtocol = normalized;

        lastProtocolFilename = basename(file.name);
        updateProtocolFilenameLabel();
      } catch (err) {
        metaDiv.textContent = "Protocol import failed: " + err;
      }
    };
    reader.readAsText(file);
  };

  fileInput.click();
}

function applyProtocol(protocol) {
  const next = protocolApi.projectProtocolToUiState(protocol, getProtocolProjectionDeps());

  if (branchTagInput) branchTagInput.value = next.protocolLabel;
  if (notesInput) notesInput.value = next.notes;

  currentWavelength = next.wavelength;
  currentChannel = next.channelIndex;
  trimStepEnabled = next.trimStepEnabled;
  if (exclusionTable) exclusionTable.value = next.exclusionText;
  if (trimStepCheckbox) trimStepCheckbox.checked = trimStepEnabled;
  if (signalDomainSelect) signalDomainSelect.value = next.signalDomain;
  if (dpfWl1Input) dpfWl1Input.value = next.dpfWl1;
  if (dpfWl2Input) dpfWl2Input.value = next.dpfWl2;

  filterStepEnabled = next.filter.filterStepEnabled;
  lowCutEnabled = next.filter.lowCutEnabled;
  highCutEnabled = next.filter.highCutEnabled;
  lowCutInput.value = next.filter.lowCutValue;
  if (lowCutSixDbInput) lowCutSixDbInput.value = next.filter.lowCutSixDbValue;
  highCutInput.value = next.filter.highCutValue;
  if (highCutSixDbInput) highCutSixDbInput.value = next.filter.highCutSixDbValue;
  if (filterEngineSelect) filterEngineSelect.value = next.filter.filterEngineValue;
  if (dcRestoreCheckbox) dcRestoreCheckbox.checked = next.filter.dcRestore;
  if (edgePaddingCheckbox) edgePaddingCheckbox.checked = next.filter.edgePaddingEnabled;
  if (edgePaddingSecondsInput) edgePaddingSecondsInput.value = next.filter.edgePaddingSeconds;
  amplitudePreservationMode = "none";
  if (filterStepCheckbox) filterStepCheckbox.checked = filterStepEnabled;
  if (plotModeSelect) plotModeSelect.value = next.filter.requestedPlotView;
  setPlotMode(next.filter.requestedPlotView);
  updateFilterToggleButtons();
  updatePipelineSummary();

  rebuildRadioSelections();
  renderMeta();
  redraw();
}

/* ================= URL protocol share ================= */

function copyProtocolLink() {
  if (!data.wl1) return;

  const proto = buildProtocolObject();
  const enc = protocolApi.encodeForUrl(protocolApi.buildProtocolShareObject(proto));
  if (!enc) return;

  const base = window.location.href.split("#")[0];
  const link = base + "#protocol=" + enc;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link);
  } else {
    window.prompt("Copy link:", link);
  }
}

function initUrlProtocolListener() {
  const p = parseProtocolFromHash();
  if (p) pendingProtocol = p;

  window.addEventListener("hashchange", () => {
    const s = parseProtocolFromHash();
    if (!s) return;
    if (data.wl1) applyProtocol(s);
    else pendingProtocol = s;
  });
}

function parseProtocolFromHash() {
  return protocolApi.parseProtocolFromHash(window.location.hash || "", getProtocolNormalizationDeps());
}

/* ================= Protocol normalization ================= */

function normalizeProtocol(raw) {
  return protocolApi.normalizeProtocol(raw, getProtocolNormalizationDeps());
}

/* ================= Filename helpers ================= */

function defaultProtocolFilename(protocol) {
  return protocolApi.defaultProtocolFilename(protocol, { sanitizeFilename });
}

/* ================= Misc helpers and parsing ================= */

function basename(p) {
  if (!p) return "";
  const s = String(p);
  const parts = s.split("/");
  return parts[parts.length - 1];
}

function stem(name) {
  const n = String(name || "");
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(0, i) : n;
}

function sanitizeFilename(s) {
  return String(s || "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numberOrNull(v) {
  if (v === null || typeof v === "undefined" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatHz(v) {
  return v === null || !Number.isFinite(Number(v)) ? "?" : String(Number(v));
}

function deriveDefaultHighpassSixDbHz(passHz) {
  const v = numberOrNull(passHz);
  if (v === null || v <= 0) return null;
  return Math.max(1e-6, v - Math.max(v * 0.25, 0.05));
}

function deriveDefaultLowpassSixDbHz(passHz) {
  const v = numberOrNull(passHz);
  if (v === null || v <= 0) return null;
  return v + Math.max(v * 0.25, 0.05);
}

function describeFilterSpec(spec) {
  if (!spec || !spec.enabled) return "no filter";
  const hpPass = numberOrNull(spec.highpassPassHz);
  const hpSix = numberOrNull(spec.highpassSixDbHz);
  const lpPass = numberOrNull(spec.lowpassPassHz);
  const lpSix = numberOrNull(spec.lowpassSixDbHz);
  const padEnabled = !!spec.edgePaddingEnabled;
  const padSeconds = numberOrNull(spec.edgePaddingSeconds);
  let label = "filter enabled";

  if (hpPass !== null && lpPass !== null) {
    label = "BP [" + formatHz(hpSix) + " " + formatHz(hpPass) + " " + formatHz(lpPass) + " " + formatHz(lpSix) + "] Hz";
  } else if (hpPass !== null) {
    label = "HP [" + formatHz(hpSix) + " " + formatHz(hpPass) + "] Hz";
  } else if (lpPass !== null) {
    label = "LP [" + formatHz(lpPass) + " " + formatHz(lpSix) + "] Hz";
  }
  if (padEnabled) label += " + pad zero " + formatHz(padSeconds) + " s";
  return label;
}

function getSlowestFilterEdgeHz(spec) {
  if (!spec) return null;
  const candidates = [
    numberOrNull(spec.highpassSixDbHz),
    numberOrNull(spec.highpassPassHz),
    numberOrNull(spec.lowpassPassHz),
    numberOrNull(spec.lowpassSixDbHz)
  ].filter(v => v !== null && v > 0);
  return candidates.length ? Math.min(...candidates) : null;
}

function buildDurationGuidance(spec, durationSeconds) {
  const slowestHz = getSlowestFilterEdgeHz(spec);
  if (slowestHz === null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "No active filter edge.";
  }
  const cycleSeconds = 1 / slowestHz;
  const cycles = durationSeconds / cycleSeconds;
  return "Slowest edge " + formatHz(slowestHz) + " Hz -> " + cycleSeconds.toFixed(1) + " s/cycle; record " + durationSeconds.toFixed(1) + " s = " + cycles.toFixed(1) + " cycles. One cycle minimum, three or more preferred.";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function rmsNormalize(ref, x, edgeSamples) {
  const edge = Number.isFinite(edgeSamples) ? edgeSamples : 0;
  const trimEdges = (arr, n) => {
    if (!Number.isFinite(n) || n <= 0) return arr;
    if (arr.length <= (2 * n + 4)) return arr;
    return arr.slice(n, arr.length - n);
  };
  const mean = a => a.reduce((sum, v) => sum + v, 0) / a.length;
  const rmsCentered = a => {
    const m = mean(a);
    return Math.sqrt(a.reduce((sum, v) => {
      const d = v - m;
      return sum + d * d;
    }, 0) / a.length);
  };
  const refCore = trimEdges(ref, edge);
  const xCore = trimEdges(x, edge);
  const r0 = rmsCentered(refCore);
  const r1 = rmsCentered(xCore);
  if (r1 === 0 || !Number.isFinite(r1)) return x;
  const scale = r0 / r1;
  const clampedScale = Math.max(0.05, Math.min(50.0, scale));
  return x.map(v => v * clampedScale);
}

function extractChannelLabels(buf, expectedChannels) {
  if (typeof mat4js === "undefined") return [];

  try {
    const parsed = mat4js.read(buf);
    const probes = parsed.data.probeInfo.probes;
    if (!probes || !probes.index_c) return [];
    const labels = probes.index_c.map(pair => "S" + pair[0] + " D" + pair[1]);
    if (!expectedChannels || expectedChannels <= 0) return labels;
    return labels.length >= expectedChannels ? labels.slice(0, expectedChannels) : [];
  } catch {
    return [];
  }
}

function parseSamplingRate(t) {
  const m = t.match(/SamplingRate\s*=\s*([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function parseHdrWavelengths(t) {
  const match = String(t || "").match(/Wavelengths\s*=\s*"([^"]+)"/i);
  if (!match) return [];
  return match[1]
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite);
}

function parseHdrChannelDistancesMm(t) {
  const match = String(t || "").match(/ChanDis\s*=\s*"([^"]+)"/i);
  if (!match) return [];
  return match[1]
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite);
}

function normalizeNumericList(values, count, fallbackValue) {
  const out = Array.isArray(values) ? values.slice(0, Math.max(0, count)) : [];
  while (out.length < count) out.push(fallbackValue);
  return out;
}

function parseMatrix(t, selectedColumns, label) {
  const startMs = performance.now();
  const activeColumns = Array.isArray(selectedColumns) && selectedColumns.length
    ? selectedColumns.slice().sort((a, b) => a - b)
    : null;
  const rows = [];
  let row = [];
  let rowColumnCount = 0;
  let activeColumnCursor = 0;
  let token = "";

  const pushToken = () => {
    if (!token) return;
    const value = Number(token);
    if (Number.isFinite(value)) {
      if (activeColumns) {
        if (activeColumnCursor < activeColumns.length && activeColumns[activeColumnCursor] === rowColumnCount) {
          row.push(value);
          activeColumnCursor++;
        }
        rowColumnCount++;
      } else {
        row.push(value);
      }
    }
    token = "";
  };

  const pushRow = () => {
    pushToken();
    if (activeColumns) {
      if (rowColumnCount <= 0) return;
      if (activeColumnCursor !== activeColumns.length) {
        throw new Error(
          "Data row has " + rowColumnCount + " columns; expected at least " + (activeColumns[activeColumns.length - 1] + 1)
        );
      }
      rows.push(row);
      row = [];
      rowColumnCount = 0;
      activeColumnCursor = 0;
      return;
    }

    if (row.length) {
      rows.push(row);
      row = [];
    }
  };

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\n") {
      pushRow();
      continue;
    }
    if (ch === "\r" || ch === " " || ch === "\t") {
      pushToken();
      continue;
    }
    token += ch;
  }

  pushRow();
  debugLog("parseMatrix:complete", {
    label: label || "matrix",
    chars: t.length,
    rows: rows.length,
    columns: rows.length && Array.isArray(rows[0]) ? rows[0].length : 0,
    selectedColumnCount: activeColumns ? activeColumns.length : null,
    elapsedMs: Number((performance.now() - startMs).toFixed(1))
  });
  return rows;
}

function parseHdrChannelCountHint(text) {
  if (!text) return null;
  const gainMatch = text.match(/Gains="#([\s\S]*?)#"/i);
  if (!gainMatch) return null;
  const count = gainMatch[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line)
    .reduce((sum, line) => sum + line.split(/\s+/).filter(token => /^-?\d+(\.\d+)?$/.test(token)).length, 0);
  return count > 0 ? count : null;
}

function parseHdrChannelKeyEntries(text) {
  if (!text) return [];
  const match = text.match(/S-D-Key\s*=\s*"([^"]*)"/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const parts = entry.match(/(\d+)-(\d+):(\d+)/);
      if (!parts) return null;
      return {
        source: Number(parts[1]),
        detector: Number(parts[2]),
        columnIndex: Number(parts[3]) - 1
      };
    })
    .filter(entry => entry && Number.isInteger(entry.columnIndex) && entry.columnIndex >= 0);
}

function parseHdrMaskValues(text) {
  if (!text) return [];
  const match = text.match(/S-D-Mask\s*=\s*"#([\s\S]*?)#"/i);
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => line.split(/\s+/))
    .map(Number)
    .filter(Number.isFinite);
}

function parseHdrActiveChannelIndices(text) {
  const keyEntries = parseHdrChannelKeyEntries(text);
  const maskValues = parseHdrMaskValues(text);
  if (!maskValues.length) return [];

  if (keyEntries.length === maskValues.length) {
    return keyEntries
      .filter((entry, idx) => maskValues[idx] !== 0)
      .map(entry => entry.columnIndex)
      .sort((a, b) => a - b);
  }

  return maskValues
    .map((value, idx) => (value !== 0 ? idx : -1))
    .filter(idx => idx >= 0);
}

function extractHdrChannelLabels(text) {
  const keyEntries = parseHdrChannelKeyEntries(text);
  const activeIndices = new Set(parseHdrActiveChannelIndices(text));
  if (!keyEntries.length || !activeIndices.size) return [];
  return keyEntries
    .filter(entry => activeIndices.has(entry.columnIndex))
    .sort((a, b) => a.columnIndex - b.columnIndex)
    .map(entry => "S" + entry.source + " D" + entry.detector);
}

function inferMatrixChannelCount() {
  for (let i = 0; i < arguments.length; i++) {
    const matrix = arguments[i];
    if (Array.isArray(matrix) && matrix.length && matrix[0] && Number.isFinite(matrix[0].length) && matrix[0].length) {
      return matrix[0].length;
    }
  }
  return 0;
}

function parseEvents(t) {
  return t.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const p = line.split(/\s+/).map(Number).filter(Number.isFinite);
      if (p.length < 2) return null;
      const sample = Math.round(p[0]);
      const markerFields = p.slice(1);

      if (markerFields.length === 1) {
        const code = Math.round(markerFields[0]);
        return { sample, code, label: "E" + code };
      }

      const decoded = decodeBinaryMarkerFields(markerFields);
      if (!decoded.code) return null;

      return {
        sample,
        code: decoded.code,
        label: "E" + decoded.code
      };
    })
    .filter(Boolean);
}

function decodeBinaryMarkerFields(markerFields) {
  return markerFields.reduce((out, value, idx) => {
    if (value !== 0) out.code += Math.pow(2, idx);
    return out;
  }, { code: 0 });
}

function parseIntervals(text) {
  if (!text) return [];
  return text.split(/\r?\n/)
    .map(l => l.split(",").map(Number))
    .filter(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] < p[1])
    .map(p => ({ start: p[0], end: p[1] }));
}

function applyExclusions(series, intervals) {
  if (!intervals.length) return series.slice();
  return series.filter((_, i) => {
    const t = i / samplingRate;
    return !intervals.some(intv => t >= intv.start && t <= intv.end);
  });
}

function adjustEvents(eventsIn, intervals) {
  if (!eventsIn.length) return [];
  if (!intervals.length) return eventsIn.map(e => ({ time: e.sample / samplingRate, code: e.code, label: eventDisplayLabel(e) }));

  const out = [];
  eventsIn.forEach(e => {
    const t = e.sample / samplingRate;
    let shift = 0;
    let excluded = false;

    intervals.forEach(intv => {
      if (t >= intv.start && t <= intv.end) excluded = true;
      if (intv.end < t) shift += (intv.end - intv.start);
    });

    if (!excluded) out.push({ time: t - shift, code: e.code, label: eventDisplayLabel(e) });
  });
  return out;
}

function eventDisplayLabel(event) {
  if (event && typeof event.label === "string" && event.label.trim()) return event.label.trim();
  if (event && Number.isFinite(event.code)) return "E" + event.code;
  return "E?";
}

function defaultChannelLabels() {
  return buildDefaultChannelLabels(data.wl1[0].length);
}

function buildDefaultChannelLabels(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return Array.from({ length: n }, (_, i) => "Channel " + (i + 1));
}

function getDisplayWindow(series, eventsIn, intervalsIn, fs, filterSpec) {
  return {
    series: Array.isArray(series) ? series.slice() : [],
    events: Array.isArray(eventsIn) ? eventsIn.map(e => ({ time: e.time, code: e.code, label: eventDisplayLabel(e) })) : [],
    intervals: Array.isArray(intervalsIn) ? intervalsIn.map(intv => ({ start: intv.start, end: intv.end })) : intervalsIn
  };
}

function getReferenceDurationSeconds() {
  if (!data.wl1 || !samplingRate) return null;
  return data.wl1.length / samplingRate;
}

function getRequestedPlotWindowSeconds(durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const requested = numberOrNull(viewWindowSecondsInput ? viewWindowSecondsInput.value : null);
  if (requested === null || requested <= 0) return durationSeconds;
  return Math.min(requested, durationSeconds);
}

function getWindowStartSeconds(durationSeconds, windowSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const span = Number.isFinite(windowSeconds) && windowSeconds > 0 ? Math.min(windowSeconds, durationSeconds) : durationSeconds;
  const maxStart = Math.max(0, durationSeconds - span);
  const sliderValue = numberOrNull(viewOffsetSlider ? viewOffsetSlider.value : null);
  const start = sliderValue === null ? 0 : sliderValue;
  return Math.max(0, Math.min(start, maxStart));
}

function updateViewNavigationUi(durationSeconds) {
  if (!viewOffsetSlider || !viewOffsetSummaryEl) return;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    viewOffsetSlider.disabled = true;
    viewOffsetSlider.min = "0";
    viewOffsetSlider.max = "0";
    viewOffsetSlider.value = "0";
    updateViewNavigationSummary(durationSeconds);
    return;
  }

  const windowSeconds = getRequestedPlotWindowSeconds(durationSeconds);
  const maxStart = Math.max(0, durationSeconds - windowSeconds);
  const start = getWindowStartSeconds(durationSeconds, windowSeconds);
  viewOffsetSlider.disabled = maxStart <= 0;
  viewOffsetSlider.min = "0";
  viewOffsetSlider.max = maxStart.toFixed(3);
  viewOffsetSlider.step = durationSeconds >= 120 ? "0.5" : "0.1";
  viewOffsetSlider.value = start.toFixed(3);
  updateViewNavigationSummary(durationSeconds);
}

function updateViewNavigationSummary(durationSeconds) {
  if (!viewOffsetSummaryEl) return;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    viewOffsetSummaryEl.textContent = "No data loaded";
    return;
  }
  const windowSeconds = getRequestedPlotWindowSeconds(durationSeconds);
  const start = getWindowStartSeconds(durationSeconds, windowSeconds);
  const end = Math.min(durationSeconds, start + windowSeconds);
  if (windowSeconds >= durationSeconds - 1e-6) {
    viewOffsetSummaryEl.textContent = "Full record: 0.0-" + durationSeconds.toFixed(1) + " s";
    return;
  }
  viewOffsetSummaryEl.textContent = "Showing " + start.toFixed(1) + "-" + end.toFixed(1) + " s of " + durationSeconds.toFixed(1) + " s";
}

function getRequestedWindowStartSecondsInput() {
  const sliderValue = numberOrNull(viewOffsetSlider ? viewOffsetSlider.value : null);
  return sliderValue === null ? 0 : Math.max(0, sliderValue);
}

function syncControlsFromPlotView(view) {
  if (!view || !Number.isFinite(view.startSeconds) || !Number.isFinite(view.windowSeconds)) return;
  currentPlotDurationSeconds = Number.isFinite(view.durationSeconds) ? view.durationSeconds : currentPlotDurationSeconds;
  if (viewWindowSecondsInput) viewWindowSecondsInput.value = formatControlSeconds(view.windowSeconds);
  if (viewOffsetSlider) viewOffsetSlider.value = Math.max(0, view.startSeconds).toFixed(3);
  updateViewNavigationUi(currentPlotDurationSeconds);
}

function formatControlSeconds(value) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function sliceDisplayByTimeWindow(display, fs, requestedStartSeconds, requestedWindowSeconds) {
  const safe = {
    series: Array.isArray(display && display.series) ? display.series.slice() : [],
    events: Array.isArray(display && display.events) ? display.events.map(e => ({ time: e.time, code: e.code, label: eventDisplayLabel(e) })) : [],
    intervals: Array.isArray(display && display.intervals) ? display.intervals.map(intv => ({ start: intv.start, end: intv.end })) : []
  };
  if (!Number.isFinite(fs) || fs <= 0 || !safe.series.length) {
    safe.startSeconds = 0;
    return safe;
  }
  const durationSeconds = safe.series.length / fs;
  const span = Number.isFinite(requestedWindowSeconds) && requestedWindowSeconds > 0 ? Math.min(requestedWindowSeconds, durationSeconds) : durationSeconds;
  const startSeconds = Math.max(0, Math.min(Number.isFinite(requestedStartSeconds) ? requestedStartSeconds : 0, Math.max(0, durationSeconds - span)));
  const endSeconds = Math.min(durationSeconds, startSeconds + span);
  const startSample = Math.max(0, Math.floor(startSeconds * fs));
  const endSample = Math.min(safe.series.length, Math.max(startSample + 1, Math.ceil(endSeconds * fs)));

  safe.series = safe.series.slice(startSample, endSample);
  safe.events = safe.events
    .filter(e => Number.isFinite(e.time) && e.time >= startSeconds && e.time <= endSeconds)
    .map(e => ({ time: e.time - startSeconds, code: e.code, label: eventDisplayLabel(e) }));
  safe.intervals = safe.intervals
    .map(intv => ({
      start: Math.max(intv.start, startSeconds) - startSeconds,
      end: Math.min(intv.end, endSeconds) - startSeconds
    }))
    .filter(intv => Number.isFinite(intv.start) && Number.isFinite(intv.end) && intv.end > intv.start);
  safe.startSeconds = startSeconds;
  return safe;
}

function formatWindowRangeLabel(startSeconds, spanSeconds) {
  const start = Number.isFinite(startSeconds) ? startSeconds : 0;
  const span = Number.isFinite(spanSeconds) ? spanSeconds : 0;
  return start.toFixed(1) + "-" + (start + span).toFixed(1) + " s";
}

function absolutizeWindowEvents(windowed) {
  if (!windowed || !Array.isArray(windowed.events)) return [];
  return windowed.events.map(event => ({
    time: event.time + windowed.startSeconds,
    code: event.code,
    label: event.label
  }));
}

function absolutizeWindowIntervals(windowed) {
  if (!windowed || !Array.isArray(windowed.intervals)) return [];
  return windowed.intervals.map(intv => ({
    start: intv.start + windowed.startSeconds,
    end: intv.end + windowed.startSeconds
  }));
}

function buildPlotRenderModel(windowed, fullDisplay, config) {
  if (!windowed || !fullDisplay || !config) return null;
  const spanSeconds = windowed.series.length / samplingRate;
  return {
    yData: windowed.series,
    samplingRate,
    yLabel: config.yLabel,
    stroke: config.stroke,
    startSeconds: windowed.startSeconds,
    viewMin: windowed.startSeconds,
    viewMax: windowed.startSeconds + spanSeconds,
    domainMin: 0,
    domainMax: fullDisplay.series.length / samplingRate,
    events: absolutizeWindowEvents(windowed),
    overlays: absolutizeWindowIntervals(windowed)
  };
}

function rebuildRadioSelections() {
  const wavelengthLocked = isHemoglobinPlotMode(currentPlotMode);
  const wlButtons = document.querySelectorAll("button[data-wl-choice]");
  wlButtons.forEach(b => {
    const active = b.dataset.wlChoice === currentWavelength;
    b.classList.toggle("active", active);
    b.disabled = wavelengthLocked;
    b.title = wavelengthLocked ? "Hemoglobin plots use both wavelengths." : "";
  });
  if (wavelengthModeNoteEl) wavelengthModeNoteEl.style.display = wavelengthLocked ? "block" : "none";

  const chButtons = document.querySelectorAll("button[data-ch-choice]");
  chButtons.forEach(b => {
    const active = Number(b.dataset.chChoice) === currentChannel;
    b.classList.toggle("active", active);
  });
}

function initPlotLayout() {
  const tabs = [
    { value: "raw", label: "Raw" },
    { value: "trimmed", label: "Trimmed" },
    { value: "filtered", label: "Filtered" },
    { value: "hbo", label: "HbO" },
    { value: "hbr", label: "HbR" },
    { value: "hbt", label: "HbT" }
  ];
  plotTabBarEl = document.createElement("div");
  plotTabBarEl.className = "plot-tab-bar";
  plotTabButtons = [];
  tabs.forEach(tab => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plot-tab-btn";
    button.dataset.plotMode = tab.value;
    button.textContent = tab.label;
    button.onclick = () => setPlotMode(tab.value);
    plotTabBarEl.appendChild(button);
    plotTabButtons.push(button);
  });

  const plotPanel = document.createElement("div");
  plotPanel.className = "plot-panel";
  plotHeaderEl = document.createElement("div");
  plotHeaderEl.className = "plot-header";
  plotHeaderEl.textContent = "Raw";
  plotPanel.appendChild(plotHeaderEl);
  plotPanel.appendChild(plotHostEl);

  plotScrollerEl = createPlotScroller();

  plotGrid.innerHTML = "";
  plotGrid.appendChild(plotTabBarEl);
  plotGrid.appendChild(plotPanel);
  if (plotScrollerHost) {
    plotScrollerHost.textContent = "";
    plotScrollerHost.appendChild(plotScrollerEl);
  }
  if (stageSummaryHost) {
    stageSummaryHost.innerHTML = "";
    stageSummaryHost.style.display = "none";
  }
  plotController = fnirsPlot.createPlotController(plotHostEl, {
    onViewChange: syncControlsFromPlotView
  });
  applyPlotMode();
}

function createPlotScroller() {
  const scroller = document.createElement("div");
  scroller.className = "plot-scroller";

  viewOffsetSlider = document.createElement("input");
  viewOffsetSlider.type = "range";
  viewOffsetSlider.min = "0";
  viewOffsetSlider.max = "0";
  viewOffsetSlider.step = "0.1";
  viewOffsetSlider.value = "0";
  viewOffsetSlider.disabled = true;
  viewOffsetSlider.className = "plot-time-slider";
  viewOffsetSlider.oninput = () => {
    updateViewNavigationSummary(currentPlotDurationSeconds || getReferenceDurationSeconds());
    redraw();
  };

  viewOffsetSummaryEl = document.createElement("div");
  viewOffsetSummaryEl.className = "plot-scroll-summary";
  viewOffsetSummaryEl.textContent = "Full record";

  scroller.appendChild(viewOffsetSlider);
  scroller.appendChild(viewOffsetSummaryEl);
  return scroller;
}

function computeStats(series) {
  if (!Array.isArray(series) || !series.length) {
    return { mean: 0, median: 0, sd: 0, min: 0, max: 0 };
  }
  const sorted = series.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) * (v - mean), 0) / series.length);

  return { mean, median, sd, min: sorted[0], max: sorted[sorted.length - 1] };
}

function formatStats(s) {
  return "mean " + formatStatisticNumber(s.mean) +
    " | median " + formatStatisticNumber(s.median) +
    " | sd " + formatStatisticNumber(s.sd) +
    " | min " + formatStatisticNumber(s.min) +
    " | max " + formatStatisticNumber(s.max);
}

function summarizeStageSeries(label, series, unitSuffix) {
  if (!Array.isArray(series) || !series.length) return label + ": no data";
  const stats = computeStats(series);
  const unit = unitSuffix ? " " + unitSuffix : "";
  return label + ": sd " + formatStatisticNumber(stats.sd) + unit + " | range " + formatStatisticNumber(stats.min) + " to " + formatStatisticNumber(stats.max) + unit;
}

function renderStageSummary(model) {
  if (!stageSummaryHost) return;
  if (!model) {
    stageSummaryHost.innerHTML = "";
    return;
  }

  const channelDistance = model.mbllConfig ? model.mbllConfig.distanceMm : DEFAULT_CHANNEL_DISTANCE_MM;
  const distanceSource = model.mbllConfig ? model.mbllConfig.distanceSource : "default";
  const mbllDetails = (model.hbWindowed && model.hbWindowed.hbo && model.hbWindowed.hbo.series.length)
    ? [
        summarizeStageSeries("HbO", model.hbWindowed.hbo.series, "uM"),
        summarizeStageSeries("HbR", model.hbWindowed.hbr.series, "uM"),
        summarizeStageSeries("HbT", model.hbWindowed.hbt.series, "uM")
      ].join("<br>")
    : escapeHtml(model.mbllConfig && model.mbllConfig.reason ? model.mbllConfig.reason : "Hemoglobin conversion unavailable.");

  const cards = [
    {
      title: "1. Intensity",
      formula: escapeHtml(getWavelengthLabel(0) + " + " + getWavelengthLabel(1) + " raw light levels"),
      detail: [
        summarizeStageSeries(getWavelengthLabel(0), model.intensityWindowedWl1.series, "a.u."),
        summarizeStageSeries(getWavelengthLabel(1), model.intensityWindowedWl2.series, "a.u.")
      ].join("<br>")
    },
    {
      title: "2. Delta OD",
      formula: escapeHtml("dOD = -ln(I / mean(I))"),
      detail: [
        summarizeStageSeries(getWavelengthLabel(0), model.deltaOdWindowedWl1.series, ""),
        summarizeStageSeries(getWavelengthLabel(1), model.deltaOdWindowedWl2.series, "")
      ].join("<br>")
    },
    {
      title: "3. Processed dOD",
      formula: escapeHtml(model.filterLabel + (model.trimEnabled ? " | trim on" : " | trim off")),
      detail: [
        summarizeStageSeries(getWavelengthLabel(0), model.processedOdWindowedWl1.series, ""),
        summarizeStageSeries(getWavelengthLabel(1), model.processedOdWindowedWl2.series, "")
      ].join("<br>")
    },
    {
      title: "4. Relative Hb",
      formula: escapeHtml("inv(E * rho * DPF) * dOD | rho=" + formatMetricNumber(channelDistance) + " mm (" + distanceSource + ") | DPF=" + formatMetricNumber(model.mbllConfig ? model.mbllConfig.dpf1 : DEFAULT_DPF.wl1) + "/" + formatMetricNumber(model.mbllConfig ? model.mbllConfig.dpf2 : DEFAULT_DPF.wl2)),
      detail: mbllDetails
    }
  ];

  stageSummaryHost.innerHTML = cards.map(card => {
    return ""
      + "<div class='stage-card'>"
      + "  <div class='stage-card-title'>" + card.title + "</div>"
      + "  <div class='stage-card-formula'>" + card.formula + "</div>"
      + "  <div class='stage-card-detail'>" + card.detail + "</div>"
      + "</div>";
  }).join("");
}

function getRequestedFilterSpec() {
  const hpPass = numberOrNull(lowCutInput ? lowCutInput.value : null);
  const hpSix = numberOrNull(lowCutSixDbInput ? lowCutSixDbInput.value : null);
  const lpPass = numberOrNull(highCutInput ? highCutInput.value : null);
  const lpSix = numberOrNull(highCutSixDbInput ? highCutSixDbInput.value : null);
  const filterRequested = !!filterStepEnabled && (!!lowCutEnabled || !!highCutEnabled);

  return {
    highpassPassHz: filterStepEnabled && lowCutEnabled ? hpPass : null,
    highpassSixDbHz: filterStepEnabled && lowCutEnabled ? hpSix : null,
    lowpassPassHz: filterStepEnabled && highCutEnabled ? lpPass : null,
    lowpassSixDbHz: filterStepEnabled && highCutEnabled ? lpSix : null,
    edgePaddingEnabled: filterRequested && !!(edgePaddingCheckbox && edgePaddingCheckbox.checked),
    edgePaddingMode: "zero",
    edgePaddingSeconds: numberOrNull(edgePaddingSecondsInput ? edgePaddingSecondsInput.value : null),
    passbandRippleDb: DEFAULT_PASSBAND_RIPPLE_DB,
    stopbandAttenuationDb: DEFAULT_STOPBAND_ATTENUATION_DB
  };
}

function validateFilterSpec(fs, spec) {
  const warnings = [];
  const requested = spec || {};

  let hpPass = numberOrNull(requested.highpassPassHz);
  let hpSix = numberOrNull(requested.highpassSixDbHz);
  let lpPass = numberOrNull(requested.lowpassPassHz);
  let lpSix = numberOrNull(requested.lowpassSixDbHz);
  let edgePaddingEnabled = !!requested.edgePaddingEnabled;
  let edgePaddingSeconds = numberOrNull(requested.edgePaddingSeconds);

  if (!Number.isFinite(fs) || fs <= 0) {
    if (hpPass !== null || lpPass !== null) {
      warnings.push("Sampling rate is missing/invalid; filter disabled.");
    }
    return {
      enabled: false,
      highpassPassHz: null,
      highpassSixDbHz: null,
      lowpassPassHz: null,
      lowpassSixDbHz: null,
      edgePaddingEnabled: false,
      edgePaddingMode: "zero",
      edgePaddingSeconds: null,
      passbandRippleDb: DEFAULT_PASSBAND_RIPPLE_DB,
      stopbandAttenuationDb: DEFAULT_STOPBAND_ATTENUATION_DB,
      warning: warnings.join(" ")
    };
  }

  const nyq = fs / 2;
  const minHz = Math.max(1e-6, nyq * 1e-6);
  const maxHz = nyq * 0.95;
  const minGap = Math.max(minHz, nyq * 1e-4);

  const clampHz = (value, label) => {
    let out = value;
    if (out === null) return null;
    if (out <= 0) {
      warnings.push(label + " must be > 0 Hz; clamped.");
      out = minHz;
    }
    if (out >= nyq) {
      warnings.push(label + " must be below Nyquist (" + nyq.toFixed(3) + " Hz); clamped.");
      out = maxHz;
    }
    return out;
  };

  hpPass = clampHz(hpPass, "High-pass passband");
  hpSix = clampHz(hpSix, "High-pass -6 dB edge");
  lpPass = clampHz(lpPass, "Low-pass passband");
  lpSix = clampHz(lpSix, "Low-pass -6 dB edge");

  if (hpPass !== null && hpSix === null) hpSix = deriveDefaultHighpassSixDbHz(hpPass);
  if (lpPass !== null && lpSix === null) lpSix = deriveDefaultLowpassSixDbHz(lpPass);

  hpSix = clampHz(hpSix, "High-pass -6 dB edge");
  lpSix = clampHz(lpSix, "Low-pass -6 dB edge");

  if (hpPass !== null && hpSix !== null && hpSix >= hpPass) {
    hpSix = Math.max(minHz, hpPass - minGap);
    warnings.push("High-pass -6 dB edge must stay below the passband edge; adjusted.");
  }

  if (lpPass !== null && lpSix !== null && lpSix <= lpPass) {
    lpSix = Math.min(maxHz, lpPass + minGap);
    warnings.push("Low-pass -6 dB edge must stay above the passband edge; adjusted.");
  }

  if (hpPass !== null && lpPass !== null && hpPass >= lpPass) {
    lpPass = Math.min(maxHz, hpPass + minGap);
    warnings.push("Band-pass passband edges were inverted or touching; low-pass passband adjusted.");
  }

  if (hpSix !== null && hpPass !== null && lpPass !== null && hpSix >= lpPass) {
    hpSix = Math.max(minHz, hpPass - minGap);
    warnings.push("High-pass -6 dB edge crossed the low-pass passband; adjusted.");
  }

  if (lpSix !== null && hpPass !== null && lpPass !== null && lpSix <= hpPass) {
    lpSix = Math.min(maxHz, lpPass + minGap);
    warnings.push("Low-pass -6 dB edge crossed the high-pass passband; adjusted.");
  }

  const durationSeconds = data.wl1 ? (data.wl1.length / fs) : null;
  const slowestHz = getSlowestFilterEdgeHz({
    highpassPassHz: hpPass,
    highpassSixDbHz: hpSix,
    lowpassPassHz: lpPass,
    lowpassSixDbHz: lpSix
  });
  if (slowestHz !== null && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const cycles = durationSeconds * slowestHz;
    if (cycles < 1) {
      warnings.push("Record is shorter than one cycle at the slowest edge (" + formatHz(slowestHz) + " Hz).");
    } else if (cycles < 3) {
      warnings.push("Record spans only " + cycles.toFixed(1) + " cycles at the slowest edge; three or more are preferred.");
    }
  }

  if (edgePaddingEnabled) {
    if (edgePaddingSeconds === null || edgePaddingSeconds <= 0) {
      edgePaddingSeconds = MIN_EDGE_PADDING_SECONDS;
      warnings.push("Edge padding seconds were missing/invalid; reset to " + MIN_EDGE_PADDING_SECONDS.toFixed(1) + " s.");
    } else if (edgePaddingSeconds < MIN_EDGE_PADDING_SECONDS) {
      edgePaddingSeconds = MIN_EDGE_PADDING_SECONDS;
      warnings.push("Edge padding was below the " + MIN_EDGE_PADDING_SECONDS.toFixed(1) + " s minimum; increased.");
    }
  } else {
    edgePaddingSeconds = edgePaddingSeconds === null ? MIN_EDGE_PADDING_SECONDS : Math.max(MIN_EDGE_PADDING_SECONDS, edgePaddingSeconds);
  }

  const enabled = hpPass !== null || lpPass !== null;

  return {
    enabled: enabled,
    highpassPassHz: hpPass,
    highpassSixDbHz: hpPass === null ? null : hpSix,
    lowpassPassHz: lpPass,
    lowpassSixDbHz: lpPass === null ? null : lpSix,
    edgePaddingEnabled: edgePaddingEnabled,
    edgePaddingMode: "zero",
    edgePaddingSeconds: edgePaddingSeconds,
    passbandRippleDb: DEFAULT_PASSBAND_RIPPLE_DB,
    stopbandAttenuationDb: DEFAULT_STOPBAND_ATTENUATION_DB,
    warning: warnings.join(" ")
  };
}

function getFilterEngine() {
  if (!filterEngineSelect) return "rjg_sos";
  return "rjg_sos";
}

function applyPlotMode() {
  if (!plotGrid) return;
  plotTabButtons.forEach(button => {
    const active = button.dataset.plotMode === currentPlotMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (plotScrollerHost) {
    plotScrollerHost.style.display = "";
  }
  rebuildRadioSelections();
}

function isDcRestoreEnabled() {
  if (!dcRestoreCheckbox) return true;
  return !!dcRestoreCheckbox.checked;
}

function groupChannelsBySource(labels) {
  const groups = new Map();

  labels.forEach((lbl, i) => {
    const m = String(lbl || "").match(/^S(\d+)\s*D(\d+)$/i);
    const source = m ? ("S" + m[1]) : "Channels";
    const detectorLabel = m ? ("D" + m[2]) : ("Ch" + String(i + 1));
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push({
      index: i,
      fullLabel: String(lbl || ("Channel " + String(i + 1))),
      detectorLabel: detectorLabel
    });
  });

  return Array.from(groups.entries()).map(([source, items]) => ({ source, items }));
}

function restoreDcMean(ref, x) {
  if (!Array.isArray(ref) || !Array.isArray(x) || !ref.length || !x.length) return x;
  const mean = arr => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const delta = mean(ref) - mean(x);
  return x.map(v => v + delta);
}

function applyConfiguredFilter(series, filterSpec, filterEngine, dcRestore) {
  if (!Array.isArray(series) || !series.length) return [];
  if (!filterSpec) return series.slice();
  let filtered = applyRjgButterworth(series, samplingRate, filterSpec, filterEngine);
  if (amplitudePreservationMode === "rms_normalize_to_pre_filter") {
    filtered = rmsNormalize(series, filtered, Math.ceil(samplingRate || 0));
  }
  if (dcRestore) filtered = restoreDcMean(series, filtered);
  return filtered;
}

function formatMetricNumber(v) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0.00";
  const abs = Math.abs(v);
  if (abs < 0.005) return v.toExponential(2);
  return v.toFixed(2);
}

function formatStandardDeviation(v) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0.000";
  const abs = Math.abs(v);
  if (abs < 0.0005) return v.toExponential(2);
  return v.toFixed(3);
}

function formatStatisticNumber(v) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0.000e+0";
  return v.toExponential(3);
}
