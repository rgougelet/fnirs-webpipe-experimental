(function (root) {
  "use strict";
  function render(host, model) {
    const { el, button, table, number } = root.fnirsGlmUi;
    const { design, metadata } = model;
    host.replaceChildren();
    host.append(el("h2", "Design Matrix"), el("p",
      design.times.length + " rows x " + design.columns.length + " columns | " + metadata.samplingRate + " Hz | "
      + metadata.excludedSamples + " excluded samples | rank " + (metadata.rank ?? "deficient / unavailable"), "glm-summary"));
    if (!design.times.length) { host.append(el("p", "No samples remain after exclusions.")); return; }
    const scroll = el("div", undefined, "glm-scroll");
    const heatmap = el("div", undefined, "glm-heatmap");
    heatmap.style.width = Math.max(440, design.columns.length * 95 + 75) + "px";
    const headings = el("div", undefined, "glm-heatmap-labels");
    headings.style.gridTemplateColumns = "75px repeat(" + design.columns.length + ", minmax(0, 1fr))";
    headings.append(el("span", "Time (s)"));
    design.columns.forEach(column => { const name = el("span", column.label); name.title = column.id; headings.append(name); });
    const plot = el("div", undefined, "glm-heatmap-plot");
    const ticks = el("div", undefined, "glm-heatmap-times");
    for (let i = 0; i <= 4; i += 1) ticks.append(el("span", number(design.times[Math.round(i * (design.times.length - 1) / 4)])));
    const canvas = el("canvas");
    canvas.width = design.columns.length * 80;
    canvas.height = 320;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Design matrix heatmap: columns are regressors and rows are retained samples. Exact values are in the table below.");
    const context = canvas.getContext("2d");
    const ranges = design.columns.map(column => {
      let min = Infinity, max = -Infinity;
      column.values.forEach(value => { min = Math.min(min, value); max = Math.max(max, value); });
      return { min, max, scale: Math.max(Math.abs(min), Math.abs(max)) || 1 };
    });
    design.columns.forEach((column, j) => {
      for (let pixel = 0; pixel < 320; pixel += 1) {
        const first = Math.floor(pixel * design.times.length / 320);
        const end = Math.max(first + 1, Math.floor((pixel + 1) * design.times.length / 320));
        let sum = 0;
        for (let i = first; i < end; i += 1) sum += column.values[i];
        const value = sum / (end - first) / ranges[j].scale;
        const fade = Math.round(245 - Math.min(1, Math.abs(value)) * 180);
        context.fillStyle = value < 0 ? "rgb(" + fade + "," + fade + ",235)" : "rgb(235," + fade + "," + fade + ")";
        context.fillRect(j * 80, pixel, 80, 1);
      }
    });
    plot.append(ticks, canvas); heatmap.append(headings, plot); scroll.append(heatmap); host.append(scroll);
    host.append(el("p", "Blue = negative; white = zero; red = positive. Color scales independently per column. Each stripe averages up to "
      + Math.ceil(design.times.length / 320) + " retained rows. Time labels retain the original clock across cuts.", "task-help"));
    const rangesHost = el("div", undefined, "glm-scroll");
    rangesHost.append(table(["Regressor", "ID", "Minimum", "Maximum"], design.columns.map((column, j) =>
      [column.label, column.id, number(ranges[j].min), number(ranges[j].max)])));
    host.append(rangesHost, el("h3", "Exact matrix values"));
    const pager = el("div", undefined, "glm-toolbar"), values = el("div", undefined, "glm-scroll"), position = el("span");
    let page = 0;
    const previous = button("Previous rows", () => { page -= 1; drawRows(); });
    const next = button("Next rows", () => { page += 1; drawRows(); });
    function drawRows() {
      const start = page * 12, end = Math.min(start + 12, design.times.length);
      position.textContent = "Rows " + (start + 1) + "-" + end + " of " + design.times.length;
      previous.disabled = page === 0; next.disabled = end === design.times.length;
      values.replaceChildren(table(["Sample (0-based)", "Time (s)", ...design.columns.map(column => column.label)],
        Array.from({ length: end - start }, (_, k) => {
          const i = start + k;
          return [design.rowIndices[i], design.times[i], ...design.columns.map(column => column.values[i])];
        })));
    }
    pager.append(previous, position, next); host.append(pager, values); drawRows();
  }
  root.fnirsGlmMatrixView = { render };
})(window);
