// Bridge current recording controls to the isolated GLM workspace.
function getGlmRecordingState() {
  const requested = getRequestedFilterSpec();
  const validated = validateFilterSpec(samplingRate, requested);
  const text = trimStepEnabled && exclusionTable ? exclusionTable.value.trim() : "";
  let intervalError = recordingGlmIssue;
  const intervals = [];
  text.split(/\r?\n/).filter(line => line.trim()).forEach((line, i) => {
    const fields = line.split(",").map(value => value.trim());
    const [start, end] = fields.map(Number);
    if (fields.length !== 2 || fields.some(value => !value) || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      intervalError = "Invalid cut interval on line " + (i + 1) + ". Enter start,end in seconds.";
    } else intervals.push({ start, end });
  });
  if (filterStepEnabled && ((lowCutEnabled && requested.highpassPassHz === null) || (highCutEnabled && requested.lowpassPassHz === null))) {
    intervalError = "Enter a numeric cutoff for each enabled filter stage before fitting.";
  }
  return { appVersion: APP_VERSION, dataRef: data.wl1, label: datasetLabel,
    samplingRate, sampleCount: data.wl1?.length || 0, events, taskConfig, glmConfig,
    channel: channelLabels[currentChannel] || "Channel " + (currentChannel + 1), channelIndex: currentChannel,
    filter: filterStepEnabled && validated.enabled ? validated : null, dcRestore: isDcRestoreEnabled(),
    intervals, intervalError, mbll: getCurrentMbllConfig(), synthetic: false };
}
