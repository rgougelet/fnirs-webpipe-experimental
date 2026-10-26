import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
const rootDir = process.cwd();
await mkdir("screenshots/downloads", { recursive: true });
const { server, url } = await startStaticServer({ rootDir, port: 4175 });
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.__lastExportBlob = blob; return original(blob); };
  });
  const workspace = page.locator("#glmWorkspace");
  const button = name => workspace.getByRole("button", { name, exact: true });
  const status = () => workspace.locator(".glm-status").textContent();
  const ready = () => page.waitForFunction(() => document.querySelector(".glm-status")?.textContent.startsWith("Design ready."));
  const fitted = () => page.waitForFunction(() => document.querySelector(".glm-status")?.textContent.startsWith("Fit complete."));
  async function exported(control) {
    const pending = page.waitForEvent("download");
    await control.click(); await pending;
    return page.evaluate(() => window.__lastExportBlob.text());
  }
  async function zipContents() {
    const pending = page.waitForEvent("download");
    await button("Download GLM ZIP").click(); await pending;
    return page.evaluate(async () => {
      const zip = await JSZip.loadAsync(await window.__lastExportBlob.arrayBuffer());
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).map(async name => [name, await zip.file(name).async("text")])));
    });
  }
  async function openSection(name) {
    const section = page.locator("details").filter({ has: page.locator("summary", { hasText: new RegExp("^" + name + "$") }) });
    if (!await section.getAttribute("open") && !await section.evaluate(el => el.open)) await section.locator("summary").click();
    return section;
  }
  await page.goto(url);
  await page.getByRole("tab", { name: "Design Matrix", exact: true }).click();
  assert.ok(await workspace.isVisible());
  await button("Synthetic example").click(); await ready();
  assert.match(await workspace.textContent(), /360 rows x 4 columns/);
  assert.equal(await workspace.locator("canvas").count(), 1);
  await page.screenshot({ path: "screenshots/glm-matrix-dark.png" });
  await page.getByRole("tab", { name: "Design Matrix", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.getByRole("tab", { name: "GLM Fit", exact: true }).getAttribute("aria-selected"), "true");
  await button("Fit GLM").click(); await fitted();
  const bundle = await zipContents();
  assert.deepEqual(Object.keys(bundle).sort(), ["coefficients.csv", "design.csv", "fitted-traces.csv", "model.json"]);
  assert.equal(bundle["design.csv"].split("\r\n").length, 361);
  assert.equal(bundle["fitted-traces.csv"].split("\r\n").length, 361);
  const metadata = JSON.parse(bundle["model.json"]);
  assert.equal(metadata.rank, 4); assert.equal(metadata.synthetic, true);
  const coefficients = bundle["coefficients.csv"].split("\r\n").slice(1).map(line => Number(line.split(",")[5]));
  [1.2, 0.4, 0.15, 0.2, -0.5, -0.15, -0.05, -0.1].forEach((value, i) => assert.ok(Math.abs(value - coefficients[i]) < 0.01));
  await page.screenshot({ path: "screenshots/glm-fit-dark.png" });
  const recordConfig = await page.evaluate(() => JSON.stringify(glmConfig));
  await workspace.getByLabel("Include linear drift", { exact: true }).uncheck();
  assert.ok(await button("Download GLM ZIP").isDisabled());
  assert.equal(await page.evaluate(() => JSON.stringify(glmConfig)), recordConfig);
  await button("Fit GLM").click(); await fitted();
  assert.equal(JSON.parse((await zipContents())["model.json"]).drift, "none");
  await page.evaluate(() => setTheme("light"));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("tab", { name: "Design Matrix", exact: true }).click();
  await page.screenshot({ path: "screenshots/glm-matrix-light-1024.png" });
  assert.ok(await workspace.evaluate(el => el.clientHeight > 150 && el.scrollWidth <= el.clientWidth + 1));
  console.log("PASS: synthetic coefficient recovery, matrix tab, keyboard navigation, ZIP contents, isolated settings and desktop layouts");

  await page.setViewportSize({ width: 1440, height: 1000 }); await page.evaluate(() => setTheme("dark"));
  await page.locator("#input").setInputFiles(path.join(rootDir, "samples/nirx-demo-2026-02-18_002.zip"));
  await page.waitForFunction(() => data.wl1 && document.querySelector("#controls").textContent.includes("Recording Summary"));
  await button("Use recording").click();
  await page.waitForFunction(() => document.querySelector(".glm-status").textContent.includes("durations"));
  await button("Configure events").click();
  const durations = page.locator(".task-form input[type=number]");
  for (let i = 0; i < await durations.count(); i += 1) { await durations.nth(i).fill("8"); await durations.nth(i).press("Tab"); }
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await button("Build design").click(); await ready();
  await button("Fit GLM").click(); await fitted();
  const rawBundle = await zipContents(), rawModel = JSON.parse(rawBundle["model.json"]);
  assert.equal(rawModel.synthetic, false);
  assert.equal(rawModel.retainedSamples, await page.evaluate(() => data.wl1.length));
  console.log("PASS: real NIRx task configuration and full-sampling-rate HbO/HbR fitting");

  const filter = await openSection("Filter");
  await filter.getByLabel("Enable filter", { exact: true }).check();
  await filter.locator('input[title^="Lower in-band"]').fill("0.015");
  await filter.locator('input[title^="Upper in-band"]').fill("0.5");
  const cuts = await openSection("Cut Intervals");
  await cuts.locator("textarea").fill("10,20\n15,25");
  await cuts.locator("textarea").press("Tab");
  assert.ok(await button("Download GLM ZIP").isDisabled());
  await button("Fit GLM").click(); await fitted();
  const cutBundle = await zipContents(), cutModel = JSON.parse(cutBundle["model.json"]);
  const traceRows = cutBundle["fitted-traces.csv"].split("\r\n").slice(1).map(line => line.split(",").map(Number));
  const expected = await page.evaluate(() => {
    const fspec = validateFilterSpec(samplingRate, getRequestedFilterSpec());
    const od1 = applyConfiguredFilter(intensityToDeltaOd(data.wl1.map(row => row[currentChannel])), fspec, "basic_iir", isDcRestoreEnabled());
    const od2 = applyConfiguredFilter(intensityToDeltaOd(data.wl2.map(row => row[currentChannel])), fspec, "basic_iir", isDcRestoreEnabled());
    const hb = deltaOdToHemoglobin(od1, od2, getCurrentMbllConfig());
    return { rate: samplingRate, hbo: hb.hbo, hbr: hb.hbr };
  });
  assert.equal(traceRows.length, cutModel.retainedSamples);
  traceRows.forEach(([sample, time, observedHbo, , , observedHbr]) => {
    assert.ok(time < 10 || time > 25);
    assert.ok(Math.abs(time - sample / expected.rate) < 1e-10);
    assert.ok(Math.abs(observedHbo - expected.hbo[sample]) < 1e-9);
    assert.ok(Math.abs(observedHbr - expected.hbr[sample]) < 1e-9);
  });
  await cuts.locator("textarea").fill("invalid");
  await button("Build design").click();
  assert.match(await status(), /Invalid cut/);
  assert.ok(await button("Download matrix CSV").isDisabled());
  await cuts.locator("textarea").fill("10,20\n15,25");
  await workspace.getByLabel("Include linear drift", { exact: true }).uncheck();
  const actions = await openSection("Actions");
  const saved = await exported(actions.getByRole("button", { name: "Save", exact: true }));
  assert.equal(JSON.parse(saved).glmConfig.drift, "none");
  await workspace.getByLabel("Include linear drift", { exact: true }).check();
  const chooser = page.waitForEvent("filechooser");
  await actions.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles({ name: "glm-settings.pipe", mimeType: "application/json", buffer: Buffer.from(saved) });
  await page.waitForFunction(() => glmConfig.drift === "none");
  assert.ok(!await workspace.getByLabel("Include linear drift", { exact: true }).isChecked());
  await button("Fit GLM").click(); await fitted();
  await page.locator('button[data-ch-choice="1"]').click();
  assert.ok(await button("Download GLM ZIP").isDisabled());
  await button("Fit GLM").click(); await fitted();
  assert.equal(JSON.parse((await zipContents())["model.json"]).channelIndex, 1);
  console.log("PASS: matched preprocessing, overlapping cuts, exact clock alignment, protocol reload, channel changes and stale-result invalidation");

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("#glmWorkspace button")];
    buttons.find(button => button.textContent === "Build design").click();
    buttons.find(button => button.textContent === "Cancel").click();
  });
  assert.match(await status(), /cancelled/);
  assert.ok(await button("Download GLM ZIP").isDisabled());
  await page.evaluate(() => {
    events = ["qa:a", "qa:b"].map(conditionId => ({ ...events[0], conditionId, durationSeconds: 8 }));
    taskConfig = { conditions: [] }; requestUiRedraw({ meta: true });
  });
  await button("Build design").click();
  await page.waitForFunction(() => document.querySelector(".glm-warning").textContent.includes("identical regressors"));
  assert.ok(await button("Fit GLM").isDisabled());
  assert.ok((await exported(button("Download matrix CSV"))).includes("qa:a"));
  await page.screenshot({ path: "screenshots/glm-rank-warning.png" });
  await page.locator("#input").setInputFiles(path.join(rootDir, "samples/homer3-test.snirf"));
  await page.waitForFunction(() => sources.hdr?.includes("snirf") && document.querySelector("#controls").textContent.includes("Recording Summary"));
  await page.getByRole("tab", { name: "Design Matrix", exact: true }).click();
  await button("Build design").click();
  // This real Homer3 sample explicitly declares TimeUnit="unknown".
  await page.waitForFunction(() => document.querySelector(".glm-status").textContent.includes("SNIRF times in seconds"));
  assert.ok(await button("Download matrix CSV").isDisabled());
  assert.ok(await button("Download GLM ZIP").isDisabled());
  await page.screenshot({ path: "screenshots/glm-snirf-unit-warning.png" });
  assert.deepEqual(errors, []);
  console.log("PASS: cancellation, singular design blocked, real SNIRF unknown units rejected, matrix export and no browser errors");
} catch (error) {
  console.error("Browser errors:", errors);
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      console.error(await page.locator("#glmWorkspace").textContent());
      await page.screenshot({ path: "screenshots/glm-failure.png" });
    }
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
