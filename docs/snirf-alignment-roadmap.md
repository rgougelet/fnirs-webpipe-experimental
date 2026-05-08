# SNIRF Alignment Roadmap

This note records the first concrete findings from the bundled Homer3 references so future SNIRF work stays aligned with Homer3 rather than diverging into an ad hoc format.

## What the references show

- Homer3's canonical offline tutorial path is:
  - `SnirfClass(...)`
  - `hmrR_Intensity2OD(...)`
  - `hmrR_BandpassFilt(...)`
  - `hmrR_OD2Conc(...)`
- See:
  - `references/unpacked/BUNPC-Homer3-1.87.0.0/Example pipelines/simple_pipeline.m`
  - `references/unpacked/BUNPC-Homer3-1.87.0.0/UnitTests/unitTest_SnirfBasicProcStream.m`

## Sample data findings from the bundled references

- Homer3 example pipeline docs explicitly refer to:
  - `SampleData/Brite Fingertapping 5-19-2020.snirf`
- That referenced `.snirf` sample is not bundled in this repo snapshot.
- Bundled files under:
  - `references/unpacked/BUNPC-Homer3-1.87.0.0/DataTree/AcquiredData/Snirf/Examples/`
  - have `.nirs` extension and local inspection shows MATLAB 5 file headers, not HDF5 SNIRF containers.

## Implication for this app

- Current app import is NIRx raw:
  - `.hdr`
  - `.wl1`
  - `.wl2`
  - optional `.evt`
  - optional `probeInfo.mat`
- Seamless NIRx -> SNIRF support needs a normalized internal dataset model that is independent of source format.

## Immediate next implementation steps

1. Add a browser-readable HDF5 layer for `.snirf`.
2. Map SNIRF `dataTimeSeries`, `time`, `measurementList`, `probe`, and `stim` into the same normalized dataset shape used by NIRx import.
3. Preserve Homer3 semantics where practical:
   - intensity as the primary acquisition domain
   - wavelength-aware measurement list handling
   - source-detector pair geometry from probe metadata
   - event/stim import from SNIRF stim groups
4. Only after raw intensity SNIRF is stable, add compatibility for Homer-style MATLAB `.nirs` files if still needed.

## First small rule for future work

- Treat `.snirf` as the main future interchange format.
- Treat MATLAB `.nirs` as a separate legacy/Homer compatibility target, not as a synonym for SNIRF.
