(function (root) {
  "use strict";
  const api = root.fnirsImportCatalog;
  const sizeLabel = bytes => bytes == null ? "" : bytes < 1024 ? bytes + " B" :
    bytes < 1048576 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / 1048576).toFixed(2) + " MB";

  function create({ input, meta, version, onLoad }) {
    const catalog = api.create({ version });
    let directory = "samples/", busy = false;
    const element = document.createElement("div");
    element.className = "import-browser";
    element.innerHTML = '<label for="importPath">Source path</label>' +
      '<form class="import-path-form"><input id="importPath" type="text" spellcheck="false" autocomplete="off" aria-describedby="importHelp">' +
      '<button class="btn" type="submit">Open</button></form>' +
      '<div class="import-toolbar"><button type="button" class="btn" data-root="samples/">samples/</button>' +
      '<button type="button" class="btn" data-root="local/">local/</button><button type="button" class="btn" data-up>Up</button></div>' +
      '<div class="import-list" aria-label="Available files"></div>' +
      '<div class="import-toolbar"><button type="button" class="btn" data-files>Browse files</button>' +
      '<button type="button" class="btn" data-folder>Browse folder</button></div>' +
      '<p id="importHelp" class="import-help">Open a ZIP, SNIRF, or NIRx header. Local paths are relative to the selected folder.</p>' +
      '<p class="import-status" role="status" aria-live="polite"></p><p class="import-loaded"></p>';
    const pathInput = element.querySelector("#importPath");
    const list = element.querySelector(".import-list");
    const status = element.querySelector(".import-status");
    const loaded = element.querySelector(".import-loaded");
    const folderInput = document.createElement("input");
    folderInput.type = "file";
    folderInput.id = "importFolder";
    folderInput.webkitdirectory = true;
    folderInput.multiple = input.multiple = true;
    folderInput.hidden = input.hidden = true;
    input.className = "";
    meta.className = "import-error";
    meta.setAttribute("role", "alert");
    element.append(input, folderInput, meta);

    function setBusy(value) {
      busy = value;
      element.setAttribute("aria-busy", String(value));
      element.querySelectorAll("input, button").forEach(control => { control.disabled = value; });
      if (!value) element.querySelector("[data-up]").disabled = !directory;
    }

    function render() {
      pathInput.value = directory;
      pathInput.title = directory;
      element.querySelectorAll("[data-root]").forEach(button => {
        button.setAttribute("aria-pressed", String(directory.startsWith(button.dataset.root)));
      });
      list.replaceChildren();
      for (const entry of catalog.list(directory)) {
        const row = document.createElement("div");
        row.className = "import-file";
        row.dataset.path = entry.path;
        const name = document.createElement("button");
        name.type = "button";
        name.className = "import-filename";
        name.textContent = entry.name + (entry.directory ? "/" : "");
        name.title = entry.path;
        name.setAttribute("aria-label", (entry.directory ? "Browse " : "Open ") + entry.name);
        const loadable = entry.directory || api.isRecording(entry.path);
        name.disabled = !loadable;
        name.dataset.unloadable = String(!loadable);
        name.onclick = () => run(() => entry.directory ? navigate(entry.path) : open(entry.path));
        const details = document.createElement("span");
        details.className = "import-file-detail";
        details.textContent = entry.directory ? "Folder" : [entry.name.split(".").pop().toUpperCase(), sizeLabel(entry.size)].filter(Boolean).join(" | ");
        row.append(name, details);
        if (!entry.directory) {
          const actions = document.createElement("div");
          actions.className = "import-file-actions";
          const download = button("Download", () => run(() => downloadFile(entry.path)));
          download.setAttribute("aria-label", "Download " + entry.name);
          actions.append(download);
          if (/\.zip$/i.test(entry.path)) {
            const browse = button("Browse ZIP", () => run(async () => navigate(await catalog.expand(entry.path))));
            browse.setAttribute("aria-label", "Browse ZIP " + entry.name);
            actions.prepend(browse);
          }
          row.append(actions);
        }
        list.append(row);
      }
      if (!list.childElementCount) {
        const empty = document.createElement("p");
        empty.className = "import-empty";
        empty.textContent = "No files selected. Browse files or choose a folder.";
        list.append(empty);
      }
      setBusy(busy);
      restoreFileButtons();
    }

    function restoreFileButtons() {
      element.querySelectorAll('[data-unloadable="true"]').forEach(button => { button.disabled = true; });
    }
    function button(label, action) {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "btn";
      node.textContent = label;
      node.onclick = action;
      return node;
    }
    function navigate(path) {
      const normalized = api.normalize(path);
      catalog.list(normalized); // Validate before changing the visible folder.
      directory = normalized ? normalized + "/" : "";
      render();
    }
    async function open(path) {
      const key = api.normalize(path);
      await catalog.reveal(key);
      if (String(path).endsWith("/") && /\.zip$/i.test(key)) await catalog.expand(key);
      if ((!/\.zip$/i.test(key) || String(path).endsWith("/")) && catalog.hasDirectory(key)) return navigate(key);
      const prepared = await catalog.prepare(key);
      if (prepared.directory) {
        navigate(prepared.directory);
        status.textContent = prepared.message;
        return;
      }
      status.textContent = "Loading " + prepared.path + "...";
      const result = await onLoad(prepared.files, { source: prepared.source, samplePath: prepared.path, protocol: prepared.protocol });
      if (result === false) {
        loaded.textContent = "";
        status.textContent = "Import failed. Check the file and try again.";
        return;
      }
      if (!prepared.protocol) loaded.textContent = "Loaded: " + prepared.path;
      status.textContent = prepared.protocol ? "Protocol imported." : "Recording loaded.";
      navigate(api.parent(prepared.path));
    }
    async function downloadFile(path) {
      const file = await catalog.read(path);
      const url = URL.createObjectURL(file), link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      status.textContent = "Download prepared: " + file.name;
      render();
    }
    async function run(action) {
      if (busy) return;
      setBusy(true);
      status.textContent = "Opening...";
      try {
        await action();
        if (status.textContent === "Opening...") status.textContent = "";
      } catch (error) {
        status.textContent = error.message || String(error);
      } finally {
        setBusy(false);
        restoreFileButtons();
      }
    }
    async function selectFiles(picker) {
      const files = Array.from(picker.files || []);
      picker.value = "";
      if (!files.length) return;
      await run(async () => {
        const selected = catalog.addLocal(files);
        navigate(selected.directory);
        if (selected.candidates.length === 1) await open(selected.candidates[0]);
        else status.textContent = selected.candidates.length ? "Choose a recording to load." : "Select a NIRx header with its .wl1 and .wl2 files, a ZIP, or a SNIRF file.";
      });
    }
    input.onchange = () => selectFiles(input);
    folderInput.onchange = () => selectFiles(folderInput);
    element.querySelector("form").onsubmit = event => { event.preventDefault(); run(() => open(pathInput.value)); };
    element.querySelectorAll("[data-root]").forEach(node => { node.onclick = () => run(() => navigate(node.dataset.root)); });
    element.querySelector("[data-up]").onclick = () => run(() => navigate(api.parent(directory.replace(/\/$/, ""))));
    element.querySelector("[data-files]").onclick = () => input.click();
    element.querySelector("[data-folder]").onclick = () => folderInput.click();
    render();
    return { element };
  }

  root.fnirsImportPanel = { create };
})(window);
