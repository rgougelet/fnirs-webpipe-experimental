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
