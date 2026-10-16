import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const rootDir = process.cwd();
await mkdir("screenshots/downloads", { recursive: true });
const { server, url } = await startStaticServer({ rootDir, port: 4174 });
const browser = await chromium.launch({ headless: true, downloadsPath: path.join(rootDir, "screenshots/downloads") });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    window.__lastExportBlob = blob;
    return createObjectURL(blob);
  };
});

async function exportContents(button) {
  const pending = page.waitForEvent("download");
  await button.click();
  await pending;
  // Verify exactly the Blob offered by the browser. Host download policies may
  // cancel OS file writes; this check does not claim to verify disk persistence.
  return page.evaluate(() => window.__lastExportBlob.text());
}
const downloadCsv = () => exportContents(page.getByRole("button", { name: "Download design CSV" }));

try {
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.getByRole("button", { name: "Open task design" }).click();
  await page.waitForSelector("#taskDesignDialog[open] .design-plot polyline");
  assert.match(await page.locator(".task-status").textContent(), /6 events; 2 condition regressors/);
  const syntheticCsv = await downloadCsv();
  assert.equal(syntheticCsv.split("\r\n").length, 361);
  await page.screenshot({ path: "screenshots/task-design-synthetic-dark.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  console.log("PASS: synthetic example, regressor preview, and design CSV");

  await page.locator("#input").setInputFiles(path.join(rootDir, "samples/nirx-demo-2026-02-18_002.zip"));
  await page.waitForFunction(() => document.querySelector("#controls").textContent.includes("Recording Summary"));
  await page.getByRole("button", { name: "Open task design" }).click();
  assert.match(await page.locator(".task-status").textContent(), /Set durations/);
  assert.ok(await page.getByRole("button", { name: "Download design CSV" }).isDisabled());
  const durations = page.locator(".task-form input[type=number]");
  for (let i = 0; i < await durations.count(); i += 1) {
    await durations.nth(i).fill("8");
    await durations.nth(i).press("Tab");
  }
  const labels = page.locator(".task-form input[type=text]");
  await labels.first().fill("Configured condition");
  await labels.first().press("Tab");
  await page.waitForSelector(".design-plot polyline");
  const before = await page.evaluate(() => JSON.stringify(buildProtocolObject().taskConfig));
  const recordingCsv = await downloadCsv();
  await page.getByRole("button", { name: "Synthetic example", exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.stringify(buildProtocolObject().taskConfig)), before);
  await page.getByRole("button", { name: "Use recording", exact: true }).click();
  assert.equal(await labels.first().inputValue(), "Configured condition");
  await durations.first().fill("-1");
  assert.match(await page.locator(".task-status").textContent(), /nonnegative/);
  assert.ok(await page.getByRole("button", { name: "Download design CSV" }).isDisabled());
  await durations.first().fill("8");
  await durations.first().press("Tab");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // File export/import and a cut must preserve task settings and the original design clock.
  const actions = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Actions$/ }) });
  await actions.locator("summary").click();
  const savedText = await exportContents(actions.getByRole("button", { name: "Save", exact: true }));
  const saved = JSON.parse(savedText);
  assert.equal(saved.taskConfig.conditions[0].label, "Configured condition");
  const pendingChooser = page.waitForEvent("filechooser");
  await actions.getByRole("button", { name: "Load", exact: true }).click();
  await (await pendingChooser).setFiles({ name: "test-task.pipe", mimeType: "application/json", buffer: Buffer.from(savedText) });
  await page.waitForFunction(() => document.querySelector("#controls").textContent.includes("test-task.pipe"));
  assert.equal(await page.evaluate(() => JSON.stringify(buildProtocolObject().taskConfig)), before);
  const cuts = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Cut Intervals$/ }) });
  await cuts.locator("summary").click();
  await cuts.locator("textarea").fill("0,3");
  await cuts.locator("textarea").press("Tab");
  await page.getByRole("button", { name: "Open task design" }).click();
  assert.equal(await downloadCsv(), recordingCsv);
  await page.screenshot({ path: "screenshots/task-design-nirx-dark.png" });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  console.log("PASS: NIRx duration editing, isolated demo, protocol export/import, and uncompressed design clock");

  await page.locator("#input").setInputFiles(path.join(rootDir, "samples/homer3-test.snirf"));
  await page.waitForFunction(() => document.querySelector("#controls").textContent.includes("Recording Summary") &&
    document.querySelector("#meta").textContent === "");
  await page.getByRole("button", { name: "Open task design" }).click();
  await page.waitForSelector(".design-plot polyline");
  const eventInfo = await page.evaluate(() => ({ count: events.length,
    valid: events.every(event => Number.isFinite(event.durationSeconds) && Number.isFinite(event.amplitude)) }));
  assert.ok(eventInfo.count > 0 && eventInfo.valid);
  assert.equal(await page.evaluate(() => buildProtocolObject().taskConfig.conditions.length), 0);
  await page.screenshot({ path: "screenshots/task-design-snirf-dark.png" });
  await page.evaluate(() => setTheme("light"));
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: "screenshots/task-design-snirf-light-1024.png" });
  assert.ok(await page.locator(".task-dialog").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.deepEqual(errors, []);
  console.log(`PASS: real SNIRF (${eventInfo.count} events), dataset reset, desktop layouts, and no browser errors`);
} catch (error) {
  console.error("UI failure diagnostics:", await page.evaluate(() => ({
    meta: document.querySelector("#meta").textContent,
    task: document.querySelector(".task-status")?.textContent,
    protocolFilename: typeof lastProtocolFilename === "undefined" ? null : lastProtocolFilename
  })), errors);
  await page.screenshot({ path: "screenshots/task-design-failure.png" });
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
