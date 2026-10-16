# Reference Intake Log

## Batch: 2026-10-15 (task design preview)

- SNIRF specification: https://github.com/fNIRS/snirf
  - Version pin: `384bb0e2ae1c076774c1a2edcbbb5d28cc001554`.
  - Scope: stimulus onset/duration/amplitude semantics and condition groups.
- SPM: https://github.com/spm/spm
  - Version pin: `8bad2aac8c35b42cc6ea913250953928461a8a99`.
  - Scope: canonical HRF parameter definitions; method documentation accessed
    2026-10-15 at https://www.fil.ion.ucl.ac.uk/spm/docs/tutorials/beginners/haemodynamic_modelling/.
- Usage mode: `reference_only`. Formulas and file semantics were independently
  implemented; no reference source code was copied or adapted.
- License status: no code reuse rights relied upon. Any future adaptation
  requires separate source-license review under `docs/reference-policy.md`.
- Applied in `snirf.js`, `task-events.js`, and `design-matrix.js`.
- Normalization, sampling, and model limits are documented in
  `docs/task-design-preview.md`.

## Batch: 2026-03-04 (5 ZIPs from `references/`)

### 1) `ant_av_eeg-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/ant_av_eeg-master/ant_av_eeg-master`
- Size/scope: 189 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies:
  - `deps/GeodeticToolbox` -> treat as `adapt_with_citation`
- Intake status: `in_review`

### 2) `darts-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/darts-master/darts-master`
- Size/scope: 61 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies:
  - `deps/` present (license/source attribution not yet resolved)
- Intake status: `in_review`

### 3) `emg-main.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/emg-main/emg-main`
- Size/scope: 154 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies:
  - `toolboxes/emg_feature_extraction_toolbox` (BSD-3-Clause) -> `adapt_with_citation`
  - `toolboxes/SampEn` (BSD-like license in `license.txt`) -> `adapt_with_citation`
- Intake status: `in_review`

### 4) `interp_epoch-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/interp_epoch-master/interp_epoch-master`
- Size/scope: 17 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies: none detected
- Intake status: `approved_with_adaptation`

### 5) `rjg_tools-master.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/rjg_tools-master/rjg_tools-master`
- Size/scope: 38 MATLAB files
- Requested usage mode: `direct_reuse` (owner-authored)
- Detected nested dependencies: none detected
- Intake status: `approved_with_adaptation`

## Notes
- Intake assumptions are based on your instruction that these repos are mostly your own code.
- Any nested `deps/`/`toolboxes/` components are treated as third-party unless confirmed otherwise.
- Before direct code lift from nested dependency folders, add/update `THIRD_PARTY_NOTICES.md`.

## Batch: 2026-03-06 (NIRS-KIT)

### 6) `NIRS-KIT-main.zip` + `NIRS-KIT.pdf`
- Source: local files in `references/`
- Unpacked path: `references/unpacked/NIRS-KIT-main/NIRS-KIT-main`
- Intended usage mode: `reference_only` for method design, `adapt_with_citation` only when explicitly needed
- Initial method reviewed:
  - `Otherfunctions/Homer_Convert/hmrIntensity2OD.m` (intensity to delta optical density transform)
- Intake status: `in_review`

## Batch: 2026-03-06 (Homer3 + Huppert 2009)

### 7) `BUNPC-Homer3-1.87.0.0.zip`
- Source: local ZIP in `references/`
- Unpacked path: `references/unpacked/BUNPC-Homer3-1.87.0.0`
- Intended usage mode: `reference_only` for pipeline and formulas, `adapt_with_citation` for small method-level snippets
- Functions reviewed:
  - `FuncRegistry/UserFunctions/hmrR_Intensity2OD.m`
  - `FuncRegistry/UserFunctions/Archive/hmrR_Intensity2OD_Nirs.m`
  - `FuncRegistry/UserFunctions/hmrR_OD2Conc.m`
  - `Example pipelines/simple_pipeline.m`
- Applied in repo:
  - `app.js` intensity-to-dOD method
  - `app.js` MBLL coefficient conventions for 760/850 nm
- Intake status: `approved_with_adaptation`

### 8) `Huppert, 2009.pdf`
- Source: local PDF in `references/`
- Intended usage mode: `reference_only`
- Notes: used as conceptual MBLL/OD background reference; direct PDF text extraction not configured in current sandbox.
- Intake status: `in_review`
