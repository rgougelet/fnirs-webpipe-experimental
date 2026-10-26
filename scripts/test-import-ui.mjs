import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const rootDir = process.cwd(), zipName = "nirx-demo-2026-02-18_002.zip";
await mkdir("screenshots/import-fixture/session", { recursive: true });
const { server, url } = await startStaticServer({ rootDir, port: 4176 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  const original = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => { window.__importDownload = blob; return original(blob); };
});
const hash = data => createHash("sha256").update(data).digest("hex");
async function idle() {
  await page.waitForFunction(() => document.querySelector(".import-browser").getAttribute("aria-busy") === "false");
}
async function click(name) { await page.getByRole("button", { name, exact: true }).click(); await idle(); }
async function openPath(value) {
  await page.locator("#importPath").fill(value);
  await page.locator("#importPath").press("Enter");
  await idle();
}
async function download(name) {
  const pending = page.waitForEvent("download");
  await click("Download " + name);
  assert.equal((await pending).suggestedFilename(), name);
  // Validate the exact offered bytes; host policies may cancel OS disk writes.
  return page.evaluate(async () => {
    const bytes = await window.__importDownload.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return { hash: Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join(""),
      text: window.__importDownload.name.endsWith(".hdr") ? new TextDecoder().decode(bytes) : null };
  });
}

try {
  await page.goto(url);
  assert.equal(await page.locator("summary").filter({ hasText: /^Import$/ }).count(), 1);
  assert.equal(await page.locator("summary").filter({ hasText: /Bundled Samples/ }).count(), 0);
  assert.equal(await page.locator("#importPath").inputValue(), "samples/");
  assert.equal(await page.locator(".import-file").count(), 2);
  assert.equal((await download(zipName)).hash, hash(await readFile("samples/" + zipName)));
  await click("Open " + zipName);
  assert.equal(await page.locator(".import-loaded").textContent(), "Loaded: samples/" + zipName);
  assert.ok(await page.evaluate(() => data.wl1.length > 0 && events.length > 0));
  const baseline = await page.evaluate(() => ({ samples: data.wl1.length, value: data.wl1[50][0], events: events.length }));
  await page.screenshot({ path: "screenshots/import-samples-dark.png" });
  console.log("PASS: one Import section, real bundled ZIP download, and recording load");

  await page.reload();
  await openPath("samples/" + zipName + "/2026-02-18_002/");
  assert.equal(await page.locator(".import-file").first().getAttribute("data-path"),
    "samples/" + zipName + "/2026-02-18_002/NIRS-2026-02-18_002.hdr");
  await click("samples/");
  await click("Browse ZIP " + zipName);
  await click("Browse 2026-02-18_002");
  const hdrName = "NIRS-2026-02-18_002.hdr";
  const hdr = await download(hdrName);
  assert.match(hdr.text, /SamplingRate/);
  await click("Open " + hdrName);
  assert.match(await page.locator(".import-loaded").textContent(), /\.zip\/2026-02-18_002\/NIRS-2026-02-18_002.hdr$/);
  assert.deepEqual(await page.evaluate(() => ({ samples: data.wl1.length, value: data.wl1[50][0], events: events.length })), baseline);
  await page.screenshot({ path: "screenshots/import-archive-dark.png" });
  await click("Up");
  await click("Up");
  assert.equal(await page.locator("#importPath").inputValue(), "samples/");
  await openPath("samples/missing.snirf");
  assert.match(await page.locator(".import-status").textContent(), /File not found/);
  await openPath("samples/homer3-test.snirf");
  assert.equal(await page.locator(".import-loaded").textContent(), "Loaded: samples/homer3-test.snirf");
  assert.equal((await download("homer3-test.snirf")).hash, hash(await readFile("samples/homer3-test.snirf")));
  console.log("PASS: ZIP navigation, member download/load, editable paths, SNIRF, and error recovery");

  // Native file chooser exposes multi-file input; ambiguous selections remain selectable.
  const pendingChooser = page.waitForEvent("filechooser");
  await click("Browse files");
  const chooser = await pendingChooser;
  assert.equal(chooser.isMultiple(), true);
  await chooser.setFiles([path.join(rootDir, "samples/" + zipName), path.join(rootDir, "samples/homer3-test.snirf")]);
  await idle();
  assert.match(await page.locator(".import-status").textContent(), /Choose a recording/);
  assert.equal(await page.locator("#importPath").inputValue(), "local/");
  await click("Open " + zipName);
  assert.equal(await page.locator(".import-loaded").textContent(), "Loaded: local/" + zipName);
  await click("samples/");
  assert.equal(await page.locator(".import-file").count(), 2);
  await click("local/");
  assert.equal(await page.locator(".import-file").count(), 2);

  // Extract the real bundled NIRx set to exercise directory selection with relative paths.
  const members = await page.evaluate(async zipName => {
    const zip = await JSZip.loadAsync(await (await fetch("samples/" + zipName)).arrayBuffer());
    return Promise.all(Object.values(zip.files).filter(file => !file.dir && /\.(hdr|wl1|wl2|evt|mat)$/i.test(file.name))
      .map(async file => ({ name: file.name.split("/").pop(), bytes: Array.from(await file.async("uint8array")) })));
  }, zipName);
  for (const member of members) await writeFile("screenshots/import-fixture/session/" + member.name, Buffer.from(member.bytes));
  const pendingFolder = page.waitForEvent("filechooser");
  await click("Browse folder");
  await (await pendingFolder).setFiles(path.join(rootDir, "screenshots/import-fixture/session"));
  await idle();
  assert.equal(await page.locator(".import-loaded").textContent(), "Loaded: local/session/" + hdrName);
  assert.equal(await page.locator("#importPath").inputValue(), "local/session/");
  assert.deepEqual(await page.evaluate(() => ({ samples: data.wl1.length, value: data.wl1[50][0], events: events.length })), baseline);
  await page.evaluate(() => setTheme("light"));
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.ok(await page.locator(".import-browser").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: "screenshots/import-folder-light-1024.png" });
  console.log("PASS: multiple local files, native folder picker, matching NIRx companions, and narrow light layout");

  await page.locator("#input").setInputFiles({ name: "broken.hdr", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await idle();
  assert.match(await page.locator(".import-status").textContent(), /Missing broken.wl1/);
  await page.locator("#input").setInputFiles({ name: "broken.snirf", mimeType: "application/octet-stream", buffer: Buffer.from("invalid") });
  await idle();
  assert.match(await page.locator("#meta").textContent(), /Failed to load SNIRF/);
  assert.equal(await page.locator(".import-loaded").textContent(), "");
  await page.locator("#input").setInputFiles(path.join(rootDir, "samples/" + zipName));
  await idle();
  assert.equal(await page.locator(".import-loaded").textContent(), "Loaded: local/" + zipName);
  assert.deepEqual(errors, []);
  console.log("PASS: incomplete dataset recovery and no browser exceptions");
} catch (error) {
  console.error(await page.locator(".import-browser").textContent(), errors);
  await page.screenshot({ path: "screenshots/import-failure.png" });
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
