(function (root) {
  "use strict";
  const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
  function csv(headers, rows) {
    return [headers.map(quote).join(","), ...rows.map(row => row.map(value => typeof value === "string" ? quote(value) : value ?? "").join(","))].join("\r\n");
  }
  function designCsv(design) {
    return csv(["sample_index", "time_seconds", ...design.columns.map(column => column.label + " [" + column.id + "]")],
      Array.from(design.times, (time, i) => [design.rowIndices[i], time, ...design.columns.map(column => column.values[i])]));
  }
  function resultCsv(model, results) {
    const rows = [];
    for (const name of ["hbo", "hbr"]) {
      const fit = results[name];
      model.design.columns.forEach((column, i) => rows.push([model.metadata.label, model.metadata.channel, name, column.id,
        column.label, fit.coefficients[i], fit.n, fit.rank, fit.df, fit.rmse, fit.rSquared, fit.lag1]));
    }
    return csv(["dataset", "channel", "chromophore", "regressor_id", "regressor", "coefficient_uM", "n", "rank", "algebraic_df", "rmse_uM", "r_squared", "residual_lag1"], rows);
  }
  function tracesCsv(model, results) {
    return csv(["sample_index", "time_seconds", "hbo_observed_uM", "hbo_fitted_uM", "hbo_residual_uM", "hbr_observed_uM", "hbr_fitted_uM", "hbr_residual_uM"],
      Array.from(model.design.times, (time, i) => [model.design.rowIndices[i], time, ...["hbo", "hbr"].flatMap(name =>
        [results[name].observed[i], results[name].fitted[i], results[name].residuals[i]])]));
  }
  async function bundle(model, results) {
    const zip = new root.JSZip();
    zip.file("design.csv", designCsv(model.design));
    zip.file("coefficients.csv", resultCsv(model, results));
    zip.file("fitted-traces.csv", tracesCsv(model, results));
    zip.file("model.json", JSON.stringify({ ...model.metadata, columns: model.design.columns.map(({ id, label }) => ({ id, label })),
      warnings: model.design.warnings, exportedAt: new Date().toISOString() }, null, 2));
    return zip.generateAsync({ type: "blob" });
  }
  root.fnirsGlmExport = { designCsv, resultCsv, tracesCsv, bundle };
})(window);
