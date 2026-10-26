import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
const context = vm.createContext({ window: {}, btoa: s => Buffer.from(s, "binary").toString("base64"),
  atob: s => Buffer.from(s, "base64").toString("binary") });
for (const file of ["filter.js", "physiology.js", "task-events.js", "design-matrix.js", "glm-config.js", "glm-solver.js", "glm-analysis.js", "protocol.js", "glm-export.js"]) {
  vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), context, { filename: file });
}
const { fnirsGlmSolver: solver, fnirsDesign: design, fnirsGlmAnalysis: analysis, fnirsGlmExport: exports, fnirsProtocol: protocol } = context.window;
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, a + " != " + b);
const column = (id, values) => ({ id, label: id, values: Float64Array.from(values) });
const mbll = { supported: true, wl1Nm: 760, wl2Nm: 850, dpf1: 6, dpf2: 6, distanceMm: 30,
  coeff1: { hbo: 1.4866, hbr: 3.8437 }, coeff2: { hbo: 2.5264, hbr: 1.7986 } };
const demo = () => ({ ...design.syntheticExample(), synthetic: true, taskConfig: {}, glmConfig: { drift: "linear" },
  channel: "Synthetic", channelIndex: 0, dcRestore: true, intervals: [] });
const filter = { enabled: true, highpassPassHz: 0.015, lowpassPassHz: 0.5, edgePaddingEnabled: true, edgePaddingSeconds: 10 };
test("OLS matches independent analytic coefficients and residual diagnostics", () => {
  const x = [-2, -1, 0, 1, 2], noise = [1, -2, 2, -2, 1];
  const columns = [column("slope", x), column("offset", [1, 1, 1, 1, 1])];
  const fit = solver.fit(solver.factor(columns), columns, x.map((value, i) => 3 * value + 4 + noise[i]));
  near(fit.coefficients[0], 3); near(fit.coefficients[1], 4);
  near(fit.rmse, Math.sqrt(14 / 5)); near(fit.residualSd, Math.sqrt(14 / 3));
  near(fit.rSquared, 1 - 14 / 104); assert.equal(fit.df, 3);
  fit.residuals.forEach((value, i) => near(value, noise[i]));
});
test("pivoted QR preserves coefficient order and handles different regressor scales", () => {
  const x = [0, 1, 2, 3, 4, 5, 6];
  const columns = [column("small", x.map(v => v * 1e-10)), column("quadratic", x.map(v => v * v * 1e5)), column("constant", x.map(() => 1))];
  const fit = solver.fit(solver.factor(columns), columns, x.map(v => 2 * v - 0.3 * v * v + 7));
  near(fit.coefficients[0] * 1e-10, 2); near(fit.coefficients[1] * 1e5, -0.3); near(fit.coefficients[2], 7);
});
test("rank failures, zero columns, invalid samples and insufficient rows fail explicitly", () => {
  const x = [1, 2, 3, 4, 5], one = x.map(() => 1);
  for (const columns of [
    [column("a", x), column("b", x.map(v => 2 * v)), column("one", one)],
    [column("a", x), column("b", x.map((v, i) => v + 1e-12 * i * i)), column("one", one)]
  ]) assert.throws(() => solver.factor(columns), /rank deficient/);
  assert.throws(() => solver.factor([column("zero", [0, 0, 0])]), /zero/);
  assert.throws(() => solver.factor([column("bad", [0, NaN, 2])]), /invalid/);
  assert.throws(() => solver.factor([column("a", [1]), column("b", [2])]), /Too few/);
  const columns = [column("one", one)];
  assert.throws(() => solver.fit(solver.factor(columns), columns, [NaN, 0, 0, 0, 0]), /invalid/);
  assert.equal(solver.fit(solver.factor(columns), columns, [5, 5, 5, 5, 5]).rSquared, null);
});
test("synthetic block-task fit recovers both chromophores with deterministic noise", () => {
  const model = analysis.prepare(demo()), fit = analysis.fit(model);
  for (const [key, truth] of [["hbo", [1.2, 0.4, 0.15, 0.2]], ["hbr", [-0.5, -0.15, -0.05, -0.1]]]) {
    truth.forEach((value, i) => near(fit[key].coefficients[i], value, 0.01));
    assert.ok(fit[key].rmse < 0.04); assert.equal(fit[key].n, 360);
  }
});
test("exclusions preserve full-clock HRF tails, remove identical rows, and skip lag pairs at gaps", () => {
  const base = analysis.prepare(demo());
  const cut = analysis.prepare({ ...demo(), intervals: [{ start: 8, end: 20 }, { start: 12, end: 16 }, { start: 17, end: 23 }] });
  assert.equal(cut.design.times.length, 329);
  cut.design.times.forEach((time, i) => {
    assert.ok(time < 8 || time > 23);
    const original = cut.design.rowIndices[i]; near(time, original / 2);
    cut.design.columns.forEach((col, j) => near(col.values[i], base.design.columns[j].values[original]));
  });
  assert.equal(analysis.fit(cut).hbo.adjacentPairs, 327);
  assert.ok(analysis.prepare({ ...demo(), intervals: [{ start: 0, end: 180 }] }).fitError.includes("Too few"));
  assert.throws(() => analysis.prepare({ ...demo(), intervals: [{ start: 5, end: 4 }] }), /intervals/);
});
function intensityRecording(filtered, restore = true) {
  const input = { ...demo(), synthetic: false, mbll, filter: filtered, dcRestore: restore };
  const x = design.buildDesign(input.events, 2, 360);
  const hbo = Array.from(x.times, (_, i) => 1.2 * x.columns[0].values[i] + 0.4 * x.columns[1].values[i] + 0.15 * (2 * i / 359 - 1));
  const hbr = Array.from(x.times, (_, i) => -0.5 * x.columns[0].values[i] - 0.15 * x.columns[1].values[i] - 0.05 * (2 * i / 359 - 1));
  input.wl1 = hbo.map((value, i) => 1000 * Math.exp(-18 * (1.4866 * value + 3.8437 * hbr[i]) / 1000));
  input.wl2 = hbo.map((value, i) => 900 * Math.exp(-18 * (2.5264 * value + 1.7986 * hbr[i]) / 1000));
  input.intervals = [{ start: 28.5, end: 41 }];
  return input;
}
test("intensity-to-Hb fits recover known responses with matching filters, DC modes, and cuts", () => {
  for (const filtered of [null, filter]) for (const restore of [true, false]) {
    const model = analysis.prepare(intensityRecording(filtered, restore)), fit = analysis.fit(model);
    [1.2, 0.4, 0.15].forEach((value, i) => near(fit.hbo.coefficients[i], value, 2e-9));
    [-0.5, -0.15, -0.05].forEach((value, i) => near(fit.hbr.coefficients[i], value, 2e-9));
    assert.ok(fit.hbo.rmse < 1e-10);
  }
});
test("invalid paired intensities are rejected before OD conversion or filtering", () => {
  for (const value of [NaN, Infinity, -1, 0]) {
    const input = intensityRecording(filter); input.wl1[60] = value; // Even inside an excluded interval.
    assert.throws(() => analysis.fit(analysis.prepare(input)), /Invalid intensity/);
  }
  const input = intensityRecording(null); input.wl2.pop();
  assert.throws(() => analysis.fit(analysis.prepare(input)), /same sample count/);
});
test("duplicate/out-of-recording conditions remain visible but cannot be fit", () => {
  const input = demo();
  input.events = [input.events[0], { ...input.events[0], conditionId: "duplicate" }];
  const model = analysis.prepare(input);
  assert.equal(model.design.columns.length, 4);
  assert.match(model.fitError, /rank deficient/);
  assert.throws(() => analysis.fit(model), /rank deficient/);
  input.events = [{ ...input.events[0], onsetSeconds: 999 }];
  assert.match(analysis.prepare(input).fitError, /zero/);
});
test("short-record reflection padding preserves length and linear filter behavior", () => {
  const a = [1, 2, 4, 2, 1], b = [2, 0, 1, 2, 5];
  const apply = values => context.applyBasicIirFilter(values, 20, filter, "basic_iir");
  assert.equal(apply(a).length, 5);
  apply(a.map((value, i) => 3 * value + b[i])).forEach((value, i) => near(value, 3 * apply(a)[i] + apply(b)[i]));
});
test("matrix/results export preserves all original rows, IDs and numerical coefficients", () => {
  const model = analysis.prepare({ ...demo(), intervals: [{ start: 8, end: 20 }] }), fit = analysis.fit(model);
  const lines = exports.designCsv(model.design).split("\r\n");
  assert.equal(lines.length, model.design.times.length + 1);
  assert.match(lines[0], /sample_index.*demo:emotional.*linear_drift.*intercept/);
  const result = exports.resultCsv(model, fit);
  assert.match(result, /coefficient_uM/); assert.equal(result.split("\r\n").length, 9);
  assert.equal(exports.tracesCsv(model, fit).split("\r\n").length, lines.length);
});
test("GLM settings persist through protocol files and links; old protocols default to OLS with drift", () => {
  const deps = { protocolSchemaVersion: 3, sources: {}, defaultDpf: { wl1: 6, wl2: 6 }, defaultChannelDistanceMm: 30,
    numberOrNull: value => value == null ? null : Number(value), formatHz: String, normalizePlotMode: x => x,
    deriveDefaultHighpassSixDbHz: x => x / 2, deriveDefaultLowpassSixDbHz: x => x * 1.25 };
  const object = protocol.buildProtocolObject({ ...deps, glmConfig: { drift: "none" } });
  const projected = protocol.projectProtocolToUiState(JSON.parse(JSON.stringify(object)), deps);
  assert.equal(projected.glmConfig.drift, "none");
  const hash = "#protocol=" + protocol.encodeForUrl(protocol.buildProtocolShareObject(object));
  assert.equal(protocol.parseProtocolFromHash(hash, deps).glmConfig.drift, "none");
  assert.equal(protocol.normalizeProtocol({ protocolSchemaVersion: 2 }, deps).glmConfig.drift, "linear");
});
