(function (root) {
  "use strict";
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    const node = el("button", text, "btn");
    node.type = "button";
    node.onclick = action;
    return node;
  }
  function table(headers, rows) {
    const node = el("table", undefined, "glm-table");
    const head = el("thead"), tr = el("tr"), body = el("tbody");
    headers.forEach(text => { const th = el("th", text); th.scope = "col"; tr.append(th); });
    head.append(tr);
    rows.forEach(values => { const row = el("tr"); values.forEach(value => row.append(el("td", String(value)))); body.append(row); });
    node.append(head, body);
    return node;
  }
  const number = value => value == null || !Number.isFinite(value) ? "n/a" : Number(value.toPrecision(5)).toString();
  function download(content, filename, type = "text/csv;charset=utf-8") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = el("a");
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function svg(tag, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function trace(host, design, series, label) {
    const chart = svg("svg", { viewBox: "0 0 900 235", role: "img", "aria-label": label });
    chart.append(svg("title", {}, label));
    let low = Infinity, high = -Infinity;
    series.forEach(item => item.values.forEach(value => { low = Math.min(low, value); high = Math.max(high, value); }));
    const span = high - low || 1, last = design.times.at(-1) || 1;
    const x = t => 70 + t / last * 805, y = v => 185 - (v - low) / span * 155;
    for (let i = 0; i <= 4; i += 1) {
      const value = low + i * span / 4, time = i * last / 4;
      chart.append(svg("line", { x1: 70, x2: 875, y1: y(value), y2: y(value), class: "design-grid" }),
        svg("text", { x: 62, y: y(value) + 4, "text-anchor": "end" }, number(value)),
        svg("text", { x: x(time), y: 205, "text-anchor": "middle" }, number(time)));
    }
    chart.append(svg("text", { x: 70, y: 17 }, label + " (uM)"),
      svg("text", { x: 480, y: 228, "text-anchor": "middle" }, "Original recording time (s)"));
    const stride = Math.max(1, Math.ceil(design.times.length / 1500));
    series.forEach(item => {
      let points = "", gap = true;
      for (let i = 0; i < design.times.length; i += 1) {
        if (i && design.rowIndices[i] !== design.rowIndices[i - 1] + 1) gap = true;
        if (i % stride && !gap && i !== design.times.length - 1) continue;
        points += (gap ? "M" : "L") + x(design.times[i]).toFixed(2) + " " + y(item.values[i]).toFixed(2);
        gap = false;
      }
      chart.append(svg("path", { d: points, fill: "none", stroke: item.color, "stroke-width": 1.6 }));
    });
    host.append(chart);
    const legend = el("div", undefined, "design-legend");
    series.forEach(item => { const name = el("span", item.name); name.style.borderColor = item.color; legend.append(name); });
    host.append(legend);
  }
  root.fnirsGlmUi = { el, button, table, number, download, trace };
})(window);
