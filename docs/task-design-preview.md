# Task design preview

Open **Task Design > Open task design**. A recording supplies the events;
**Synthetic example** provides a separate illustrative 180 s, six-block task.

## Event semantics

- SNIRF stimulus groups define condition identity independently of amplitude.
- Each stimulus row retains its exact onset, duration, and amplitude, including
  zero or negative amplitudes. Distinct rows are preserved even at equal onsets.
- Times in the normalized event model are seconds relative to the first sample
  of the recording. Rounded sample indices are retained for existing plot markers.
- NIRx markers retain their existing code/sample interpretation. They have
  unknown duration until the user provides it; duration 0 explicitly means an
  impulse. Durations are not inferred from the next marker.
- Blank duration overrides retain imported durations; numeric overrides apply
  to every event in that condition. Imported events remain unmodified.
- Condition labels and duration overrides are included in saved `.pipe` files
  and shared protocol links. Schema 1 protocols load with empty task settings.

## Regressors

The independently implemented illustrative HRF is a double gamma with response
delay 6 s, undershoot delay 16 s, dispersions 1/1, response-to-undershoot ratio 6,
onset delay 0, and support [0, 32) s. Its continuous integral is normalized to 1.
This uses the SPM canonical parameterization, with continuous normalization;
it does not claim bit-for-bit equivalence to SPM's discrete sampling procedure.

Positive-duration stimuli are unit-height boxes scaled by stimulus amplitude.
Their convolution is calculated using the difference of HRF integrals at the
start and end of each box. Zero-duration events are impulses with mass equal
to amplitude. Overlapping events add linearly within their condition.

The preview samples at a subset of the original recording times, at no more
than 2 Hz and about 12,000 rows. The actual grid spacing is displayed. One
column per condition and a constant intercept are exported in the design CSV.
The CSV contains preview regressors on that grid, not fitted signal estimates.

Excluded intervals do not compress or alter the design's original time axis.
This quick preview does not apply preprocessing. The **Design Matrix** and
**GLM Fit** tabs use full-resolution data, matching temporal operations, and
explicit nuisance regressors. See [glm-fitting.md](glm-fitting.md).
The illustrative HRF is not a fitted or validated individual fNIRS response.

## References and verification

Method-level references, accessed 2026-10-15; no reference code was copied:

- SNIRF specification, `/nirs(i)/stim(j)/data`:
  https://github.com/fNIRS/snirf/blob/master/snirf_specification.md
- SPM documentation, haemodynamic modelling:
  https://www.fil.ion.ucl.ac.uk/spm/docs/tutorials/beginners/haemodynamic_modelling/
- SPM HRF parameter definitions:
  https://github.com/spm/spm/blob/main/spm_hrf.m

Run `npm test` for import semantics, amplitude/condition separation,
fractional timing, numerical HRF integration, linear superposition, resolution
invariance, and file/link protocol round trips. Run `npm run ui:test:task` for
the synthetic and recording workflows in Chromium.
