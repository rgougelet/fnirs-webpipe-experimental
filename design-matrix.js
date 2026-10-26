(function (root) {
  "use strict";
  // Independently implemented double-gamma HRF. Method: SPM documentation,
  // parameters [6, 16, 1, 1, 6, 0, 32]; see docs/task-design-preview.md.
  const SUPPORT = 32;

  function gammaPdf(t, shape) {
    if (t <= 0) return 0;
    let factorial = 1;
    for (let k = 2; k < shape; k += 1) factorial *= k;
    return Math.exp((shape - 1) * Math.log(t) - t) / factorial;
  }

  function gammaCdf(t, shape) {
    if (t <= 0) return 0;
    let term = 1;
    let sum = 1;
    for (let k = 1; k < shape; k += 1) { term *= t / k; sum += term; }
    return 1 - Math.exp(-t) * sum;
  }

  const area = gammaCdf(SUPPORT, 6) - gammaCdf(SUPPORT, 16) / 6;
  function hrf(t) {
    return t < 0 || t >= SUPPORT ? 0 : (gammaPdf(t, 6) - gammaPdf(t, 16) / 6) / area;
  }
  function hrfIntegral(t) {
    const u = Math.max(0, Math.min(SUPPORT, t));
    return (gammaCdf(u, 6) - gammaCdf(u, 16) / 6) / area;
  }

  function buildDesign(events, samplingRate, sampleCount, options = {}) {
    if (!Number.isFinite(samplingRate) || samplingRate <= 0 || !Number.isInteger(sampleCount) || sampleCount < 1) {
      throw new Error("A valid sampling rate and sample count are required.");
    }
    if (!events.length) throw new Error("No task events are available.");
    const groups = new Map();
    events.forEach(event => {
      if (!Number.isFinite(event.onsetSeconds) || !Number.isFinite(event.durationSeconds) || event.durationSeconds < 0
        || !Number.isFinite(event.amplitude)) throw new Error("Every event needs a finite onset, amplitude, and nonnegative duration.");
      if (!groups.has(event.conditionId)) groups.set(event.conditionId, event.label || event.conditionId);
    });
    const fitting = !!options.fitting;
    if (groups.size > 64 || sampleCount > (fitting ? 200000 : 20000)
      || (groups.size + 2) * sampleCount > (fitting ? 5000000 : 1000000)
      || (fitting && sampleCount * (groups.size + 2) ** 2 > 100000000)) {
      throw new Error(fitting ? "This full-resolution design exceeds the GLM size limit." : "This design exceeds the preview size limit. Use a coarser preview grid.");
    }
    const columns = [...groups].map(([id, label]) => ({ id, label, values: new Float64Array(sampleCount) }));
    const byId = new Map(columns.map(column => [column.id, column]));
    const times = Float64Array.from({ length: sampleCount }, (_, i) => i / samplingRate);
    const warnings = [];
    let operations = 0;
    let clipped = 0;
    for (const event of events) {
      const onset = event.onsetSeconds;
      const duration = event.durationSeconds;
      if (onset < 0 || onset + duration > sampleCount / samplingRate) clipped += 1;
      const first = Math.max(0, Math.ceil(onset * samplingRate));
      const last = Math.min(sampleCount - 1, Math.ceil((onset + duration + SUPPORT) * samplingRate));
      operations += Math.max(0, last - first + 1);
      if (operations > (fitting ? 20000000 : 5000000)) throw new Error("Too many events for this design grid.");
      const values = byId.get(event.conditionId).values;
      for (let i = first; i <= last; i += 1) {
        const elapsed = times[i] - onset;
        const response = duration === 0 ? hrf(elapsed) : hrfIntegral(elapsed) - hrfIntegral(elapsed - duration);
        values[i] += event.amplitude * response;
      }
    }
    if (clipped) warnings.push(clipped + " event(s) extend outside the recording; only their response within the recording is shown.");
    columns.forEach(column => {
      if (!column.values.some(value => Math.abs(value) > 1e-12)) warnings.push(column.label + " has an all-zero regressor.");
    });
    columns.forEach((column, i) => {
      if (!column.values.some(value => Math.abs(value) > 1e-12)) return;
      columns.slice(0, i).forEach(other => {
        if (column.values.every((value, j) => Math.abs(value - other.values[j]) < 1e-12)) {
          warnings.push(column.id + " and " + other.id + " have identical regressors and cannot be estimated separately.");
        }
      });
    });
    columns.push({ id: "intercept", label: "Intercept", values: new Float64Array(sampleCount).fill(1) });
    return { times, columns, samplingRate, warnings };
  }

  function syntheticExample() {
    const samplingRate = 2;
    return { label: "Synthetic emotional / neutral blocks", samplingRate, sampleCount: 360,
      events: [10, 40, 70, 100, 130, 160].map((onsetSeconds, i) => ({
        sample: onsetSeconds * samplingRate, onsetSeconds, durationSeconds: 8, amplitude: 1,
        conditionId: i % 2 ? "demo:neutral" : "demo:emotional", code: i % 2 + 1,
        label: i % 2 ? "Neutral" : "Emotional", markerIndex: i + 1
      })) };
  }

  function designCsv(design) {
    const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
    const header = ["time_seconds", ...design.columns.map(column => column.label + " [" + column.id + "]")].map(quote).join(",");
    return [header, ...Array.from(design.times, (time, i) =>
      [time, ...design.columns.map(column => column.values[i])].join(","))].join("\r\n");
  }

  root.fnirsDesign = { hrf, hrfIntegral, buildDesign, syntheticExample, designCsv };
})(globalThis.window || globalThis);
