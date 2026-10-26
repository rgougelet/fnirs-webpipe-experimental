(function (root) {
  "use strict";

  const SAMPLES = [
    { path: "samples/nirx-demo-2026-02-18_002.zip", size: 632975 },
    { path: "samples/homer3-test.snirf", size: 7203050 }
  ];
  const basename = path => path.split("/").pop();
  const parent = path => path.slice(0, path.lastIndexOf("/") + 1);
  const isRecording = path => /\.(hdr|snirf|nirs|zip)$/i.test(path);

  function normalize(value) {
    const parts = [];
    for (const part of String(value).trim().replace(/\\/g, "/").split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!parts.length) throw new Error("Path is outside the available folders.");
        parts.pop();
      } else parts.push(part);
    }
    return parts.join("/");
  }

  function safeRelative(path) {
    const value = String(path).replace(/\\/g, "/");
    if (/^(\/|[a-z]:)/i.test(value) || value.split("/").includes("..")) {
      throw new Error("Invalid file path: " + path);
    }
    return normalize(value);
  }

  function create({ version = "", fetchFile = root.fetch?.bind(root), unzip = file => root.JSZip.loadAsync(file) } = {}) {
    const entries = new Map();
    const expanded = new Set();
    for (const sample of SAMPLES) entries.set(sample.path, {
      ...sample, source: "bundled-sample", name: basename(sample.path),
      read: async () => {
        const response = await fetchFile(sample.path + "?v=" + encodeURIComponent(version));
        if (!response.ok) throw new Error("Could not fetch " + sample.path + " (HTTP " + response.status + ").");
        return new File([await response.blob()], basename(sample.path));
      }
    });

    function get(path) {
      const entry = entries.get(normalize(path));
      if (!entry) throw new Error("File not found: " + path);
      return entry;
    }

    async function read(path) {
      const entry = get(path);
      if (!entry.promise) entry.promise = entry.read().then(file => {
        entry.size = file.size;
        return file;
      }).catch(error => { entry.promise = null; throw error; });
      return entry.promise;
    }

    function hasDirectory(path) {
      const key = normalize(path);
      return !key || key === "samples" || key === "local" || expanded.has(key) ||
        [...entries.keys()].some(name => name.startsWith(key + "/"));
    }

    function list(path) {
      const key = normalize(path);
      if (!hasDirectory(key)) throw new Error("Folder not found: " + path);
      if (!key) return ["samples", "local"].map(name => ({ name, path: name, directory: true }));
      const prefix = key + "/", children = new Map();
      for (const [name, entry] of entries) {
        if (!name.startsWith(prefix)) continue;
        const child = name.slice(prefix.length).split("/")[0];
        const childPath = prefix + child;
        if (!children.has(childPath)) children.set(childPath, entries.get(childPath) || {
          name: child, path: childPath, directory: true
        });
      }
      return [...children.values()].sort((a, b) => Number(!!b.directory) - Number(!!a.directory) ||
        Number(isRecording(b.path)) - Number(isRecording(a.path)) || a.name.localeCompare(b.name));
    }

    function addLocal(files) {
      const selected = Array.from(files || []), next = new Map(), seen = new Set();
      if (selected.length > 5000) throw new Error("Select a folder with at most 5,000 files.");
      for (const file of selected) {
        const path = "local/" + safeRelative(file.webkitRelativePath || file.name);
        if (seen.has(path.toLowerCase())) throw new Error("Duplicate file name: " + path + ". Select the containing folder instead.");
        seen.add(path.toLowerCase());
        next.set(path, { path, name: basename(path), size: file.size, source: "user-input", read: async () => file });
      }
      for (const key of entries.keys()) if (key.startsWith("local/")) entries.delete(key);
      for (const key of expanded) if (key.startsWith("local/")) expanded.delete(key);
      for (const [key, entry] of next) entries.set(key, entry);
      const paths = [...next.keys()], common = (paths.length ? parent(paths[0]) : "local/").split("/").filter(Boolean);
      while (common.length > 1 && paths.some(path => !path.startsWith(common.join("/") + "/"))) common.pop();
      return { directory: common.join("/") + "/", candidates: paths.filter(isRecording) };
    }

    async function expand(path) {
      const key = normalize(path);
      if (expanded.has(key)) return key + "/";
      if (!/\.zip$/i.test(key)) throw new Error("Select a ZIP file to browse its contents.");
      const zip = await unzip(await read(key));
      const members = Object.values(zip.files);
      if (members.length > 5000) throw new Error("ZIP contains more than 5,000 entries.");
      const added = new Map(), seen = new Set();
      for (const member of members) {
        safeRelative(member.unsafeOriginalName || member.name);
        const relative = safeRelative(member.name);
        if (member.dir || !relative || relative.split("/").includes("__MACOSX")) continue;
        if (seen.has(relative.toLowerCase())) throw new Error("Duplicate path in ZIP: " + relative);
        seen.add(relative.toLowerCase());
        const memberPath = key + "/" + relative;
        added.set(memberPath, {
          path: memberPath, name: basename(relative), source: get(key).source, size: null,
          read: async () => new File([await member.async("uint8array")], basename(relative))
        });
      }
      for (const [name, entry] of added) entries.set(name, entry);
      expanded.add(key);
      return key + "/";
    }

    function nirxPaths(path) {
      const folder = parent(path), stem = basename(path).replace(/\.hdr$/i, "").toLowerCase();
      const siblings = [...entries.values()].filter(entry => parent(entry.path) === folder);
      const find = name => siblings.find(entry => entry.name.toLowerCase() === name)?.path;
      const paths = [path];
      for (const extension of [".wl1", ".wl2"]) {
        const match = find(stem + extension);
        if (!match) throw new Error("Missing " + stem + extension + " in " + folder);
        paths.push(match);
      }
      const event = find(stem + ".evt");
      if (event) paths.push(event);
      const probe = find(stem + "_probeinfo.mat") || find("probeinfo.mat");
      if (probe) paths.push(probe);
      return paths;
    }

    async function reveal(path) {
      const parts = normalize(path).split("/");
      for (let i = 0; i < parts.length - 1; i += 1) {
        const ancestor = parts.slice(0, i + 1).join("/");
        if (/\.zip$/i.test(ancestor) && entries.has(ancestor)) await expand(ancestor);
      }
    }

    async function prepare(path) {
      const key = normalize(path);
      await reveal(key);
      const entry = get(key);
      if (/\.zip$/i.test(key)) {
        await expand(key);
        if (entries.has(key + "/protocol.pipe") || entries.has(key + "/protocol.json")) {
          return { files: [await read(key)], path: key, source: entry.source, protocol: true };
        }
        const candidates = [...entries.keys()].filter(name => name.startsWith(key + "/") && isRecording(name) &&
          !name.slice(key.length + 1).split("/").slice(0, -1).some(part => /\.zip$/i.test(part)));
        if (candidates.length !== 1) return { directory: key + "/", message: candidates.length
          ? "Choose a recording to load." : "No NIRx header or SNIRF recording found in this ZIP." };
        const result = await prepare(candidates[0]);
        return result.directory ? result : { ...result, path: key };
      }
      if (!isRecording(key)) throw new Error("Open a NIRx .hdr, SNIRF, or ZIP file to load a recording.");
      const paths = /\.hdr$/i.test(key) ? nirxPaths(key) : [key];
      return { files: await Promise.all(paths.map(read)), path: key, source: entry.source };
    }

    return { get, read, list, hasDirectory, addLocal, expand, reveal, prepare };
  }

  root.fnirsImportCatalog = { create, normalize, parent, isRecording };
})(typeof window !== "undefined" ? window : globalThis);
