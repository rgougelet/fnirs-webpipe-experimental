(function (root) {
  "use strict";
  const dot = (a, b, start = 0) => {
    let sum = 0;
    for (let i = start; i < a.length; i += 1) sum += a[i] * b[i];
    return sum;
  };
  // Independent Householder QR with column pivoting. Normalize columns before
  // rank assessment; solve without forming X'X or inverting a matrix.
  function factor(columns) {
    const p = columns.length;
    const n = columns[0]?.values.length || 0;
    if (!p || n <= p) throw new Error("Too few retained samples: the fit needs more rows than regressors.");
    if (n > 200000 || p > 66 || n * p * p > 100000000) throw new Error("GLM size limit exceeded (200,000 rows / 100 million QR operations).");
    const scales = columns.map(column => {
      if (column.values.length !== n || !column.values.every(Number.isFinite)) throw new Error("Design contains invalid or misaligned values.");
      return Math.sqrt(dot(column.values, column.values));
    });
    const zero = scales.findIndex(value => !Number.isFinite(value) || value === 0);
    if (zero >= 0) throw new Error("Unestimable regressor: " + columns[zero].label + " [" + columns[zero].id + "] is zero or invalid after exclusions/filtering.");
    const a = columns.map((column, j) => Float64Array.from(column.values, value => value / scales[j]));
    const permutation = Array.from({ length: p }, (_, i) => i);
    const reflections = [];
    let minDiagonal = 1;
    for (let k = 0; k < p; k += 1) {
      let pivot = k;
      let best = dot(a[k], a[k], k);
      for (let j = k + 1; j < p; j += 1) {
        const norm2 = dot(a[j], a[j], k);
        if (norm2 > best) { pivot = j; best = norm2; }
      }
      [a[k], a[pivot]] = [a[pivot], a[k]];
      [permutation[k], permutation[pivot]] = [permutation[pivot], permutation[k]];
      const norm = Math.sqrt(best);
      if (norm < 1e-9) {
        const dependent = permutation.slice(k).map(j => columns[j].label + " [" + columns[j].id + "]");
        throw new Error("Design is rank deficient or nearly singular (rank " + k + "/" + p + "). Check dependent regressors: " + dependent.join(", ") + ".");
      }
      minDiagonal = Math.min(minDiagonal, norm);
      const alpha = a[k][k] >= 0 ? -norm : norm;
      const v = new Float64Array(n);
      v.set(a[k].subarray(k), k);
      v[k] -= alpha;
      const tau = 2 / dot(v, v, k);
      for (let j = k; j < p; j += 1) {
        const projection = tau * dot(v, a[j], k);
        for (let i = k; i < n; i += 1) a[j][i] -= projection * v[i];
      }
      a[k][k] = alpha;
      reflections.push({ v, tau, k });
    }
    return { n, p, rank: p, minDiagonal, a, reflections, permutation, scales };
  }
  function fit(qr, columns, signal, rowIndices) {
    const { n, p, a, reflections, permutation, scales } = qr;
    if (signal.length !== n || !signal.every(Number.isFinite)) throw new Error("Signal contains invalid or misaligned values.");
    const transformed = Float64Array.from(signal);
    reflections.forEach(({ v, tau, k }) => {
      const projection = tau * dot(v, transformed, k);
      for (let i = k; i < n; i += 1) transformed[i] -= projection * v[i];
    });
    const solution = new Float64Array(p);
    for (let i = p - 1; i >= 0; i -= 1) {
      let value = transformed[i];
      for (let j = i + 1; j < p; j += 1) value -= a[j][i] * solution[j];
      solution[i] = value / a[i][i];
    }
    const coefficients = new Float64Array(p);
    solution.forEach((value, i) => { coefficients[permutation[i]] = value / scales[permutation[i]]; });
    if (!coefficients.every(Number.isFinite)) throw new Error("The fit produced non-finite coefficients.");
    const fitted = new Float64Array(n);
    const residuals = new Float64Array(n);
    const mean = signal.reduce((sum, value) => sum + value, 0) / n;
    let sse = 0, total = 0, cross = 0, prevSquares = 0, nextSquares = 0, pairs = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < p; j += 1) fitted[i] += columns[j].values[i] * coefficients[j];
      residuals[i] = signal[i] - fitted[i];
      sse += residuals[i] ** 2;
      total += (signal[i] - mean) ** 2;
      if (i && (!rowIndices || rowIndices[i] === rowIndices[i - 1] + 1)) {
        cross += residuals[i] * residuals[i - 1];
        prevSquares += residuals[i - 1] ** 2;
        nextSquares += residuals[i] ** 2;
        pairs += 1;
      }
    }
    if (!Number.isFinite(sse) || !Number.isFinite(total)) throw new Error("The fit exceeded numerical range.");
    return { coefficients, fitted, residuals, observed: Float64Array.from(signal), n, rank: p, df: n - p,
      rmse: Math.sqrt(sse / n), residualSd: Math.sqrt(sse / (n - p)),
      rSquared: total > 1e-24 ? 1 - sse / total : null,
      lag1: prevSquares * nextSquares > 1e-24 ? cross / Math.sqrt(prevSquares * nextSquares) : null, adjacentPairs: pairs };
  }
  root.fnirsGlmSolver = { factor, fit };
})(globalThis.window || globalThis);
