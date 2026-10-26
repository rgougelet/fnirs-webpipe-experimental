(function (root) {
  "use strict";
  function element(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, action) {
    const el = element("button", text, "btn");
    el.type = "button";
    el.onclick = action;
    return el;
  }
  function create(options) {
    const container = element("div", undefined, "task-panel");
    const summary = element("p");
    const dialog = element("dialog", undefined, "task-dialog");
    dialog.id = "taskDesignDialog";
    dialog.setAttribute("aria-labelledby", "taskDesignTitle");
    const header = element("div", undefined, "task-dialog-header");
    const title = element("h2", "GLM design preview");
    title.id = "taskDesignTitle";
    header.append(title, button("Close", () => dialog.close()));
    const toolbar = element("div", undefined, "task-toolbar");
    const recordingButton = button("Use recording", () => selectSource(false));
    toolbar.append(recordingButton, button("Synthetic example", () => selectSource(true)));
    const description = element("p", undefined, "task-help");
    const form = element("div", undefined, "task-form");
    const status = element("p", undefined, "task-status");
    status.setAttribute("role", "status");
    const plot = element("div", undefined, "design-plot");
    const model = element("p", "Double-gamma HRF: delays 6/16 s, dispersions 1/1, ratio 6, support 32 s; unit integral. Preview uses the original recording clock; cut intervals do not shift events.", "task-help");
    const limit = element("p", "This quick preview uses a reduced grid. Open the Design Matrix and GLM Fit tabs for full-resolution HbO/HbR fitting.", "task-help");
    const csvButton = button("Download design CSV", () => {
      if (!currentDesign) return;
      const blob = new Blob([root.fnirsDesign.designCsv(currentDesign)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = element("a");
      anchor.href = url;
      anchor.download = demoMode ? "synthetic-design-preview.csv" : "recording-design-preview.csv";
      anchor.hidden = true;
      dialog.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    dialog.append(header, toolbar, description, form, status, plot, model, limit, csvButton);
    container.append(summary, button("Open task design", () => {
      selectSource(!options.getRecording());
      dialog.showModal();
    }), dialog);
    let demoMode = false;
    let demoConfig = { conditions: [] };
    let currentDesign = null;
    let invalidInputs = new Set();
    function source() { return demoMode ? root.fnirsDesign.syntheticExample() : options.getRecording(); }
    function config() { return demoMode ? demoConfig : options.getConfig(); }
    function updateSetting(id, patch) {
      const next = root.fnirsTaskEvents.normalizeConfig(config());
      const item = next.conditions.find(condition => condition.id === id);
      if (item) Object.assign(item, patch);
      else next.conditions.push({ id, label: "", durationSeconds: null, ...patch });
      if (demoMode) demoConfig = next;
      else options.setConfig(next);
      refreshPreview();
    }
    function renderForm() {
      form.replaceChildren();
      invalidInputs = new Set();
      const dataset = source();
      if (!dataset) return;
      const table = element("table");
      const heading = element("tr");
      ["Condition", "Events", "Duration override (s)"].forEach(text => heading.appendChild(element("th", text)));
      const thead = element("thead");
      thead.appendChild(heading);
      const tbody = element("tbody");
      root.fnirsTaskEvents.listConditions(dataset.events, config()).forEach(condition => {
        const row = element("tr");
        const labelCell = element("td");
        const label = element("input");
        label.type = "text";
        label.value = condition.label || condition.id;
        label.setAttribute("aria-label", "Condition label " + condition.id);
        label.onchange = () => updateSetting(condition.id, { label: label.value });
        labelCell.append(label, element("small", condition.id));
        const durationCell = element("td");
        const duration = element("input");
        duration.type = "number";
        duration.min = "0";
        duration.step = "any";
        duration.value = condition.durationSeconds == null ? "" : String(condition.durationSeconds);
        duration.setAttribute("aria-label", "Duration seconds " + condition.id);
        const imported = condition.events.map(event => event.durationSeconds);
        const missing = imported.some(value => value === null || value === undefined);
        const distinct = [...new Set(imported)];
        duration.placeholder = missing ? "Required" : distinct.length === 1 ? "Imported: " + distinct[0] : "Imported: per event";
        duration.oninput = () => {
          if (duration.validity.valid) {
            invalidInputs.delete(duration);
            updateSetting(condition.id, { durationSeconds: duration.value === "" ? null : Number(duration.value) });
          } else {
            invalidInputs.add(duration);
            refreshPreview();
          }
        };
        durationCell.append(duration);
        row.append(labelCell, element("td", String(condition.events.length)), durationCell);
        tbody.appendChild(row);
      });
      table.append(thead, tbody);
      form.append(table, element("p", "Blank uses each imported duration. Supply missing durations for NIRx markers; enter 0 for an impulse event. Overrides apply to all events in that condition. Recording settings are saved with the protocol.", "task-help"));
    }
    function refreshPreview() {
      currentDesign = null;
      csvButton.disabled = true;
      plot.replaceChildren();
      status.classList.remove("task-error");
      try {
        const dataset = source();
        if (!dataset) throw new Error("Load a recording or choose the synthetic example.");
        if (invalidInputs.size) throw new Error("Durations must be finite, nonnegative numbers.");
        const resolved = root.fnirsTaskEvents.resolveEvents(dataset.events, config());
        const missing = resolved.filter(event => !Number.isFinite(event.durationSeconds));
        if (missing.length) throw new Error("Set durations for " + missing.length + " event(s) before generating regressors.");
        // A bounded grid of actual recording sample times keeps interactive preview responsive.
        const stride = Math.max(1, Math.ceil(dataset.samplingRate / 2), Math.ceil(dataset.sampleCount / 12000));
        const rate = dataset.samplingRate / stride;
        currentDesign = root.fnirsDesign.buildDesign(resolved, rate, Math.ceil(dataset.sampleCount / stride));
        root.fnirsDesignPlot.render(plot, currentDesign);
        status.textContent = resolved.length + " events; " + (currentDesign.columns.length - 1) + " condition regressors + intercept; grid "
          + (1 / rate).toFixed(3) + " s. " + currentDesign.warnings.join(" ");
        csvButton.disabled = false;
      } catch (error) {
        status.textContent = error.message;
        status.classList.add("task-error");
      }
    }
    function selectSource(useDemo) {
      demoMode = useDemo;
      const dataset = source();
      recordingButton.disabled = !options.getRecording();
      description.textContent = demoMode
        ? "SYNTHETIC EXAMPLE: six illustrative 8 s blocks in a 180 s recording. This is not the Brazil study protocol. Your recording and its settings remain separate."
        : "Recording: " + (dataset ? dataset.label : "none") + ". Inspect condition timing before specifying a GLM.";
      renderForm();
      refreshPreview();
    }
    function refresh() {
      const dataset = options.getRecording();
      summary.textContent = dataset ? dataset.events.length + " task markers. Configure labels and durations, then inspect predicted responses."
        : "Inspect a synthetic task design now, or load a recording to configure its events.";
      if (dialog.open) selectSource(demoMode);
    }
    refresh();
    return { element: container, refresh, open: () => { selectSource(!options.getRecording()); dialog.showModal(); }, destroy: () => { if (dialog.open) dialog.close(); container.remove(); } };
  }
  root.fnirsTaskPanel = { create };
})(window);
