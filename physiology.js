// Shared OD / MBLL operations for waveform views and GLM workers.
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

function restoreDcMean(ref, x) {
  if (!Array.isArray(ref) || !Array.isArray(x) || !ref.length || !x.length) return x;
  const mean = arr => arr.reduce((sum, v) => sum + v, 0) / arr.length;
  const delta = mean(ref) - mean(x);
  return x.map(v => v + delta);
}
