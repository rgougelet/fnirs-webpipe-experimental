(function (root) {
  "use strict";
  const colors = ["#0284c7", "#dc2626", "#16a34a", "#9333ea", "#c2410c", "#0891b2"];
  const ns = "http://www.w3.org/2000/svg";
  function node(tag, attrs, text) {
    const element = document.createElementNS(ns, tag);
    Object.entries(attrs || {}).forEach(([name, value]) => element.setAttribute(name, value));
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function render(host, design) {
    host.replaceChildren();
    const svg = node("svg", { viewBox: "0 0 900 270", role: "img", "aria-label": "HRF-convolved condition regressors over recording time" });
    svg.appendChild(node("title", {}, "Task design preview: response amplitude versus seconds"));
    svg.appendChild(node("text", { x: 65, y: 18 }, "Regressor amplitude (a.u.)"));
    const cols = design.columns.filter(column => column.id !== "intercept");
    let min = 0;
    let max = 0;
    cols.forEach(column => column.values.forEach(value => { min = Math.min(min, value); max = Math.max(max, value); }));
    const range = max - min || 1;
    const y = value => 220 - ((value - min) / range) * 185;
    const end = design.times[design.times.length - 1] || 1;
    const x = time => 65 + time / end * 810;
    for (let k = 0; k <= 4; k += 1) {
      const value = min + range * k / 4;
      svg.appendChild(node("line", { x1: 65, x2: 875, y1: y(value), y2: y(value), class: "design-grid" }));
      svg.appendChild(node("text", { x: 56, y: y(value) + 4, "text-anchor": "end" }, value.toFixed(2)));
      const time = end * k / 4;
      svg.appendChild(node("text", { x: x(time), y: 242, "text-anchor": "middle" }, time.toFixed(1)));
    }
    svg.appendChild(node("text", { x: 470, y: 264, "text-anchor": "middle" }, "Recording time (s)"));
    cols.forEach((column, i) => {
      const points = Array.from(design.times, (time, j) => x(time).toFixed(2) + "," + y(column.values[j]).toFixed(2)).join(" ");
      svg.appendChild(node("polyline", { points, fill: "none", stroke: colors[i % colors.length], "stroke-width": 2,
        "stroke-dasharray": i >= colors.length ? "5 3" : "none" }));
    });
    host.appendChild(svg);
    const legend = document.createElement("div");
    legend.className = "design-legend";
    cols.forEach((column, i) => {
      const label = document.createElement("span");
      label.style.borderColor = colors[i % colors.length];
      label.textContent = column.label + " (" + column.id + ")";
      legend.appendChild(label);
    });
    const intercept = document.createElement("span");
    intercept.textContent = "Intercept = 1 (included in CSV)";
    legend.appendChild(intercept);
    host.appendChild(legend);
  }
  root.fnirsDesignPlot = { render };
})(window);
