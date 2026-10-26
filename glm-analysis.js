(function (root) {
  "use strict";
  function transform(values, input) {
    const original = Array.from(values);
    if (!input.filter?.enabled) return original;
    // The filter is linear; RMS normalization is deliberately never applied.
    const filtered = applyBasicIirFilter(original, input.samplingRate, input.filter, "basic_iir");
    if (filtered.length !== original.length || !filtered.every(Number.isFinite)) throw new Error("Filter produced invalid or misaligned samples.");
    return input.dcRestore ? restoreDcMean(original, filtered) : filtered;
  }
  function prepare(input) {
    const config = root.fnirsGlmConfig.normalize(input.glmConfig);
    const resolved = root.fnirsTaskEvents.resolveEvents(input.events, input.taskConfig);
    if (resolved.some(event => !Number.isFinite(event.durationSeconds))) throw new Error("Set all event durations in Task Design before building the GLM.");
    const full = root.fnirsDesign.buildDesign(resolved, input.samplingRate, input.sampleCount, { fitting: true });
    if (config.drift === "linear") full.columns.splice(full.columns.length - 1, 0, {
      id: "linear_drift", label: "Linear drift", values: Float64Array.from(full.times, (_, i) => 2 * i / (input.sampleCount - 1 || 1) - 1)
    });
    full.columns.forEach(column => {
      if (column.id !== "intercept") column.values = Float64Array.from(transform(column.values, input));
    });
    const intervals = input.intervals || [];
    if (intervals.length > 1000 || intervals.some(interval => !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.start >= interval.end)) {
      throw new Error("Cut intervals must contain finite start/end seconds in increasing order (maximum 1,000 intervals).");
    }
    const sorted = intervals.slice().sort((a, b) => a.start - b.start);
    let intervalIndex = 0;
    const kept = [];
    full.times.forEach((time, i) => {
      while (intervalIndex < sorted.length && sorted[intervalIndex].end < time) intervalIndex += 1;
      if (intervalIndex === sorted.length || time < sorted[intervalIndex].start) kept.push(i);
    });
    const design = { ...full, times: Float64Array.from(kept, i => full.times[i]), rowIndices: Uint32Array.from(kept),
      columns: full.columns.map(column => ({ ...column, values: Float64Array.from(kept, i => column.values[i]) })) };
    let qr = null;
    let fitError = "";
    try { qr = root.fnirsGlmSolver.factor(design.columns); } catch (error) { fitError = error.message; }
    if (qr?.minDiagonal < 1e-5) design.warnings.push("Regressors are strongly collinear; coefficient estimates may be unstable.");
    if (input.filter?.warning) design.warnings.push(input.filter.warning);
    if (!input.synthetic && !input.mbll?.supported) fitError = input.mbll?.reason || "MBLL conversion unavailable.";
    const metadata = { appVersion: input.appVersion, label: input.label, channel: input.channel, channelIndex: input.channelIndex,
      synthetic: !!input.synthetic, samplingRate: input.samplingRate, inputSamples: input.sampleCount,
      retainedSamples: kept.length, excludedSamples: input.sampleCount - kept.length, noiseModel: "ols", drift: config.drift,
      taskConfig: input.taskConfig, events: resolved, filter: input.filter, dcRestore: input.dcRestore, mbll: input.mbll,
      intervals, rank: qr?.rank ?? null, minScaledQrDiagonal: qr?.minDiagonal ?? null,
      hrf: "Continuous unit-integral double gamma, delays 6/16 s, dispersions 1/1, ratio 6, support 32 s",
      nuisance: "Matched filtering for task and drift columns; constant intercept in fitted signal space",
      units: "uM", inference: "Exploratory OLS; no prewhitening, robust weights, short-channel regression, p-values, or confidence intervals" };
    return { design, metadata, fitError, qr, input };
  }
  function signals(model) {
    const { input, design } = model;
    let hb;
    if (input.synthetic) {
      const unfiltered = root.fnirsDesign.buildDesign(input.events, input.samplingRate, input.sampleCount);
      const make = (a, b, drift, offset, phase) => Array.from(unfiltered.times, (t, i) =>
        a * unfiltered.columns[0].values[i] + b * unfiltered.columns[1].values[i] + offset
        + drift * (2 * i / (input.sampleCount - 1) - 1) + 0.035 * Math.sin(t * 1.71 + phase) + 0.02 * Math.cos(t * 0.87 + phase));
      hb = { hbo: make(1.2, 0.4, 0.15, 0.2, 0), hbr: make(-0.5, -0.15, -0.05, -0.1, 1) };
      hb.hbo = transform(hb.hbo, input);
      hb.hbr = transform(hb.hbr, input);
    } else {
      for (const [name, values] of [["wl1", input.wl1], ["wl2", input.wl2]]) {
        if (!values || values.length !== input.sampleCount) throw new Error("Both wavelengths must have the same sample count for this channel.");
        const bad = values.findIndex(value => !Number.isFinite(value) || value <= 0);
        if (bad >= 0) throw new Error("Invalid intensity in " + name + " at sample " + bad + ". GLM requires finite positive intensities before filtering.");
      }
      if (!input.mbll?.supported) throw new Error(input.mbll?.reason || "MBLL conversion unavailable.");
      const od1 = transform(intensityToDeltaOd(input.wl1), input);
      const od2 = transform(intensityToDeltaOd(input.wl2), input);
      hb = deltaOdToHemoglobin(od1, od2, input.mbll);
      if (!hb || !hb.hbo.every(Number.isFinite) || !hb.hbr.every(Number.isFinite)) throw new Error("MBLL conversion failed.");
    }
    return { hbo: Float64Array.from(design.rowIndices, i => hb.hbo[i]), hbr: Float64Array.from(design.rowIndices, i => hb.hbr[i]) };
  }
  function fit(model) {
    if (model.fitError) throw new Error(model.fitError);
    const hb = signals(model);
    return Object.fromEntries(["hbo", "hbr"].map(name => [name, root.fnirsGlmSolver.fit(model.qr, model.design.columns, hb[name], model.design.rowIndices)]));
  }
  root.fnirsGlmAnalysis = { prepare, fit, transform };
})(globalThis.window || globalThis);
