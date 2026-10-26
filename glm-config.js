(function (root) {
  "use strict";
  function normalize(config) {
    return { noiseModel: "ols", drift: config?.drift === "none" ? "none" : "linear" };
  }
  root.fnirsGlmConfig = { normalize };
})(globalThis.window || globalThis);
