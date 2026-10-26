# GLM fitting and the Design Matrix tab

Available in v0.5.0. All computations run locally in a browser worker.

## Workflow

1. Load a recording. In **Task Design > Open task design**, label conditions
   and supply missing NIRx durations. Blank retains imported durations; zero
   explicitly requests an impulse.
2. Select a channel, review its DPF values, filter settings, and cut intervals.
3. Open **Design Matrix** and choose **Build design**. The tab shows the actual
   matrix used for estimation, with a heatmap, per-column ranges, and a paged
   table of exact values.
4. Choose **Fit GLM**. **GLM Fit** displays both HbO and HbR coefficients,
   fit diagnostics, observed/fitted traces, and residuals for that channel.
5. **Download matrix CSV** exports every retained design row.
   **Download GLM ZIP** includes the matrix, coefficients, fitted traces,
   residuals, and a JSON model description.

**Synthetic example** creates an isolated 180 s six-block recording with
known HbO/HbR responses, linear drift, and small deterministic additive noise.
Synthetic task settings are independent of recording protocols.

## Model and preprocessing

The fit is ordinary least squares: y = X beta + residual. Columns comprise
one HRF-convolved regressor per condition, optional linear drift, and a
constant intercept. The drift is -1 at the first recording sample and +1 at
the last, before filtering or exclusions. The HRF and stimulus amplitude
conventions are specified in [task-design-preview.md](task-design-preview.md).

The full recording is modeled at its original sampling rate. There is no
decimation for fitting:

- Construct task regressors and drift on the original recording clock.
- Convert paired positive, finite CW intensities to delta OD.
- Apply the same fixed basic IIR filter, reflection padding, and optional
  mean restoration to the OD signals and the task/drift columns.
- Convert paired OD signals to relative HbO/HbR using the existing MBLL
  coefficients, DPF values, and channel distance.
- Include a constant intercept in the fitted signal space. This residual
  baseline is retained even when a high-pass filter removes a raw constant.
- Remove the same sample indices from X and y for enabled cut intervals.
  Intervals include both endpoints; overlaps are treated as a union. Events
  are not shifted or removed before convolution, so responses after a cut
  retain their correct timing and HRF tails.

Filtering occurs before exclusion, consistent with the waveform pipeline.
A cut therefore does not prevent an artifact inside it from influencing
neighboring filtered samples. Invalid intensities are rejected even within
cuts because they would enter OD conversion/filtering before exclusion.
RMS amplitude normalization is not used.

SNIRF fitting requires CW intensity measurements, a uniform sample clock,
times expressed in seconds, and probe positions expressed in millimeters.
When unit tags are absent, the existing importer assumes seconds/mm.
Uniformity is checked across the whole time vector against the inferred
grid, with tolerance max(1 microsecond, 0.001 sample periods).
Unsupported imported data may still be viewed in the waveform interface,
but the GLM explains why fitting is unavailable.
MBLL currently supports the toolbox's 760/850 nm wavelength pair only.

## Numerical method and diagnostics

An independent implementation of Householder QR with column pivoting solves
the least-squares problem without forming X'X. Columns are normalized for
numerical rank assessment; returned coefficients use the original scaling.
A remaining scaled QR diagonal below 1e-9 blocks estimation as singular or
nearly singular. A diagonal below 1e-5 produces an instability warning.
This diagnostic is not an estimated condition number.

No condition is silently merged or discarded. Identical, linearly dependent,
all-zero, or excluded task regressors require the user to revise the design.
There must be more retained rows than regressors.

Reported diagnostics:

- RMSE = sqrt(SSE / n).
- R-squared = 1 - SSE / centered total sum of squares; unavailable for a
  constant signal.
- Residual degrees of freedom = n - rank, an algebraic quantity.
- Residual lag-1 correlation is the normalized cross-product over adjacent
  original samples only; pairs crossing exclusions are omitted.

Coefficients follow the HRF's continuous unit-integral scaling, rather than
a peak-normalized response convention. Boxcar coefficients are in uM for a
unit-height condition regressor. Impulse coefficients depend on the
specified impulse mass convention and should not be interpreted directly
as peak Hb amplitudes.

This increment does not prewhiten temporal noise or estimate autocorrelation
for inference. It does not include motion regressors, robust weighting,
short-channel regression, contrasts, group models, p-values, standard
errors, or confidence intervals. OLS diagnostics are descriptive, not
evidence of statistically significant activation.

## Display, export, and reproducibility

Heatmap colors normalize independently by each column's maximum absolute
value. A stripe averages retained rows when there are more rows than image
pixels. The table and CSV preserve the unnormalized numerical values.
Rows are indexed by retained sample order; time labels retain original
recording seconds. Trace paths break at excluded intervals and may reduce
points for display only.

The ZIP contains:

- `design.csv`: original zero-based sample index, original seconds, and all
  condition/nuisance columns.
- `coefficients.csv`: dataset, channel, chromophore, regressor IDs/labels,
  coefficients, sample count, rank, algebraic df, RMSE, R-squared, and
  residual lag-1 correlation.
- `fitted-traces.csv`: original sample/time and observed, fitted, and
  residual HbO/HbR values.
- `model.json`: app version, channel, event definitions, HRF convention,
  sampling rate, filters, DPF/distance, cuts, drift, warnings, and model
  limitations.

Task/drift settings are saved in schema 3 protocols and protocol links.
Older protocols default to OLS with linear drift. Changing the recording,
channel, task definitions, filter, cuts, or MBLL settings invalidates the
displayed fit and disables stale exports. Computation can be cancelled.

Limits: 64 task conditions, 200,000 original samples, 5 million design cells,
20 million event-response evaluations, and 100 million estimated QR
operations. Size limits produce an explicit error rather than silently
reducing fitting resolution.

## Verification and references

Run `npm test`, `npm run ui:test:task`, and `npm run ui:test:glm`.
Tests cover analytic least-squares solutions, scale/pivot handling,
known-response recovery through intensity/OD/MBLL/filtering, overlapping
exclusions, invalid intensities, singular designs, protocol round trips,
worker cancellation, browser tab navigation, and export contents.

Browser export tests inspect the exact download Blob and archive entries;
they do not verify OS download-file persistence in this environment.

Method references only; independently implemented, no source code copied:

- MNE-NIRS 0.7.1, simulated GLM example (task, drift, and constant):
  https://mne.tools/mne-nirs/stable/auto_examples/general/plot_10_hrf_simulation.html
- MNE-NIRS 0.7.1, GLM noise-model options (OLS vs autoregressive models):
  https://mne.tools/mne-nirs/stable/generated/mne_nirs.statistics.run_glm.html

Documentation accessed 2026-10-26. These references do not establish
numerical equivalence with MNE-NIRS or validate this toolbox.
