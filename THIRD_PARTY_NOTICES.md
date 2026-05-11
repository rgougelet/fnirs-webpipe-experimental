# Third-Party Notices

This file tracks nontrivial third-party code adaptations/reuse.

## Entry Template

### [Component Name]
- Source: [URL or local path]
- Version: [commit/tag/release/date]
- License: [SPDX or license name]
- Usage mode: `adapt_with_citation` | `direct_reuse`
- Files in this repo:
  - [path]
  - [path]
- Summary of reused/adapted parts:
  - [short description]
- Modifications made:
  - [short description]
- Required notices:
  - [copyright header attribution / license text location]

---

## Discovered During Intake (Not Yet Reused In This Repo)

### JSZip
- Source: `https://github.com/Stuk/jszip` and local install snapshot `node_modules/jszip`
- Version: `3.10.1`
- License: `MIT` (chosen from JSZip dual license `MIT OR GPL-3.0-or-later`)
- Usage mode: `direct_reuse`
- Files in this repo:
  - `vendor/jszip.js`
  - `vendor/jszip.LICENSE.markdown`
- Summary of reused/adapted parts:
  - Unmodified browser distribution file for reading local `.zip` datasets in the portable app
- Modifications made:
  - None; copied verbatim into `vendor/`
- Required notices:
  - Keep `vendor/jszip.LICENSE.markdown` with the vendored file
  - Keep this notice entry

---

### uPlot
- Source: `https://github.com/leeoniya/uPlot` and local install snapshot `node_modules/uplot`
- Version: `1.6.32`
- License: `MIT`
- Usage mode: `direct_reuse`
- Files in this repo:
  - `vendor/uPlot.iife.js`
  - `vendor/uPlot.min.css`
  - `vendor/uPlot.LICENSE.txt`
- Summary of reused/adapted parts:
  - Unmodified browser distribution files for interactive time-series plotting in the portable app
- Modifications made:
  - None; copied verbatim into `vendor/`
- Required notices:
  - Keep `vendor/uPlot.LICENSE.txt` with the vendored files
  - Keep this notice entry

---

### jsfive
- Source: `https://github.com/usnistgov/jsfive` and local install snapshot `node_modules/jsfive`
- Version: `0.4.0`
- License: `public domain` (license note in `LICENSE.txt`)
- Usage mode: `direct_reuse`
- Files in this repo:
  - `vendor/jsfive.hdf5.js`
  - `vendor/jsfive.LICENSE.txt`
- Summary of reused/adapted parts:
  - Unmodified browser distribution file used as the HDF5 reader backend for SNIRF import
- Modifications made:
  - None; copied verbatim into `vendor/`
- Required notices:
  - Keep `vendor/jsfive.LICENSE.txt` with the vendored file
  - Keep this notice entry

---

### Homer3 MBLL/OD reference methods
- Source: `references/unpacked/BUNPC-Homer3-1.87.0.0`
- Version: `BUNPC-Homer3-1.87.0.0` ZIP snapshot imported on 2026-03-06
- License: Homer3 Software License Agreement / BSD-2-Clause-like
- Usage mode: `adapt_with_citation`
- Files in this repo:
  - `app.js`
- Summary of reused/adapted parts:
  - Method-level adaptation of `hmrR_Intensity2OD.m` for delta optical density
  - Coefficient conventions and MBLL solve structure from `hmrR_OD2Conc.m`
  - Wray-spectrum extinction values from `GetExtinctions.m`
- Modifications made:
  - Simplified for browser-side arrays instead of SNIRF `DataClass`
  - Limited current coefficient table to the app's supported paired wavelengths
  - UI surfaced DPF and source-detector distance assumptions
- Required notices:
  - This notice file
  - Inline provenance comments near the adaptation points

---

### GeodeticToolbox (from `ant_av_eeg-master`)
- Source: `references/unpacked/ant_av_eeg-master/ant_av_eeg-master/deps/GeodeticToolbox`
- Version: ZIP snapshot imported on 2026-03-04
- License: BSD-2-Clause-like text in `license.txt` (Peter Wasmeier, 2013)
- Planned usage mode: `adapt_with_citation`
- Files in this repo: none yet (discovered only)

### EMG Feature Extraction Toolbox (from `emg-main`)
- Source: `references/unpacked/emg-main/emg-main/toolboxes/emg_feature_extraction_toolbox`
- Version: ZIP snapshot imported on 2026-03-04
- License: BSD-3-Clause (`LICENSE`, Jingwei Too, 2020)
- Planned usage mode: `adapt_with_citation`
- Files in this repo: none yet (discovered only)

### SampEn toolbox (from `emg-main`)
- Source: `references/unpacked/emg-main/emg-main/toolboxes/SampEn`
- Version: ZIP snapshot imported on 2026-03-04
- License: BSD-3-Clause-like text in `license.txt` (Victor Martinez, 2018)
- Planned usage mode: `adapt_with_citation`
- Files in this repo: none yet (discovered only)
