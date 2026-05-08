(function () {
  const DEFAULT_LINE_COLOR = "#0f172a";
  const DEFAULT_HEIGHT = 430;
  const MIN_HEIGHT = 220;
  const MAX_HEIGHT = 2400;
  const MIN_WIDTH = 300;

  function createPlotController(host, options = {}) {
    const controller = {
      host,
      options,
      chart: null,
      currentModel: null,
      chartSignature: "",
      cleanupFns: [],
      resizeObserver: null,
      suppressViewChange: false
    };

    if (typeof ResizeObserver !== "undefined" && host) {
      controller.resizeObserver = new ResizeObserver(() => {
        if (!controller.chart) return;
        controller.chart.setSize(getPlotSize(controller.host));
      });
      controller.resizeObserver.observe(host);
    }

    controller.setModel = model => setPlotModel(controller, model);
    controller.clear = () => clearPlotController(controller);
    controller.destroy = () => destroyPlotController(controller);
    return controller;
  }

  function destroyPlotController(controller) {
    clearPlotController(controller);
    if (controller && controller.resizeObserver) {
      controller.resizeObserver.disconnect();
      controller.resizeObserver = null;
    }
  }

  function clearPlotController(controller) {
    if (!controller) return;
    controller.currentModel = null;
    controller.chartSignature = "";
    controller.cleanupFns.forEach(fn => {
      try { fn(); } catch (e) {}
    });
    controller.cleanupFns = [];
    if (controller.chart) {
      controller.chart.destroy();
      controller.chart = null;
    }
    if (controller.host) controller.host.textContent = "";
  }

  function setPlotModel(controller, model) {
    if (!controller || !controller.host) return;
    const normalized = normalizePlotModel(model);
    if (!normalized) {
      clearPlotController(controller);
      return;
    }

    controller.currentModel = normalized;
    const signature = buildSignature(normalized);

    if (!controller.chart || controller.chartSignature !== signature) {
      recreateChart(controller, normalized, signature);
    } else {
      controller.suppressViewChange = true;
      // Recompute y-scale for each new data payload; preserving stale scales can make
      // channel/tab switches look blank when amplitudes differ substantially.
      controller.chart.setData([normalized.xData, normalized.yData], true);
      controller.chart.axes[1].label = normalized.yLabel;
      controller.chart.series[1].stroke = normalized.stroke;
      controller.chart.redraw();
      applyViewRange(controller, normalized.viewMin, normalized.viewMax);
      controller.suppressViewChange = false;
    }
  }

  function recreateChart(controller, model, signature) {
    clearPlotController(controller);
    controller.currentModel = model;
    controller.chartSignature = signature;
    const plotSize = getPlotSize(controller.host);
    const compact = plotSize.width < 900;

    const plugins = [
      createAnnotationPlugin(controller),
      createWheelPlugin(controller)
    ];

    const opts = {
      width: plotSize.width,
      height: plotSize.height,
      padding: [10, 12, 6, 8],
      legend: { show: false },
      select: { show: true },
      cursor: {
        drag: { x: true, y: false, setScale: true },
        focus: { prox: -1 },
        points: { show: false }
      },
      scales: {
        x: { time: false },
        y: { auto: true }
      },
      axes: [
        {
          scale: "x",
          side: 2,
          size: compact ? 48 : 56,
          gap: 8,
          label: "Time (s)",
          labelSize: compact ? 20 : 24,
          labelGap: compact ? 8 : 10,
          font: compact ? "12px sans-serif" : "13px sans-serif",
          labelFont: compact ? "600 12px sans-serif" : "600 13px sans-serif",
          stroke: "#0f172a",
          space: compact ? 56 : 72,
          values: (_u, splits) => splits.map(v => formatTimeSeconds(v)),
          grid: { stroke: "#dbe4ef", width: 1 },
          ticks: { stroke: "#94a3b8", width: 1, size: 6 },
          border: { stroke: "#0f172a", width: 1.2 }
        },
        {
          scale: "y",
          side: 3,
          size: compact ? 82 : 104,
          gap: compact ? 8 : 10,
          label: model.yLabel,
          labelSize: compact ? 26 : 34,
          labelGap: compact ? 8 : 10,
          font: compact ? "12px sans-serif" : "13px sans-serif",
          labelFont: compact ? "600 12px sans-serif" : "600 13px sans-serif",
          stroke: "#0f172a",
          space: compact ? 40 : 52,
          values: (u, splits) => {
            const min = Number.isFinite(u.scales.y.min) ? u.scales.y.min : 0;
            const max = Number.isFinite(u.scales.y.max) ? u.scales.y.max : min;
            return splits.map(v => formatAxisNumber(v, max - min));
          },
          grid: { stroke: "#e2e8f0", width: 1 },
          ticks: { stroke: "#94a3b8", width: 1, size: 6 },
          border: { stroke: "#0f172a", width: 1.2 }
        }
      ],
      series: [
        {},
        {
          stroke: model.stroke,
          width: 2
        }
      ],
      hooks: {
        setScale: [u => {
          if (controller.suppressViewChange || !controller.currentModel || !controller.options || typeof controller.options.onViewChange !== "function") return;
          if (!Number.isFinite(u.scales.x.min) || !Number.isFinite(u.scales.x.max)) return;
          controller.options.onViewChange({
            startSeconds: u.scales.x.min,
            endSeconds: u.scales.x.max,
            windowSeconds: u.scales.x.max - u.scales.x.min,
            durationSeconds: controller.currentModel.domainMax - controller.currentModel.domainMin
          });
        }]
      },
      plugins
    };

    controller.chart = new uPlot(opts, [model.xData, model.yData], controller.host);
    applyViewRange(controller, model.viewMin, model.viewMax);
  }

  function createAnnotationPlugin(controller) {
    return {
      hooks: {
        draw: [u => {
          const model = controller.currentModel;
          if (!model) return;
          const ctx = u.ctx;
          const left = u.bbox.left;
          const top = u.bbox.top;
          const width = u.bbox.width;
          const height = u.bbox.height;
          const xMin = u.scales.x.min;
          const xMax = u.scales.x.max;

          ctx.save();
          ctx.beginPath();
          ctx.rect(left, top, width, height);
          ctx.clip();

          if (Array.isArray(model.overlays)) {
            ctx.fillStyle = "rgba(148,163,184,0.18)";
            model.overlays.forEach(intv => {
              if (!intv || !Number.isFinite(intv.start) || !Number.isFinite(intv.end)) return;
              if (intv.end < xMin || intv.start > xMax) return;
              const x1 = left + u.valToPos(intv.start, "x");
              const x2 = left + u.valToPos(intv.end, "x");
              ctx.fillRect(x1, top, Math.max(1, x2 - x1), height);
            });
          }

          if (Array.isArray(model.events)) {
            ctx.strokeStyle = "#dc2626";
            ctx.fillStyle = "#b91c1c";
            ctx.lineWidth = 1.15;
            ctx.font = "12px sans-serif";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            let lastLabelX = -Infinity;

            model.events.forEach(event => {
              if (!event || !Number.isFinite(event.time)) return;
              if (event.time < xMin || event.time > xMax) return;
              const x = left + u.valToPos(event.time, "x");
              ctx.beginPath();
              ctx.moveTo(x, top);
              ctx.lineTo(x, top + height);
              ctx.stroke();

              if (x - lastLabelX >= 36) {
                ctx.fillText(eventDisplayLabel(event), x + 4, top + 6);
                lastLabelX = x;
              }
            });
          }

          ctx.restore();
        }]
      }
    };
  }

  function createWheelPlugin(controller) {
    return {
      hooks: {
        ready: [u => {
          const onWheel = event => {
            const model = controller.currentModel;
            if (!model) return;
            event.preventDefault();

            const xMin = Number.isFinite(u.scales.x.min) ? u.scales.x.min : model.viewMin;
            const xMax = Number.isFinite(u.scales.x.max) ? u.scales.x.max : model.viewMax;
            const currentRange = xMax - xMin;
            if (!Number.isFinite(currentRange) || currentRange <= 0) return;

            if (event.shiftKey) {
              const shift = currentRange * 0.12 * Math.sign(event.deltaY || event.deltaX || 0);
              const clamped = clampRange(xMin + shift, xMax + shift, model.domainMin, model.domainMax);
              applyViewRange(controller, clamped.min, clamped.max);
              return;
            }

            const rect = u.over.getBoundingClientRect();
            const cursorLeft = event.clientX - rect.left;
            const focusX = u.posToVal(cursorLeft, "x");
            const zoomFactor = event.deltaY < 0 ? 0.85 : 1.15;
            const nextRange = clampNumber(
              currentRange * zoomFactor,
              model.minWindowSeconds,
              model.domainMax - model.domainMin
            );

            const focusRatio = currentRange <= 0 ? 0.5 : (focusX - xMin) / currentRange;
            let nextMin = focusX - nextRange * focusRatio;
            let nextMax = nextMin + nextRange;
            const clamped = clampRange(nextMin, nextMax, model.domainMin, model.domainMax);
            applyViewRange(controller, clamped.min, clamped.max);
          };

          u.over.addEventListener("wheel", onWheel, { passive: false });
          controller.cleanupFns.push(() => u.over.removeEventListener("wheel", onWheel));
        }]
      }
    };
  }

  function applyViewRange(controller, min, max) {
    if (!controller || !controller.chart || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
    controller.suppressViewChange = true;
    controller.chart.batch(() => {
      controller.chart.setScale("x", { min, max });
    });
    controller.suppressViewChange = false;
  }

  function normalizePlotModel(model) {
    if (!model || !Array.isArray(model.yData) || !model.yData.length || !Number.isFinite(model.samplingRate) || model.samplingRate <= 0) {
      return null;
    }

    const startSeconds = Number.isFinite(model.startSeconds) ? model.startSeconds : 0;
    const domainMin = Number.isFinite(model.domainMin) ? model.domainMin : 0;
    const domainMax = Number.isFinite(model.domainMax) ? model.domainMax : (domainMin + model.yData.length / model.samplingRate);
    const xData = Array.from({ length: model.yData.length }, (_, idx) => startSeconds + idx / model.samplingRate);
    const fullSpan = Math.max(1 / model.samplingRate, domainMax - domainMin);
    const viewMin = Number.isFinite(model.viewMin) ? model.viewMin : startSeconds;
    const viewMax = Number.isFinite(model.viewMax) ? model.viewMax : (startSeconds + model.yData.length / model.samplingRate);

    return {
      yData: model.yData.slice(),
      xData,
      yLabel: model.yLabel || "Signal",
      stroke: model.stroke || DEFAULT_LINE_COLOR,
      events: Array.isArray(model.events) ? model.events.slice() : [],
      overlays: Array.isArray(model.overlays) ? model.overlays.slice() : [],
      domainMin,
      domainMax,
      viewMin,
      viewMax,
      minWindowSeconds: Math.max(1 / model.samplingRate, Math.min(fullSpan, Number.isFinite(model.minWindowSeconds) ? model.minWindowSeconds : (8 / model.samplingRate))),
      samplingRate: model.samplingRate
    };
  }

  function buildSignature(model) {
    return [
      model.yLabel,
      model.stroke
    ].join("|");
  }

  function getPlotSize(host) {
    const width = Math.max(MIN_WIDTH, Math.round(host && host.clientWidth ? host.clientWidth : 900));
    const hostHeight = host && host.clientHeight ? Math.round(host.clientHeight) : 0;
    let preferred = hostHeight > 0 ? hostHeight : Math.max(Math.round(width * 0.44), DEFAULT_HEIGHT);

    const panel = host && host.parentElement ? host.parentElement : null;
    if (panel && panel.classList && panel.classList.contains("plot-panel")) {
      const header = panel.querySelector(".plot-header");
      const headerHeight = header ? header.offsetHeight : 0;
      const panelGap = 8;
      const panelDerived = Math.round(panel.clientHeight - headerHeight - panelGap);
      if (panelDerived > 0) preferred = panelDerived;
    }

    const viewportDerived = Math.round((window.innerHeight || 900) - 210);
    const boundedMax = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, viewportDerived));
    const height = Math.max(MIN_HEIGHT, Math.min(boundedMax, preferred));
    return { width, height };
  }

  function clampRange(min, max, domainMin, domainMax) {
    const span = max - min;
    if (!Number.isFinite(span) || span <= 0) {
      return { min: domainMin, max: domainMax };
    }
    if (span >= (domainMax - domainMin)) {
      return { min: domainMin, max: domainMax };
    }
    let nextMin = min;
    let nextMax = max;
    if (nextMin < domainMin) {
      nextMax += (domainMin - nextMin);
      nextMin = domainMin;
    }
    if (nextMax > domainMax) {
      nextMin -= (nextMax - domainMax);
      nextMax = domainMax;
    }
    return { min: nextMin, max: nextMax };
  }

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatTimeSeconds(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "";
  }

  function formatAxisNumber(value, span) {
    if (!Number.isFinite(value)) return "";
    if (value === 0) return "0.00";
    const abs = Math.abs(value);
    if (abs < 0.005 || abs >= 1000) return value.toExponential(2);
    if (span < 0.01) return value.toExponential(2);
    if (abs >= 100) return value.toFixed(1);
    if (abs >= 10) return value.toFixed(2);
    if (span < 0.1) return value.toFixed(4);
    if (span < 1) return value.toFixed(3);
    return value.toFixed(2);
  }

  function eventDisplayLabel(event) {
    if (event && typeof event.label === "string" && event.label.trim()) return event.label.trim();
    if (event && Number.isFinite(event.code)) return "E" + event.code;
    return "E?";
  }

  window.fnirsPlot = {
    createPlotController,
    destroyPlotController
  };
})();
