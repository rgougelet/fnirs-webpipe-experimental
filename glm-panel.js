(function (root) {
  "use strict";
  function create(options) {
    const { el, button, download } = root.fnirsGlmUi;
    const element = el("section", undefined, "glm-workspace");
    element.id = "glmWorkspace"; element.hidden = true; element.setAttribute("role", "tabpanel");
    const toolbar = el("div", undefined, "glm-toolbar");
    const sourceLabel = el("p", undefined, "glm-summary");
    const recordingButton = button("Use recording", () => selectSource(false));
    const syntheticButton = button("Synthetic example", () => selectSource(true));
    const editButton = button("Configure events", () => options.openTask());
    const driftLabel = el("label", undefined, "glm-check");
    const drift = el("input"); drift.type = "checkbox"; drift.setAttribute("aria-label", "Include linear drift");
    driftLabel.append(drift, document.createTextNode("Linear drift"));
    const buildButton = button("Build design", () => prepare(false));
    const fitButton = button("Fit GLM", () => { if (model) runFit(); else prepare(true); });
    const cancelButton = button("Cancel", () => { invalidate("Computation cancelled. Build the design to continue."); updateButtons(); });
    const status = el("p", "Load a recording or choose the synthetic example.", "glm-status");
    status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const settings = el("p", undefined, "task-help");
    const warnings = el("p", undefined, "glm-warning");
    const content = el("div");
    const exports = el("div", undefined, "glm-toolbar");
    const designDownload = button("Download matrix CSV", () => {
      sync();
      if (model) download(root.fnirsGlmExport.designCsv(model.design), filename("design.csv"));
    });
    const resultsDownload = button("Download GLM ZIP", async () => {
      sync();
      if (!results || !model) return;
      const snapshot = model, fit = results;
      resultsDownload.disabled = true;
      try {
        const blob = await root.fnirsGlmExport.bundle(snapshot, fit);
        if (model === snapshot && results === fit) download(blob, filename("glm.zip"));
      } catch (error) { message(error.message, true); }
      updateButtons();
    });
    toolbar.append(recordingButton, syntheticButton, editButton, driftLabel, buildButton, fitButton, cancelButton);
    exports.append(designDownload, resultsDownload);
    element.append(toolbar, sourceLabel, settings, status, warnings, exports, content,
      el("p", "Exploratory OLS estimates. Temporal noise is not prewhitened; motion and short-channel nuisance terms are not modeled. No p-values or confidence intervals are calculated.", "task-help"));
    let demo = false, demoConfig = { drift: "linear" }, mode = "design";
    let worker = null, busy = false, model = null, results = null, signature = "", dataRef = null, lastAttempt = null;
    function state() {
      const recording = options.getState();
      if (!demo) return recording;
      return { ...root.fnirsDesign.syntheticExample(), appVersion: recording.appVersion, synthetic: true,
        channel: "Synthetic channel", channelIndex: 0, taskConfig: { conditions: [] }, glmConfig: demoConfig,
        intervals: [], filter: null, dcRestore: true };
    }
    function filename(suffix) { return (demo ? "synthetic" : "recording-channel-" + (model.metadata.channelIndex + 1)) + "-" + suffix; }
    function message(text, error = false) { status.textContent = text; status.classList.toggle("task-error", error); }
    function invalidate(text = "Settings changed. Build the design or fit again.") {
      if (worker) worker.terminate();
      worker = null; busy = false; model = null; results = null;
      content.replaceChildren(); warnings.textContent = ""; message(text); updateButtons();
    }
    function sync() {
      const snapshot = state();
      const next = JSON.stringify({ ...snapshot, dataRef: undefined });
      if (next !== signature || dataRef !== snapshot.dataRef) {
        invalidate(); signature = next; dataRef = snapshot.dataRef; lastAttempt = null;
      }
      drift.checked = root.fnirsGlmConfig.normalize(snapshot.glmConfig).drift === "linear";
      recordingButton.disabled = !options.getState().sampleCount;
      recordingButton.setAttribute("aria-pressed", String(!demo));
      syntheticButton.setAttribute("aria-pressed", String(demo));
      editButton.disabled = demo || !snapshot.sampleCount;
      sourceLabel.textContent = demo ? "SYNTHETIC EXAMPLE | six blocks with known response amplitudes"
        : snapshot.sampleCount ? snapshot.label + " | " + snapshot.channel + " | " + snapshot.samplingRate + " Hz" : "No recording loaded";
      settings.textContent = (snapshot.filter?.enabled ? "Matching task/data filter: " + (snapshot.filter.highpassPassHz ?? "off") + " Hz high-pass, "
        + (snapshot.filter.lowpassPassHz ?? "off") + " Hz low-pass; DC restore " + (snapshot.dcRestore ? "on" : "off") + ". " : "Filter off. ")
        + "Full recording at original sampling rate. Cut samples are excluded without shifting event times. Intercept included.";
      updateButtons();
      return snapshot;
    }
    function updateButtons() {
      buildButton.disabled = busy;
      fitButton.disabled = busy || !!model?.fitError;
      cancelButton.hidden = !busy;
      designDownload.disabled = busy || !model || !model.design.times.length;
      resultsDownload.disabled = busy || !results;
      element.setAttribute("aria-busy", String(busy));
    }
    function showContent() {
      if (!model) return;
      if (mode === "design") root.fnirsGlmMatrixView.render(content, model);
      else root.fnirsGlmResultsView.render(content, model, results);
      warnings.textContent = [...model.design.warnings, model.fitError].filter(Boolean).join(" ");
    }
    function prepare(fitAfter) {
      const snapshot = sync();
      invalidate("Building full-resolution design...");
      lastAttempt = signature;
      try {
        if (!snapshot.sampleCount) throw new Error("Load a recording or choose the synthetic example.");
        if (snapshot.sampleCount > 200000) throw new Error("This full-resolution recording exceeds the GLM limit of 200,000 samples.");
        if (snapshot.intervalError) throw new Error(snapshot.intervalError);
        const input = { ...snapshot, dataRef: undefined, ...(demo ? {} : options.readSignals()) };
        worker = new Worker("glm-worker.js?v=" + encodeURIComponent(snapshot.appVersion));
        const active = worker;
        worker.onerror = event => {
          if (worker !== active) return;
          busy = false; message("GLM worker failed: " + event.message, true); updateButtons();
        };
        worker.onmessage = ({ data }) => {
          sync();
          if (worker !== active) return;
          busy = false;
          if (data.error) { message(data.error, true); updateButtons(); return; }
          if (data.action === "prepare") {
            model = data; results = null;
            message(data.fitError || "Design ready. " + data.design.times.length + " retained samples; "
              + data.design.columns.length + " regressors.", !!data.fitError);
            showContent(); updateButtons();
            if (fitAfter && !model.fitError) runFit();
          } else {
            results = data.results;
            message("Fit complete. HbO and HbR estimates use " + results.hbo.n + " samples.");
            options.selectTab("glm");
            showContent(); updateButtons();
          }
        };
        busy = true; updateButtons(); worker.postMessage({ action: "prepare", input });
      } catch (error) { busy = false; message(error.message, true); updateButtons(); }
    }
    function runFit() {
      sync();
      if (!model) { prepare(true); return; }
      if (model.fitError) return;
      results = null; busy = true; message("Fitting HbO and HbR...");
      showContent(); updateButtons(); worker.postMessage({ action: "fit" });
    }
    function selectSource(useDemo) { demo = useDemo; sync(); prepare(false); }
    drift.onchange = () => {
      const next = { drift: drift.checked ? "linear" : "none" };
      if (demo) demoConfig = next; else options.setConfig(root.fnirsGlmConfig.normalize(next));
      sync();
    };
    function show(view) {
      const wasHidden = element.hidden, previous = mode;
      const visible = view === "design" || view === "glm";
      element.hidden = !visible;
      if (!visible) { sync(); return; }
      mode = view; element.setAttribute("aria-labelledby", "plot-tab-" + view);
      const snapshot = sync();
      if (model) { if (wasHidden || previous !== mode) showContent(); }
      else if ((wasHidden || previous !== mode) && snapshot.sampleCount && lastAttempt !== signature) prepare(false);
    }
    return { element, show, sync, invalidate };
  }
  root.fnirsGlmPanel = { create };
})(window);
