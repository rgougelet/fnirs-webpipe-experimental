function drawPlot(ctx, canvas, series, samplingRate, overlays, events, title, statsLine, options = {}) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const timeOffsetSeconds = options && Number.isFinite(options.timeOffsetSeconds) ? options.timeOffsetSeconds : 0;
  const seriesList = normalizeSeriesList(series, options);

  drawGrid(ctx, canvas);
  drawAxes(ctx, canvas, seriesList, samplingRate, timeOffsetSeconds);
  drawSeries(ctx, canvas, seriesList);

  if (overlays && overlays.length) {
    drawOverlays(ctx, canvas, overlays, series.length, samplingRate);
  }

  if (events && events.length) {
    drawEvents(ctx, canvas, events, series.length, samplingRate);
  }

  drawLabels(ctx, canvas, options && options.yLabel ? options.yLabel : "Intensity (a.u.)");
  if (seriesList.length > 1) drawLegend(ctx, canvas, seriesList);
}

function normalizeSeriesList(series, options) {
  if (options && Array.isArray(options.seriesList) && options.seriesList.length) {
    return options.seriesList
      .map(item => ({
        label: item && item.label ? String(item.label) : "",
        color: item && item.color ? String(item.color) : "#0f172a",
        data: Array.isArray(item && item.data) ? item.data : []
      }))
      .filter(item => item.data.length);
  }
  return [{
    label: "",
    color: "#0f172a",
    data: Array.isArray(series) ? series : []
  }];
}

function drawGrid(ctx, canvas) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1.2;

  for (let i = 0; i <= 10; i++) {
    const x = M.left + (i / 10) * w;
    ctx.beginPath();
    ctx.moveTo(x, M.top);
    ctx.lineTo(x, M.top + h);
    ctx.stroke();
  }

  for (let i = 0; i <= 6; i++) {
    const y = M.top + (i / 6) * h;
    ctx.beginPath();
    ctx.moveTo(M.left, y);
    ctx.lineTo(M.left + w, y);
    ctx.stroke();
  }
}

function drawAxes(ctx, canvas, seriesList, samplingRate, timeOffsetSeconds) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;

  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M.left, M.top);
  ctx.lineTo(M.left, M.top + h);
  ctx.lineTo(M.left + w, M.top + h);
  ctx.stroke();

  drawTicks(ctx, canvas, seriesList, samplingRate, timeOffsetSeconds);
}

function drawTicks(ctx, canvas, seriesList, samplingRate, timeOffsetSeconds) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const primary = Array.isArray(seriesList) && seriesList.length ? seriesList[0].data : [];
  const dur = primary.length / samplingRate;
  const extent = getSeriesCollectionExtent(seriesList);
  const minY = extent.min;
  const maxY = extent.max;
  const yRange = maxY - minY;
  const yTickCount = getYTickCount(minY, maxY);
  const xTickCount = getXTickCount(canvas.width);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "top";

  for (let i = 0; i <= xTickCount; i++) {
    const x = M.left + (i / xTickCount) * w;
    const tx = (timeOffsetSeconds + (dur * i / xTickCount)).toFixed(1);
    if (i === 0) ctx.textAlign = "left";
    else if (i === xTickCount) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    ctx.fillText(tx, x, M.top + h + 8);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= yTickCount; i++) {
    const y = M.top + h - (i / yTickCount) * h;
    const v = yRange === 0 ? minY : (minY + (i / yTickCount) * yRange);
    ctx.fillText(formatAxisNumber(v, yRange), M.left - 10, y);
  }
}

function drawSeries(ctx, canvas, seriesList) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const extent = getSeriesCollectionExtent(seriesList);
  const minY = extent.min;
  const maxY = extent.max;
  const span = maxY - minY || 1;

  seriesList.forEach(item => {
    const series = item.data;
    if (!series.length) return;
    ctx.strokeStyle = item.color || "#0f172a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (series.length === 1) {
      const y = M.top + h - ((series[0] - minY) / span) * h;
      ctx.moveTo(M.left, y);
      ctx.lineTo(M.left + w, y);
    } else {
      series.forEach((v, i) => {
        const x = M.left + (i / (series.length - 1)) * w;
        const y = M.top + h - ((v - minY) / span) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    ctx.stroke();
  });
}

function drawOverlays(ctx, canvas, intervals, nSamples, samplingRate) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const dur = nSamples / samplingRate;

  ctx.fillStyle = "rgba(203,213,225,0.6)";

  intervals.forEach(intv => {
    const x1 = M.left + (intv.start / dur) * w;
    const x2 = M.left + (intv.end / dur) * w;
    ctx.fillRect(x1, M.top, x2 - x1, h);
  });
}

function drawEvents(ctx, canvas, events, nSamples, samplingRate) {
  const w = canvas.width - M.left - M.right;
  const h = canvas.height - M.top - M.bottom;
  const dur = nSamples / samplingRate;

  ctx.strokeStyle = "#dc2626";
  ctx.fillStyle = "#dc2626";
  ctx.lineWidth = 1.4;
  ctx.font = "16px sans-serif";

  events.forEach(e => {
    const x = M.left + (e.time / dur) * w;

    ctx.beginPath();
    ctx.moveTo(x, M.top);
    ctx.lineTo(x, M.top + h);
    ctx.stroke();

    ctx.fillText(
      eventDisplayLabel(e),
      x + 4,
      M.top + 14
    );
  });
}

function getSeriesExtent(series) {
  if (!series || !series.length) return { min: 0, max: 0 };
  let min = series[0];
  let max = series[0];
  for (let i = 1; i < series.length; i++) {
    const value = series[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

function getSeriesCollectionExtent(seriesList) {
  let hasData = false;
  let min = 0;
  let max = 0;

  (Array.isArray(seriesList) ? seriesList : []).forEach(item => {
    if (!item || !Array.isArray(item.data) || !item.data.length) return;
    const extent = getSeriesExtent(item.data);
    if (!hasData) {
      min = extent.min;
      max = extent.max;
      hasData = true;
      return;
    }
    if (extent.min < min) min = extent.min;
    if (extent.max > max) max = extent.max;
  });

  return hasData ? { min, max } : { min: 0, max: 0 };
}

function eventDisplayLabel(event) {
  if (event && typeof event.label === "string" && event.label.trim()) return event.label.trim();
  if (event && Number.isFinite(event.code)) return "E" + event.code;
  return "E?";
}

function drawLabels(ctx, canvas, yLabel) {
  ctx.fillStyle = "#111827";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Time (s)", canvas.width / 2, canvas.height - 6);

  ctx.save();
  ctx.translate(M.left - 50, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(yLabel || "Intensity (a.u.)", 0, 0);
  ctx.restore();
}

function drawLegend(ctx, canvas, seriesList) {
  const entries = seriesList.filter(item => item && item.label);
  if (!entries.length) return;

  const boxWidth = 146;
  const boxHeight = 20 + entries.length * 22;
  const x = canvas.width - M.right - boxWidth;
  const y = M.top + 8;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeRect(x, y, boxWidth, boxHeight);
  ctx.font = "15px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  entries.forEach((item, idx) => {
    const rowY = y + 20 + idx * 22;
    ctx.strokeStyle = item.color || "#0f172a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, rowY);
    ctx.lineTo(x + 24, rowY);
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.fillText(item.label, x + 30, rowY);
  });
  ctx.restore();
}

function formatAxisNumber(v, span) {
  if (!Number.isFinite(v)) return "NaN";
  if (v === 0) return "0.00";
  const abs = Math.abs(v);
  if (abs < 0.005 || abs >= 1000) return v.toExponential(2);
  if (span < 0.01) return v.toExponential(2);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 10) return v.toFixed(2);
  if (span < 0.1) return v.toFixed(4);
  if (span < 1) return v.toFixed(3);
  return v.toFixed(2);
}

function getXTickCount(canvasWidth) {
  if (canvasWidth < 700) return 6;
  if (canvasWidth < 1000) return 8;
  return 10;
}

function getYTickCount(minY, maxY) {
  const maxAbs = Math.max(Math.abs(minY), Math.abs(maxY));
  if (maxAbs < 0.01 || maxAbs >= 1000) return 4;
  return 6;
}


function computeStats(series) {
  if (!Array.isArray(series) || !series.length) {
    return { mean: 0, median: 0, sd: 0, min: 0, max: 0 };
  }
  const sorted = [...series].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  const median = sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length);

  return {
    mean,
    median,
    sd,
    min: sorted[0],
    max: sorted[sorted.length - 1]
  };
}
