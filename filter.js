function applyRjgButterworth(series, fs, spec, mode) {
  return applyBasicIirFilter(series, fs, spec, mode);
}

function applyBasicIirFilter(series, fs, spec, mode) {
  if (!Array.isArray(series) || !series.length) return [];
  if (!Number.isFinite(fs) || fs <= 0) return series.slice();

  const filterMode = normalizeFilterMode(mode);
  if (filterMode !== "basic_iir") {
    throw new Error("Unsupported filter engine: " + String(mode));
  }

  const stages = buildBasicIirStages(fs, spec);
  if (!stages.length) return series.slice();

  const padding = resolveEdgePadding(series.length, fs, spec);
  const input = padding.enabled ? zeroPad(series, padding.samples) : series.slice();
  let output = forwardBackwardCascade(input, stages);

  if (padding.enabled) {
    output = output.slice(padding.samples, padding.samples + series.length);
  }

  return sanitizeFiniteSeries(output, series);
}

function normalizeFilterMode(mode) {
  // Keep backward compatibility with old protocol snapshots while deprecating SOS path.
  if (mode === "rjg_sos") return "basic_iir";
  if (!mode) return "basic_iir";
  return String(mode);
}

function buildBasicIirStages(fs, spec) {
  const validated = spec || {};
  const nyquist = fs / 2;
  const stages = [];
  const hpPass = clampCutoffHz(finiteOrNull(validated.highpassPassHz), nyquist);
  const lpPass = clampCutoffHz(finiteOrNull(validated.lowpassPassHz), nyquist);

  if (hpPass !== null) {
    stages.push(createHighpassBiquad(fs, hpPass));
  }
  if (lpPass !== null) {
    stages.push(createLowpassBiquad(fs, lpPass));
  }
  return stages.filter(Boolean);
}

function clampCutoffHz(value, nyquist) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const maxHz = nyquist * 0.95;
  if (!Number.isFinite(maxHz) || maxHz <= 0) return null;
  if (value >= maxHz) return maxHz;
  return value;
}

function createLowpassBiquad(fs, cutoffHz) {
  const omega = Math.PI * cutoffHz / fs;
  const tanTerm = Math.tan(omega);
  if (!Number.isFinite(tanTerm) || tanTerm === 0) return null;

  const ita = 1 / tanTerm;
  const q = Math.SQRT2;
  const norm = 1 / (1 + q * ita + ita * ita);
  const b0 = norm;
  const b1 = 2 * norm;
  const b2 = norm;
  const a1 = 2 * (1 - ita * ita) * norm;
  const a2 = (1 - q * ita + ita * ita) * norm;
  return { b0, b1, b2, a1, a2 };
}

function createHighpassBiquad(fs, cutoffHz) {
  const omega = Math.PI * cutoffHz / fs;
  const ita = Math.tan(omega);
  if (!Number.isFinite(ita)) return null;

  const q = Math.SQRT2;
  const norm = 1 / (1 + q * ita + ita * ita);
  const b0 = norm;
  const b1 = -2 * norm;
  const b2 = norm;
  const a1 = 2 * (ita * ita - 1) * norm;
  const a2 = (1 - q * ita + ita * ita) * norm;
  return { b0, b1, b2, a1, a2 };
}

function forwardBackwardCascade(series, stages) {
  let y = cascadeBiquads(series, stages);
  y.reverse();
  y = cascadeBiquads(y, stages);
  y.reverse();
  return y;
}

function cascadeBiquads(series, stages) {
  let output = series.slice();
  for (let i = 0; i < stages.length; i++) {
    const sec = stages[i];
    output = biquadDf2t(output, sec.b0, sec.b1, sec.b2, sec.a1, sec.a2);
  }
  return output;
}

function biquadDf2t(series, b0, b1, b2, a1, a2) {
  const output = new Array(series.length).fill(0);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < series.length; i++) {
    const xn = Number(series[i]) || 0;
    const yn = b0 * xn + z1;
    z1 = b1 * xn - a1 * yn + z2;
    z2 = b2 * xn - a2 * yn;
    output[i] = yn;
  }
  return output;
}

function sanitizeFiniteSeries(series, fallback) {
  if (!Array.isArray(series) || !series.length) return [];
  let hasInvalid = false;
  for (let i = 0; i < series.length; i++) {
    if (!Number.isFinite(series[i])) {
      hasInvalid = true;
      break;
    }
  }
  if (!hasInvalid) return series;
  return Array.isArray(fallback) ? fallback.slice() : [];
}

function resolveEdgePadding(length, fs, spec) {
  const enabled = !!(spec && spec.edgePaddingEnabled);
  const seconds = finiteOr(spec && spec.edgePaddingSeconds, 10.0);
  if (!enabled || !Number.isFinite(fs) || fs <= 0 || !Number.isFinite(length) || length < 3) {
    return { enabled: false, samples: 0 };
  }
  const requested = Math.max(10.0, seconds);
  const samples = Math.max(0, Math.round(requested * fs));
  return { enabled: samples > 0, samples: samples };
}

function zeroPad(series, padSamples) {
  if (!Array.isArray(series) || !series.length || padSamples <= 0) return series.slice();
  const left = new Array(padSamples).fill(0);
  const right = new Array(padSamples).fill(0);
  return left.concat(series, right);
}

function finiteOrNull(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function finiteOr(value, fallback) {
  if (value === null || typeof value === "undefined" || value === "") return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

if (typeof module !== "undefined") {
  module.exports = {
    applyRjgButterworth,
    applyBasicIirFilter
  };
}
