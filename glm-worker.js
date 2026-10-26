"use strict";
// Module URLs inherit the worker's release token to keep deployed assets aligned.
const version = new URL(self.location.href).search;
importScripts(...["filter.js", "physiology.js", "task-events.js", "design-matrix.js", "glm-config.js", "glm-solver.js", "glm-analysis.js"].map(file => file + version));
let model = null;
self.onmessage = ({ data }) => {
  try {
    if (data.action === "prepare") {
      model = null;
      model = self.fnirsGlmAnalysis.prepare(data.input);
      self.postMessage({ action: "prepare", design: model.design, metadata: model.metadata, fitError: model.fitError });
    } else if (data.action === "fit") {
      if (!model) throw new Error("Build a design before fitting.");
      self.postMessage({ action: "fit", results: self.fnirsGlmAnalysis.fit(model) });
    }
  } catch (error) { self.postMessage({ action: data.action, error: error.message }); }
};
