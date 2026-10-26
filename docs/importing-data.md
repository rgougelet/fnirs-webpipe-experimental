# Importing data

The Import section uses one file browser for all available data:

- `samples/` contains the bundled NIRx ZIP and Homer3 SNIRF files.
- `local/` contains the latest selection from Browse files or Browse folder.

Click a recording filename to load it. The Source path field also accepts
available paths, such as `samples/homer3-test.snirf`. Press Enter or Open.
Folder shortcuts and Up navigate without changing the loaded recording.
The Loaded line identifies the data currently in use.

Browse folder preserves relative folder paths. It requires a browser with
directory selection support. Paths refer to files made available through the
picker, rather than arbitrary paths on the computer. Local files stay in the
browser; reloading the page clears the selection.

## NIRx files

Select the entire folder or select the header, wavelength files, and optional
metadata together. Opening `recording.hdr` uses `recording.wl1` and
`recording.wl2` in the same folder, plus `recording.evt` and
`recording_probeInfo.mat` or `probeInfo.mat` when present. Names are matched
without case sensitivity. Missing required files produce an error before loading.
Multiple recordings remain separate and require a filename selection.

## Bundled files and ZIP contents

Samples are real files included with the app. Download saves their original
bytes, so they can be selected again through Browse files or used elsewhere.
Browse ZIP opens an archive as a folder. Each member can be downloaded;
opening a header within the archive loads its companion files.

Opening a ZIP with exactly one recording loads that recording automatically.
A ZIP with multiple recordings opens for browsing. Protocol ZIPs retain their
existing import behavior. Other archive members remain available for download.

## Verification

Run `npm test` and `npm run ui:test:import`. The browser checks cover actual
bundled data, exact download bytes, ZIP browsing, file and directory selection,
source persistence, missing-file recovery, and desktop dark/light layouts.
