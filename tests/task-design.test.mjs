import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const sandbox = vm.createContext({ window: {}, btoa: value => Buffer.from(value, "binary").toString("base64"),
  atob: value => Buffer.from(value, "base64").toString("binary") });
for (const file of ["task-events.js", "design-matrix.js", "glm-config.js", "protocol.js", "snirf.js"]) {
  vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), sandbox, { filename: file });
}
const { fnirsTaskEvents: task, fnirsDesign: design, fnirsProtocol: protocol, fnirsSnirf: snirf } = sandbox.window;
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const event = (patch = {}) => ({ conditionId: "a", label: "A", onsetSeconds: 10, durationSeconds: 8, amplitude: 1, ...patch });

test("NIRx binary markers retain codes and require explicit durations", () => {
  const events = task.normalizeEvents(task.parseNirxEvents("# header\n20 1 0 1\n40 0 1 0\n60 0 0 0\n80 bad 1"), 4);
  assert.deepEqual(plain(events.map(item => [item.code, item.onsetSeconds, item.durationSeconds, item.amplitude])),
    [[5, 5, null, 1], [2, 10, null, 1]]);
  assert.throws(() => design.buildDesign(events, 4, 100), /duration/);
});

function fakeSnirf(stimRows = [[11.125, 2.5, 0.25], [11.125, 3, -0.5], [12, 0, 0]], options = {}) {
  const data = new Map();
  const put = (path, value, shape = [1]) => data.set(path, { value, shape });
  put("nirs/data1/dataTimeSeries", Array.from({ length: 40 }, () => [10, 20]), [40, 2]);
  put("nirs/data1/time", options.times || Array.from({ length: 40 }, (_, i) => 10 + i / 4), [40]);
  if (options.timeUnit) put("nirs/metaDataTags/TimeUnit", options.timeUnit);
  if (options.lengthUnit) put("nirs/metaDataTags/LengthUnit", options.lengthUnit);
  for (let i = 1; i <= 2; i += 1) {
    for (const [name, value] of [["sourceIndex", 1], ["detectorIndex", 1], ["wavelengthIndex", i], ["dataType", options.dataType ?? 1]]) {
      put(`nirs/data1/measurementList${i}/${name}`, value);
    }
  }
  put("nirs/probe/wavelengths", [760, 850], [2]);
  put("nirs/stim1/name", "Shared label");
  put("nirs/stim1/data", stimRows, [stimRows.length, stimRows[0].length]);
  put("nirs/stim2/name", "Shared label");
  put("nirs/stim2/data", [[15, 4, 0.25]], [1, 3]);
  return class File {
    keys = ["nirs"];
    get(path) {
      if (data.has(path)) return data.get(path);
      const children = [...data.keys()].filter(key => key.startsWith(path + "/")).map(key => key.slice(path.length + 1).split("/")[0]);
      if (children.length) return { keys: [...new Set(children)] };
      throw new Error("Missing " + path);
    }
  };
}

test("SNIRF preserves exact timing, durations, amplitudes, and separate conditions", () => {
  sandbox.window.hdf5 = { File: fakeSnirf() };
  const parsed = snirf.parseSnirfArrayBuffer(new ArrayBuffer(1));
  const events = task.normalizeEvents(parsed.events, parsed.samplingRate);
  assert.equal(events.length, 4);
  close(events[0].onsetSeconds, 1.125);
  assert.deepEqual(plain(events.map(item => [item.conditionId, item.code, item.durationSeconds, item.amplitude])),
    [["snirf:stim1", 1, 2.5, 0.25], ["snirf:stim1", 1, 3, -0.5], ["snirf:stim1", 1, 0, 0], ["snirf:stim2", 2, 4, 0.25]]);
  assert.equal(task.listConditions(events, {}).length, 2);
});

test("malformed SNIRF stimulus metadata fails explicitly", () => {
  for (const rows of [[[11, -1, 1]], [[11, 1, NaN]], [[11, 1]]]) {
    sandbox.window.hdf5 = { File: fakeSnirf(rows) };
    assert.throws(() => snirf.parseSnirfArrayBuffer(new ArrayBuffer(1)), /stim|SNIRF/);
  }
});

test("condition overrides preserve imported per-event durations and raw metadata", () => {
  const events = [event({ sample: 40 }), event({ sample: 80, durationSeconds: 3 })];
  const config = { conditions: [{ id: "a", label: "Renamed", durationSeconds: null }] };
  assert.deepEqual(plain(task.resolveEvents(events, config).map(item => item.durationSeconds)), [8, 3]);
  config.conditions[0].durationSeconds = 0;
  assert.deepEqual(plain(task.resolveEvents(events, config).map(item => [item.label, item.durationSeconds])), [["Renamed", 0], ["Renamed", 0]]);
  assert.equal(events[0].durationSeconds, 8);
  assert.throws(() => task.normalizeConfig({ conditions: [{ id: "a", durationSeconds: -1 }] }), /duration/);
});

test("HRF is causal, unit integral, and has a delayed peak and undershoot", () => {
  close(design.hrf(-1), 0);
  close(design.hrf(0), 0);
  assert.ok(design.hrf(5) > design.hrf(3));
  assert.ok(design.hrf(5) > design.hrf(7));
  assert.ok(design.hrf(16) < 0);
  let integral = 0;
  const dt = 0.001;
  for (let t = dt / 2; t < 32; t += dt) integral += design.hrf(t) * dt;
  close(integral, 1, 1e-7);
});

test("block response matches independent numerical integration at fractional onsets", () => {
  const onset = 10.125;
  const duration = 2.375;
  const actual = design.buildDesign([event({ onsetSeconds: onset, durationSeconds: duration })], 4, 160);
  for (const i of [40, 45, 60, 80, 120]) {
    let quadrature = 0;
    const steps = 4000;
    for (let k = 0; k < steps; k += 1) quadrature += design.hrf(i / 4 - onset - (k + 0.5) * duration / steps) * duration / steps;
    close(actual.columns[0].values[i], quadrature, 1e-7);
  }
});

test("overlap, zero/negative amplitudes, impulses, and sampling resolution behave consistently", () => {
  const a = event({ durationSeconds: 0 });
  const single = design.buildDesign([a], 2, 120);
  const overlap = design.buildDesign([a, event({ durationSeconds: 0, amplitude: -0.25 }), event({ durationSeconds: 0, amplitude: 0 })], 2, 120);
  const finer = design.buildDesign([a], 4, 240);
  single.times.forEach((time, i) => {
    close(overlap.columns[0].values[i], 0.75 * single.columns[0].values[i]);
    close(finer.columns[0].values[2 * i], single.columns[0].values[i]);
    if (time < 10) close(single.columns[0].values[i], 0);
  });
  assert.ok(single.columns[1].values.every(value => value === 1));
});

test("synthetic design has two conditions, causal timing, and an exportable intercept", () => {
  const demo = design.syntheticExample();
  const result = design.buildDesign(demo.events, demo.samplingRate, demo.sampleCount);
  assert.equal(result.columns.length, 3);
  assert.equal(result.times.length, 360);
  assert.ok(result.columns[0].values[30] > 0);
  assert.ok(result.columns[1].values.slice(0, 80).every(value => value === 0));
  assert.match(design.designCsv(result).split("\r\n")[0], /Intercept/);
  assert.throws(() => design.buildDesign(demo.events, 2, 1000000), /limit/);
});

test("identical condition regressors are preserved and flagged", () => {
  const result = design.buildDesign([event(), event({ conditionId: "b" })], 2, 100);
  assert.equal(result.columns.length, 3);
  assert.match(result.warnings.join(" "), /identical regressors/);
});

const deps = { protocolSchemaVersion: 2, appVersion: "0.4.1", datasetLabel: "test", currentWavelength: "wl1", currentChannel: 0,
  currentPlotMode: "raw", channelLabels: [], sources: {}, intervals: [], defaultDpf: { wl1: 6, wl2: 6 },
  defaultChannelDistanceMm: 30, minEdgePaddingSeconds: 10, defaultPassbandRippleDb: 0.1, defaultStopbandAttenuationDb: 6,
  numberOrNull: value => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value),
  formatHz: String, deriveDefaultHighpassSixDbHz: value => value / 2,
  deriveDefaultLowpassSixDbHz: value => value * 1.25, normalizePlotMode: value => value || "raw" };

test("task settings survive file and URL protocol round trips; legacy protocols load", () => {
  const taskConfig = { conditions: [{ id: "nirx:1", label: "Emotional", durationSeconds: 8 }, { id: "nirx:2", label: "Neutral", durationSeconds: 0 }] };
  const built = protocol.buildProtocolObject({ ...deps, taskConfig });
  const fileRoundTrip = protocol.projectProtocolToUiState(JSON.parse(JSON.stringify(built)), deps);
  assert.deepEqual(plain(fileRoundTrip.taskConfig), taskConfig);
  const shared = protocol.buildProtocolShareObject(built);
  const urlRoundTrip = protocol.parseProtocolFromHash("#protocol=" + protocol.encodeForUrl(shared), deps);
  assert.deepEqual(plain(urlRoundTrip.taskConfig), taskConfig);
  assert.deepEqual(plain(protocol.normalizeProtocol({ protocolSchemaVersion: 1 }, deps).taskConfig), { conditions: [] });
});

test("SNIRF marks irregular clocks, non-intensity data and unsupported units as unavailable for GLM", () => {
  const regular = Array.from({ length: 40 }, (_, i) => 10 + i / 4);
  for (const [options, expected] of [
    [{ times: regular.map((value, i) => value + (i === 30 ? 0.05 : 0)) }, /uniform/],
    [{ dataType: 99999 }, /CW intensity/],
    [{ timeUnit: "ms" }, /seconds/],
    [{ lengthUnit: "cm" }, /millimeters/]
  ]) {
    sandbox.window.hdf5 = { File: fakeSnirf(undefined, options) };
    assert.match(snirf.parseSnirfArrayBuffer(new ArrayBuffer(1)).meta.glmIssue, expected);
  }
  sandbox.window.hdf5 = { File: fakeSnirf() };
  assert.equal(snirf.parseSnirfArrayBuffer(new ArrayBuffer(1)).meta.glmIssue, "");
});
