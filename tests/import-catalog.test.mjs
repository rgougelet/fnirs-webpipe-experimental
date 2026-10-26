import assert from "node:assert/strict";
import test from "node:test";
import "../import-catalog.js";
const { create } = globalThis.fnirsImportCatalog;
const file = (path, text = path) => {
  const result = new File([text], path.split("/").pop());
  Object.defineProperty(result, "webkitRelativePath", { value: path });
  return result;
};
const archive = paths => ({ files: Object.fromEntries(paths.map(path => [path, {
  name: path, dir: false, async: async () => new TextEncoder().encode(path)
}])) });

test("NIRx companions match both directory and recording stem", async () => {
  const catalog = create();
  const selection = catalog.addLocal([
    file("session/a.hdr"), file("session/a.wl1", "correct wavelength"), file("session/A.WL2"),
    file("session/a.evt"), file("session/a_probeInfo.mat"), file("session/b.wl1", "wrong recording"),
    file("elsewhere/a.wl1", "wrong directory"), file("elsewhere/a.hdr")
  ]);
  assert.equal(selection.candidates.length, 2);
  const prepared = await catalog.prepare("local/session/a.hdr");
  assert.deepEqual(prepared.files.map(item => item.name), ["a.hdr", "a.wl1", "A.WL2", "a.evt", "a_probeInfo.mat"]);
  assert.equal(await prepared.files[1].text(), "correct wavelength");
  await assert.rejects(catalog.prepare("local/elsewhere/a.hdr"), /Missing a.wl2/);
});

test("local selection is atomic and replaces stale files and archive contents", async () => {
  const catalog = create({ unzip: async () => archive(["run/a.hdr", "run/a.wl1", "run/a.wl2"]) });
  catalog.addLocal([file("test.zip")]);
  await catalog.expand("local/test.zip");
  assert.ok(catalog.hasDirectory("local/test.zip/run"));
  assert.throws(() => catalog.addLocal([file("a.hdr"), file("a.hdr")]), /Duplicate/);
  assert.ok(catalog.hasDirectory("local/test.zip/run"));
  catalog.addLocal([file("new.snirf")]);
  assert.equal(catalog.hasDirectory("local/test.zip/run"), false);
  assert.equal(catalog.list("samples/").length, 2);
  assert.deepEqual(catalog.list("local/").map(entry => entry.name), ["new.snirf"]);
});

test("ZIP members remain real downloadable files and select correct companions", async () => {
  const catalog = create({ unzip: async () => archive([
    "run/a.hdr", "other/a.wl1", "run/a.wl1", "run/a.wl2", "run/readme.txt"
  ]) });
  catalog.addLocal([file("recording.zip")]);
  const result = await catalog.prepare("local/recording.zip");
  assert.equal(result.path, "local/recording.zip");
  assert.equal(await result.files[1].text(), "run/a.wl1");
  const member = await catalog.read("local/recording.zip/run/readme.txt");
  assert.equal(member.name, "readme.txt");
  assert.equal(await member.text(), "run/readme.txt");
  assert.equal(catalog.list("local/").length, 1);
});

test("archives with multiple recordings require a choice; protocol ZIPs retain their route", async () => {
  const catalog = create({ unzip: async () => archive(["a/run.snirf", "b/run.snirf"]) });
  catalog.addLocal([file("multi.zip")]);
  const selection = await catalog.prepare("local/multi.zip");
  assert.equal(selection.directory, "local/multi.zip/");
  assert.equal(selection.files, undefined);
  const protocol = create({ unzip: async () => archive(["protocol.pipe"]) });
  protocol.addLocal([file("protocol.zip")]);
  assert.equal((await protocol.prepare("local/protocol.zip")).protocol, true);
});

test("invalid paths and incomplete datasets fail before loading data", async () => {
  const catalog = create({ unzip: async () => archive(["../escape.snirf"]) });
  catalog.addLocal([file("bad.zip"), file("empty.hdr")]);
  await assert.rejects(catalog.expand("local/bad.zip"), /Invalid file path/);
  await assert.rejects(catalog.prepare("local/empty.hdr"), /Missing empty.wl1/);
  await assert.rejects(catalog.prepare("https://example.com/data.snirf"), /File not found/);
  assert.throws(() => catalog.list("../../"), /outside/);
  assert.equal(catalog.hasDirectory("local/bad.zip/escape"), false);
});

test("failed sample fetches can be retried and successful reads are cached", async () => {
  let attempts = 0;
  const catalog = create({ fetchFile: async () => ++attempts === 1
    ? { ok: false, status: 503 } : { ok: true, blob: async () => new Blob(["sample bytes"]) } });
  await assert.rejects(catalog.read("samples/homer3-test.snirf"), /HTTP 503/);
  const sample = await catalog.read("samples/homer3-test.snirf");
  assert.equal(await sample.text(), "sample bytes");
  assert.equal(await catalog.read("samples/homer3-test.snirf"), sample);
  assert.equal(attempts, 2);
});

test("typed archive paths expand lazily and nested ZIPs remain stable after browsing", async () => {
  const catalog = create({ unzip: async input => input.name === "outer.zip"
    ? archive(["nested.zip"]) : archive(["run/a.snirf"]) });
  catalog.addLocal([file("outer.zip")]);
  const member = await catalog.prepare("local/outer.zip/nested.zip/run/a.snirf");
  assert.equal(await member.files[0].text(), "run/a.snirf");
  const reopened = await catalog.prepare("local/outer.zip");
  assert.equal(reopened.path, "local/outer.zip");
  assert.equal(reopened.files.length, 1);
});
