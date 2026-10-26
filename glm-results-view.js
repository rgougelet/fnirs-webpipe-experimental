(function (root) {
  "use strict";
  function render(host, model, results) {
    const { el, table, number, trace } = root.fnirsGlmUi;
    host.replaceChildren();
    host.append(el("h2", "GLM Fit"), el("p", "Ordinary least squares | " + model.metadata.channel + " | HbO and HbR", "glm-summary"));
    if (!results) { host.append(el("p", "Fit the GLM to estimate task responses for this channel.", "task-help")); return; }
    const scroll = el("div", undefined, "glm-scroll");
    scroll.append(table(["Regressor", "ID", "HbO coefficient (uM)", "HbR coefficient (uM)"], model.design.columns.map((column, i) =>
      [column.label, column.id, number(results.hbo.coefficients[i]), number(results.hbr.coefficients[i])])));
    host.append(scroll);
    const diagnostics = el("div", undefined, "glm-scroll");
    diagnostics.append(table(["Diagnostic", "HbO", "HbR"], [
      ["Retained samples", results.hbo.n, results.hbr.n],
      ["Algebraic residual df (n - rank)", results.hbo.df, results.hbr.df],
      ["RMSE (uM)", number(results.hbo.rmse), number(results.hbr.rmse)],
      ["R-squared", number(results.hbo.rSquared), number(results.hbr.rSquared)],
      ["Residual lag-1 correlation", number(results.hbo.lag1), number(results.hbr.lag1)]
    ]));
    host.append(diagnostics, el("p", "Coefficients use the displayed HRF scaling. Impulse-event coefficients depend on the impulse mass convention. Residual correlation uses only adjacent original samples. Degrees of freedom are algebraic, not corrected for temporal correlation.", "task-help"));
    if (model.metadata.synthetic) host.append(el("p",
      "Synthetic truth: Emotional HbO 1.2 / HbR -0.5 uM; Neutral HbO 0.4 / HbR -0.15 uM. Small deterministic noise and a linear drift are included.", "glm-summary"));
    for (const [key, name] of [["hbo", "HbO"], ["hbr", "HbR"]]) {
      const plot = el("div", undefined, "design-plot glm-traces");
      const result = results[key];
      trace(plot, model.design, [{ name: "Observed " + name, values: result.observed, color: "#0284c7" },
        { name: "Fitted " + name, values: result.fitted, color: "#e11d48" }], name + ": observed and fitted");
      trace(plot, model.design, [{ name: name + " residual", values: result.residuals, color: "#8b5cf6" }], name + ": residual");
      host.append(plot);
    }
    host.append(el("p", "Traces are reduced for display only; the fit and CSV files use every retained sample. Gaps show excluded intervals.", "task-help"));
  }
  root.fnirsGlmResultsView = { render };
})(window);
