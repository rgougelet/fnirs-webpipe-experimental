# fnirs-webpipe

fnirs-webpipe is a browser based, client side pipeline for exploratory and reproducible fNIRS data analysis.

All computation occurs locally in the user's browser. Data are never uploaded to a server.

Desktop-only scope: this project does not target mobile layouts or mobile capture.

## Git Workflow
This repo uses two remotes with different roles:

- `origin` is the stable repo: `rgougelet/fnirs-webpipe`
- `experimental` is the preview repo: `rgougelet/fnirs-webpipe-experimental`

This is the intended workflow:

- Do active development on local `main`.
- Treat `experimental/main` as the default development remote branch.
- Push stable releases explicitly to `origin/main`.
- Distinguish development from production by remote, not by local branch name.
- Before every push, including pushes to `experimental`, bump the version and refresh the visible last-updated timestamp.
- Keep version markers in sync across `app.js`, `index.html`, and `package.json`.
- Keep timestamp markers in sync across `app.js` and `index.html`.

Use explicit Git commands while the repo workflow is still settling:

```powershell
git switch main
git push experimental main:main
git push origin main:main
```

If two agents need to work at the same time, use separate worktrees instead of sharing one checked-out directory.

## Readable Files Policy
This repo treats end-to-end readability as an architectural constraint, not just
a style preference. Favor small cohesive files over one large orchestrator so
humans and agents can read whole files before making structural decisions.

Use the line-count report to keep that visible:

```powershell
npm run report:lines
```

Thresholds:

- `target`: 250 lines or fewer
- `watch`: 251-400 lines
- `split`: 401-600 lines
- `exception-review`: more than 600 lines

If a file is already in `split` or `exception-review`, avoid adding unrelated
responsibilities to it. Right now, `app.js` is the main structural outlier and
should be reduced incrementally over time rather than expanded casually.

Current pipeline controls expose these ordered steps:
- Input signal domain: `Intensity (a.u.)` or `Delta OD`
- Explicit stage cards for intensity, `Delta OD`, processed `Delta OD`, and relative hemoglobin output
- Relative physiology output via MBLL (`HbO`, `HbR`, `HbT`) using paired wavelengths
- Butterworth filtering
- Interval trimming
- Plot view selection (raw, trimmed, or both)

Current MBLL support is configured for standard NIRx `760/850 nm` pairs and uses
per-channel source-detector distance from the loaded header when available.

## Filter Duration Guidance
Low-frequency filter edges are constrained mainly by recording duration, not by FFT padding.

- A useful rule of thumb is `1 / f` seconds for one cycle of a frequency `f`.
- `0.1 Hz` needs about `10 s` for one cycle.
- `0.01 Hz` needs about `100 s` for one cycle.
- One cycle is only a minimum. Several cycles are preferred for stable behavior near the slowest edge.

Sample rate still matters for the upper end:

- With `fs = 62.5 Hz`, Nyquist is `31.25 Hz`.
- Upper filter edges should stay comfortably below Nyquist.

## Usage
Open the web app and load a NIRx data folder as a zip file.

## Local UI workflow
For faster visual iteration, use the npm wrappers rather than calling Playwright or the capture script directly. This keeps approvals reusable and avoids one-off Chromium execution prompts.

1. Install tooling:
`npm install`

2. Install Playwright browser:
`npm run ui:install`

3. Run local app server:
`npm run serve`

4. Capture desktop screenshot (dark mode default):
`npm run ui:capture`

Optional light mode capture:
`npm run ui:capture:light`

By default, capture will try to auto-load the newest ZIP from `../NIRx` (fallback: `%USERPROFILE%/Desktop/NIRx`) before taking screenshots.

Optional overrides:
- `npm run ui:capture -- --zip=../NIRx/2026-02-18_002.zip`
- `npm run ui:capture -- --nirx-dir=../NIRx`
- `npm run ui:capture -- --expand=intensity,delta od`

For repeated capture variants, prefer dedicated npm scripts over ad hoc extra
arguments. That produces more reusable approval patterns for browser execution.

Screenshots are written to `screenshots/`.

## Codex workflow
Use the repo launcher instead of starting Codex manually:

```powershell
npm run codex
```

This resumes the most recent Codex session in this repo with inline terminal
scrollback enabled. It also writes a PowerShell transcript to
`agents/chat-history/`.

`npm run codex` is the single repo-supported launcher. It runs `codex resume`
from the repo root so you can pick up prior conversations, and if resume fails
it falls back to starting a new session. It also records a PowerShell
transcript in `agents/chat-history/`.

## Repo Wrapper Workflow
Git wrappers were removed while the repo structure and remote workflow are still in flux.
Use raw `git` commands for branch, fetch, pull, push, and release operations.

The remaining wrappers exist only for browser tooling where stable command names
reduce repeated approval prompts:

```powershell
npm run ui:capture
npm run ui:capture:light
npm run ui:install
```

- `ui:capture` runs the screenshot flow through one stable npm command.
- `ui:capture:light` runs the light-theme screenshot flow through one stable npm command.
- `ui:install` installs Chromium for Playwright through one stable npm command.

## Potential Features (Deferred)
- Add contextual quick controls under the plot scroller (mode-aware actions). Deferred until redraw stability and performance are fully hardened.
- Reintroduce advanced SOS auto-order filtering as an optional engine. It is currently deprecated in favor of a fixed-order basic IIR path due to runtime freezes.
- Plot interaction restore checklist (after aspect-ratio/axes fill issue is resolved):
  - Re-enable wheel/drag zoom interactions in `plot.js` (currently disabled).
  - Re-evaluate redraw teardown behavior in `requestUiRedraw()` in `app.js` (currently clears/rebuilds plot each interaction for reliability).
  - Keep splitter/responsive sizing, but validate axes fill and data rendering at multiple aspect ratios before restoring zoom.

## Status
Active development.

License: CC BY-NC 4.0
