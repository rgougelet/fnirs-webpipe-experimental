(function () {
  function findStep(steps, name) {
    return Array.isArray(steps) ? steps.find(step => step && step.step === name) : null;
  }

  function buildProtocolObject(deps) {
    const validated = deps.validatedFilter || { enabled: false };
    const mbllConfig = deps.mbllConfig || {};

    const protocol = {
      protocolSchemaVersion: deps.protocolSchemaVersion,
      appVersion: deps.appVersion,
      createdAt: new Date().toISOString(),
      datasetLabel: deps.datasetLabel,
      protocolLabel: deps.protocolLabel || "",
      selection: {
        wavelength: deps.currentWavelength,
        channelIndex: deps.currentChannel
      },
      steps: [
        {
          step: "transform_intensity_to_od",
          enabled: deps.signalDomain === "delta_od",
          output: "delta_od"
        },
        {
          step: "filter_butterworth_iir",
          enabled: deps.filterStepEnabled && validated.enabled,
          order: validated.enabled ? "auto" : null,
          lowHz: validated.highpassPassHz,
          highHz: validated.lowpassPassHz,
          lowSixDbHz: validated.highpassSixDbHz,
          highSixDbHz: validated.lowpassSixDbHz,
          edgePaddingEnabled: validated.edgePaddingEnabled,
          edgePaddingMode: validated.edgePaddingMode,
          edgePaddingSeconds: validated.edgePaddingSeconds,
          passbandRippleDb: deps.defaultPassbandRippleDb,
          stopbandAttenuationDb: deps.defaultStopbandAttenuationDb,
          implementation: deps.filterEngine,
          dcRestore: deps.dcRestore,
          plotView: deps.currentPlotMode,
          amplitudePreservation: deps.amplitudePreservationMode
        },
        {
          step: "trim",
          enabled: deps.trimStepEnabled,
          intervalsSeconds: deps.intervals
        },
        {
          step: "transform_od_to_hb_mbll",
          enabled: !!mbllConfig.supported,
          wavelengthsNm: [mbllConfig.wl1Nm, mbllConfig.wl2Nm],
          dpf: [mbllConfig.dpf1, mbllConfig.dpf2],
          channelDistanceMm: mbllConfig.distanceMm,
          distanceSource: mbllConfig.distanceSource,
          output: ["hbo_uM", "hbr_uM", "hbt_uM"]
        }
      ],
      notes: deps.notes || "",
      sources: {
        hdr: deps.sources.hdr,
        wl1: deps.sources.wl1,
        wl2: deps.sources.wl2,
        evt: deps.sources.evt,
        probeInfoMat: deps.sources.probeMat,
        samplingRateFrom: deps.sources.samplingRateFrom,
        eventsFrom: deps.sources.eventsFrom,
        channelLabelsFrom: deps.sources.channelLabelsFrom
      }
    };

    protocol.protocolSummary = buildProtocolSummary(protocol, deps);
    return protocol;
  }

  function buildProtocolSummary(protocol, deps) {
    const wl = protocol.selection && protocol.selection.wavelength ? protocol.selection.wavelength : deps.currentWavelength;
    const wlTxt = wl === "wl1" ? "760" : "850";
    const chIdx = protocol.selection && Number.isFinite(Number(protocol.selection.channelIndex))
      ? Number(protocol.selection.channelIndex)
      : deps.currentChannel;
    const channelLabels = Array.isArray(deps.channelLabels) ? deps.channelLabels : [];
    const chLbl = channelLabels[chIdx] ? channelLabels[chIdx] : ("ch" + String(chIdx + 1));
    const label = protocol.protocolLabel ? protocol.protocolLabel : "";
    const labelPart = label ? ("label=" + label + " | ") : "";
    const transformStep = findStep(protocol.steps, "transform_intensity_to_od");
    const domainPart = (transformStep && transformStep.enabled) ? "domain=delta_od" : "domain=intensity";

    let trimPart = "trim=none";
    const trimStep = findStep(protocol.steps, "trim");
    if (trimStep) {
      if (!trimStep.enabled) {
        trimPart = "trim=off";
      } else if (Array.isArray(trimStep.intervalsSeconds) && trimStep.intervalsSeconds.length) {
        const n = trimStep.intervalsSeconds.length;
        const ints = trimStep.intervalsSeconds
          .map(item => Number(item.start).toFixed(2) + "-" + Number(item.end).toFixed(2))
          .join(",");
        trimPart = "trim=" + n + " [" + ints + "]";
      }
    }

    let filterPart = "filter=off";
    const filterStep = findStep(protocol.steps, "filter_butterworth_iir");
    if (filterStep && filterStep.enabled) {
      const low = deps.numberOrNull(filterStep.lowHz);
      const high = deps.numberOrNull(filterStep.highHz);
      const lowSix = deps.numberOrNull(filterStep.lowSixDbHz);
      const highSix = deps.numberOrNull(filterStep.highSixDbHz);
      const padEnabled = !!filterStep.edgePaddingEnabled;
      const padSeconds = deps.numberOrNull(filterStep.edgePaddingSeconds);
      if (low !== null && high !== null) {
        filterPart = "filter=bp[" + deps.formatHz(lowSix) + " " + deps.formatHz(low) + " " + deps.formatHz(high) + " " + deps.formatHz(highSix) + "]";
      } else if (low !== null) {
        filterPart = "filter=hp[" + deps.formatHz(lowSix) + " " + deps.formatHz(low) + "]";
      } else if (high !== null) {
        filterPart = "filter=lp[" + deps.formatHz(high) + " " + deps.formatHz(highSix) + "]";
      } else {
        filterPart = "filter=on";
      }
      if (filterStep.dcRestore) filterPart += " dc";
      if (padEnabled) filterPart += " pad=zero:" + deps.formatHz(padSeconds) + "s";
      if (filterStep.amplitudePreservation === "rms_normalize_to_pre_filter") filterPart += " amp=rms";
    }

    let physiologyPart = "hb=off";
    const hbStep = findStep(protocol.steps, "transform_od_to_hb_mbll");
    if (hbStep && hbStep.enabled) {
      const dpf = Array.isArray(hbStep.dpf) ? hbStep.dpf.map(value => deps.formatHz(value)).join("/") : "?/?";
      physiologyPart = "hb=mbll dpf[" + dpf + "]";
    }

    return labelPart + "wl=" + wlTxt + " | ch=" + chLbl + " | " + domainPart + " | " + filterPart + " | " + trimPart + " | " + physiologyPart;
  }

  function encodeForUrl(obj) {
    try {
      const json = JSON.stringify(obj);
      return btoa(unescape(encodeURIComponent(json))).replace(/=+$/g, "");
    } catch {
      return null;
    }
  }

  function decodeForUrl(value) {
    const padLen = (4 - (value.length % 4)) % 4;
    const padded = value + "====".slice(0, padLen);
    return decodeURIComponent(escape(atob(padded)));
  }

  function parseProtocolFromHash(hash, deps) {
    const match = String(hash || "").match(/#protocol=([^&]+)/);
    if (!match) return null;

    try {
      const json = decodeForUrl(match[1]);
      const obj = JSON.parse(json);
      return normalizeProtocol(obj, deps);
    } catch {
      return null;
    }
  }

  function normalizeProtocol(raw, deps) {
    const out = {
      protocolSchemaVersion: deps.protocolSchemaVersion,
      appVersion: deps.appVersion,
      createdAt: raw && raw.createdAt ? raw.createdAt : new Date().toISOString(),
      datasetLabel: raw && typeof raw.datasetLabel === "string" ? raw.datasetLabel : deps.datasetLabel,
      protocolLabel: raw && typeof raw.protocolLabel === "string" ? raw.protocolLabel : "",
      selection: {
        wavelength: raw && raw.selection && raw.selection.wavelength === "wl1" ? "wl1" : "wl2",
        channelIndex: raw && raw.selection && Number.isFinite(Number(raw.selection.channelIndex))
          ? Number(raw.selection.channelIndex)
          : 0
      },
      steps: Array.isArray(raw && raw.steps) ? raw.steps : [],
      notes: raw && typeof raw.notes === "string" ? raw.notes : "",
      sources: raw && raw.sources && typeof raw.sources === "object" ? raw.sources : {},
      protocolSummary: raw && typeof raw.protocolSummary === "string" ? raw.protocolSummary : ""
    };

    if (!out.steps.length) {
      out.steps = [
        { step: "transform_intensity_to_od", enabled: false, output: "delta_od" },
        {
          step: "filter_butterworth_iir",
          enabled: false,
          order: null,
          lowHz: null,
          highHz: null,
          lowSixDbHz: null,
          highSixDbHz: null,
          edgePaddingEnabled: true,
          edgePaddingMode: "zero",
          edgePaddingSeconds: deps.minEdgePaddingSeconds,
          passbandRippleDb: deps.defaultPassbandRippleDb,
          stopbandAttenuationDb: deps.defaultStopbandAttenuationDb,
          implementation: "rjg_sos",
          dcRestore: true,
          plotView: "raw",
          amplitudePreservation: "none"
        },
        { step: "trim", enabled: true, intervalsSeconds: [] },
        {
          step: "transform_od_to_hb_mbll",
          enabled: true,
          wavelengthsNm: [760, 850],
          dpf: [deps.defaultDpf.wl1, deps.defaultDpf.wl2],
          channelDistanceMm: deps.defaultChannelDistanceMm,
          distanceSource: "default",
          output: ["hbo_uM", "hbr_uM", "hbt_uM"]
        }
      ];
    }

    let transformStep = findStep(out.steps, "transform_intensity_to_od");
    if (!transformStep) {
      transformStep = { step: "transform_intensity_to_od", enabled: false, output: "delta_od" };
      out.steps.unshift(transformStep);
    }
    transformStep.enabled = !!transformStep.enabled;
    transformStep.output = "delta_od";

    const trimStep = findStep(out.steps, "trim");
    if (trimStep) {
      trimStep.enabled = !!trimStep.enabled;
      if (!Array.isArray(trimStep.intervalsSeconds)) trimStep.intervalsSeconds = [];
      trimStep.intervalsSeconds = trimStep.intervalsSeconds
        .map(item => ({ start: Number(item.start), end: Number(item.end) }))
        .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.start < item.end);
    }

    const filterStep = findStep(out.steps, "filter_butterworth_iir");
    if (filterStep) {
      filterStep.enabled = !!filterStep.enabled;
      filterStep.order = filterStep.enabled ? "auto" : null;
      filterStep.lowHz = deps.numberOrNull(filterStep.lowHz);
      filterStep.highHz = deps.numberOrNull(filterStep.highHz);
      filterStep.lowSixDbHz = deps.numberOrNull(filterStep.lowSixDbHz);
      filterStep.highSixDbHz = deps.numberOrNull(filterStep.highSixDbHz);
      filterStep.edgePaddingEnabled = !!filterStep.edgePaddingEnabled;
      filterStep.edgePaddingMode = "zero";
      filterStep.edgePaddingSeconds = deps.numberOrNull(filterStep.edgePaddingSeconds) === null
        ? deps.minEdgePaddingSeconds
        : Math.max(deps.minEdgePaddingSeconds, Number(filterStep.edgePaddingSeconds));
      if (filterStep.lowHz !== null && filterStep.lowSixDbHz === null) {
        filterStep.lowSixDbHz = deps.deriveDefaultHighpassSixDbHz(filterStep.lowHz);
      }
      if (filterStep.highHz !== null && filterStep.highSixDbHz === null) {
        filterStep.highSixDbHz = deps.deriveDefaultLowpassSixDbHz(filterStep.highHz);
      }
      filterStep.passbandRippleDb = deps.numberOrNull(filterStep.passbandRippleDb) === null
        ? deps.defaultPassbandRippleDb
        : Number(filterStep.passbandRippleDb);
      filterStep.stopbandAttenuationDb = deps.numberOrNull(filterStep.stopbandAttenuationDb) === null
        ? deps.defaultStopbandAttenuationDb
        : Number(filterStep.stopbandAttenuationDb);
      filterStep.implementation = "rjg_sos";
      filterStep.dcRestore = typeof filterStep.dcRestore === "boolean" ? filterStep.dcRestore : true;
      filterStep.plotView = deps.normalizePlotMode(filterStep.plotView);
      filterStep.amplitudePreservation = "none";
    }

    let hbStep = findStep(out.steps, "transform_od_to_hb_mbll");
    if (!hbStep) {
      hbStep = {
        step: "transform_od_to_hb_mbll",
        enabled: true,
        wavelengthsNm: [760, 850],
        dpf: [deps.defaultDpf.wl1, deps.defaultDpf.wl2],
        channelDistanceMm: deps.defaultChannelDistanceMm,
        distanceSource: "default",
        output: ["hbo_uM", "hbr_uM", "hbt_uM"]
      };
      out.steps.push(hbStep);
    }
    hbStep.enabled = typeof hbStep.enabled === "boolean" ? hbStep.enabled : true;
    if (!Array.isArray(hbStep.dpf) || hbStep.dpf.length < 2) hbStep.dpf = [deps.defaultDpf.wl1, deps.defaultDpf.wl2];
    hbStep.dpf = hbStep.dpf.map((value, index) => {
      const fallback = index === 0 ? deps.defaultDpf.wl1 : deps.defaultDpf.wl2;
      const parsed = deps.numberOrNull(value);
      return parsed === null || parsed <= 0 ? fallback : parsed;
    }).slice(0, 2);
    hbStep.channelDistanceMm = deps.numberOrNull(hbStep.channelDistanceMm) === null ? deps.defaultChannelDistanceMm : Number(hbStep.channelDistanceMm);
    hbStep.distanceSource = typeof hbStep.distanceSource === "string" ? hbStep.distanceSource : "default";
    hbStep.output = ["hbo_uM", "hbr_uM", "hbt_uM"];

    out.protocolSummary = buildProtocolSummary(out, deps);
    return out;
  }

  function projectProtocolToUiState(protocol, deps) {
    const normalized = normalizeProtocol(protocol, deps);
    const trimStep = findStep(normalized.steps, "trim");
    const transformStep = findStep(normalized.steps, "transform_intensity_to_od");
    const hbStep = findStep(normalized.steps, "transform_od_to_hb_mbll");
    const filterStep = findStep(normalized.steps, "filter_butterworth_iir");

    let channelIndex = normalized.selection.channelIndex;
    if (Number.isFinite(deps.maxChannelCount) && deps.maxChannelCount > 0 && channelIndex >= deps.maxChannelCount) {
      channelIndex = deps.maxChannelCount - 1;
    }
    if (!Number.isFinite(channelIndex) || channelIndex < 0) channelIndex = 0;

    const requestedPlotView = filterStep && typeof filterStep.plotView === "string"
      ? deps.normalizePlotMode(filterStep.plotView)
      : deps.currentPlotMode;

    return {
      normalizedProtocol: normalized,
      protocolLabel: normalized.protocolLabel || "",
      notes: normalized.notes || "",
      wavelength: normalized.selection.wavelength === "wl2" ? "wl2" : "wl1",
      channelIndex: channelIndex,
      trimStepEnabled: !trimStep || !!trimStep.enabled,
      exclusionText: trimStep && Array.isArray(trimStep.intervalsSeconds)
        ? trimStep.intervalsSeconds.map(item => Number(item.start) + "," + Number(item.end)).join("\n")
        : "",
      signalDomain: transformStep && transformStep.enabled ? "delta_od" : "intensity",
      dpfWl1: hbStep && Array.isArray(hbStep.dpf) ? String(deps.numberOrNull(hbStep.dpf[0]) || deps.defaultDpf.wl1) : String(deps.defaultDpf.wl1),
      dpfWl2: hbStep && Array.isArray(hbStep.dpf) ? String(deps.numberOrNull(hbStep.dpf[1]) || deps.defaultDpf.wl2) : String(deps.defaultDpf.wl2),
      filter: filterStep ? {
        filterStepEnabled: !!filterStep.enabled,
        lowCutEnabled: !!filterStep.enabled && deps.numberOrNull(filterStep.lowHz) !== null,
        highCutEnabled: !!filterStep.enabled && deps.numberOrNull(filterStep.highHz) !== null,
        lowCutValue: deps.numberOrNull(filterStep.lowHz) === null ? "0.1" : String(filterStep.lowHz),
        lowCutSixDbValue: String(
          deps.numberOrNull(filterStep.lowSixDbHz) === null
            ? deps.deriveDefaultHighpassSixDbHz(filterStep.lowHz || 0.1)
            : filterStep.lowSixDbHz
        ),
        highCutValue: deps.numberOrNull(filterStep.highHz) === null ? "10.0" : String(filterStep.highHz),
        highCutSixDbValue: String(
          deps.numberOrNull(filterStep.highSixDbHz) === null
            ? deps.deriveDefaultLowpassSixDbHz(filterStep.highHz || 10.0)
            : filterStep.highSixDbHz
        ),
        dcRestore: !!filterStep.dcRestore,
        edgePaddingEnabled: !!filterStep.edgePaddingEnabled,
        edgePaddingSeconds: String(
          deps.numberOrNull(filterStep.edgePaddingSeconds) === null
            ? deps.minEdgePaddingSeconds
            : Math.max(deps.minEdgePaddingSeconds, Number(filterStep.edgePaddingSeconds))
        ),
        filterEngineValue: "rjg_sos",
        requestedPlotView: requestedPlotView
      } : {
        filterStepEnabled: true,
        lowCutEnabled: true,
        highCutEnabled: true,
        lowCutValue: "0.1",
        lowCutSixDbValue: "0.05",
        highCutValue: "10.0",
        highCutSixDbValue: "12.5",
        dcRestore: true,
        edgePaddingEnabled: true,
        edgePaddingSeconds: String(deps.minEdgePaddingSeconds),
        filterEngineValue: "rjg_sos",
        requestedPlotView: requestedPlotView
      }
    };
  }

  function buildProtocolShareObject(protocol) {
    return {
      protocolSchemaVersion: protocol.protocolSchemaVersion,
      protocolLabel: protocol.protocolLabel,
      selection: protocol.selection,
      steps: protocol.steps,
      notes: protocol.notes,
      protocolSummary: protocol.protocolSummary
    };
  }

  function defaultProtocolFilename(protocol, deps) {
    const base = deps.sanitizeFilename(protocol.datasetLabel || "fnirs-webpipe");
    const label = deps.sanitizeFilename((protocol.protocolLabel || "").trim());
    let name = base;
    if (label) name += "_" + label;
    return name + "_protocol.pipe";
  }

  window.fnirsProtocol = {
    buildProtocolObject,
    buildProtocolSummary,
    buildProtocolShareObject,
    decodeForUrl,
    defaultProtocolFilename,
    encodeForUrl,
    normalizeProtocol,
    parseProtocolFromHash,
    projectProtocolToUiState
  };
})();
