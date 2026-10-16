(function (root) {
  "use strict";

  function conditionId(event) {
    return event.conditionId || ("nirx:" + event.code);
  }

  function normalizeEvents(events, samplingRate) {
    return (Array.isArray(events) ? events : [])
      .filter(event => event && Number.isFinite(event.sample))
      .map((event, index) => ({
        ...event,
        sample: Math.max(0, Math.round(event.sample)),
        onsetSeconds: Number.isFinite(event.onsetSeconds) ? event.onsetSeconds : event.sample / samplingRate,
        conditionId: conditionId(event),
        code: Number.isFinite(event.code) ? Math.round(event.code) : null,
        label: typeof event.label === "string" ? event.label : "",
        durationSeconds: Number.isFinite(event.durationSeconds) && event.durationSeconds >= 0 ? event.durationSeconds : null,
        amplitude: Number.isFinite(event.amplitude) ? event.amplitude : 1,
        markerIndex: index + 1
      }));
  }

  function parseNirxEvents(text) {
    return String(text).split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith("#"))
      .map(line => {
        const values = line.split(/\s+/).map(Number);
        if (values.length < 2 || !values.every(Number.isFinite)) return null;
        const fields = values.slice(1);
        const code = fields.length === 1 ? Math.round(fields[0])
          : fields.reduce((sum, value, index) => sum + (value ? 2 ** index : 0), 0);
        if (fields.length > 1 && !code) return null;
        return { sample: Math.round(values[0]), code, label: "E" + code,
          conditionId: "nirx:" + code, durationSeconds: null, amplitude: 1 };
      }).filter(Boolean);
  }

  function normalizeConfig(raw) {
    const seen = new Set();
    const conditions = (Array.isArray(raw && raw.conditions) ? raw.conditions : []).map(item => {
      if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id)) {
        throw new Error("Task condition IDs must be nonempty and unique.");
      }
      seen.add(item.id);
      const duration = item.durationSeconds;
      if (duration !== null && duration !== undefined && (!Number.isFinite(duration) || duration < 0)) {
        throw new Error("Task durations must be nonnegative seconds or null for imported durations.");
      }
      return { id: item.id, label: typeof item.label === "string" ? item.label.trim() : "",
        durationSeconds: duration === undefined ? null : duration };
    });
    return { conditions };
  }

  function listConditions(events, config) {
    const settings = new Map(normalizeConfig(config).conditions.map(item => [item.id, item]));
    const groups = new Map();
    events.forEach(event => {
      const id = conditionId(event);
      if (!groups.has(id)) groups.set(id, { id, label: event.label || id, events: [] });
      groups.get(id).events.push(event);
    });
    return [...groups.values()].map(group => ({ ...group, ...settings.get(group.id) }));
  }

  function resolveEvents(events, config) {
    const settings = new Map(normalizeConfig(config).conditions.map(item => [item.id, item]));
    return events.map(event => {
      const setting = settings.get(conditionId(event));
      return { ...event, conditionId: conditionId(event),
        label: setting && setting.label ? setting.label : (event.label || conditionId(event)),
        durationSeconds: setting && setting.durationSeconds !== null ? setting.durationSeconds : event.durationSeconds };
    });
  }

  root.fnirsTaskEvents = { conditionId, normalizeEvents, parseNirxEvents, normalizeConfig, listConditions, resolveEvents };
})(window);
