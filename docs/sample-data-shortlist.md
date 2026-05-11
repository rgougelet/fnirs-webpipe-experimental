# Sample Data Shortlist

Current loader support is strongest for zipped NIRx-style `hdr/wl1/wl2/evt` datasets.
Most easy open-access public examples today are distributed as `SNIRF`, so there is a format gap.

## Best small starting points

- `fNIRS/snirf-samples`
  - Public-domain developer sample files.
  - Best for future SNIRF import work and parser validation.
  - URL: `https://github.com/fNIRS/snirf-samples`

- `openfnirs` data index
  - Good discovery page for open-access fNIRS datasets.
  - Includes SNIRF and BIDS+SNIRF datasets plus acquisition-system metadata.
  - URL: `https://openfnirs.org/data/`

- `Luhmann2020synhrf`
  - Useful for filter evaluation because it includes resting-state data with synthetic HRF.
  - Listed on the openfnirs data index.

## Small synthetic waveform tests to keep handy

- step + low-frequency drift + in-band sinusoid
  - Good for edge-artifact checks.

- two-tone signal with one in-band and one out-of-band component
  - Good for passband/stopband sanity checks.

- impulse-like spike on slow baseline
  - Good for checking ringing and transient spread.

## Size check (2026-05-11)

Bundled with the app (`/samples`, both under 10 MB):

- `samples/nirx-demo-2026-02-18_002.zip` - `632,975` bytes (`0.60 MB`)
- `samples/homer3-test.snirf` - `7,203,050` bytes (`6.87 MB`)

Reference examples under 10 MB (selected):

- `.../SampleData/Brite Fingertapping 5-12-2020.snirf` - `7,617,562` bytes
- `.../SampleData/Brite Fingertapping 5-15-2020.snirf` - `8,065,730` bytes
- `.../SampleData/Brite Fingertapping 5-19-2020.snirf` - `8,222,610` bytes
- `.../DataTree/Examples/SubjDataSample/test.snirf` - `1,709,570` bytes
- `.../DataTree/Examples/Example4_twNI/s1/neuro_run01.snirf` - `2,563,482` bytes

Known reference example over 10 MB:

- `.../DataTree/AcquiredData/Snirf/Examples/FingerTapping_run3_tdmlproc.nirs` - `17,618,359` bytes
