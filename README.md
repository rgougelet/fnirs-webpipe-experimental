# fnirs-webpipe

fnirs-webpipe is a browser based, client side pipeline for exploratory and reproducible fNIRS data analysis.

All computation occurs locally in the user's browser. Data are never uploaded to a server.

Desktop-only scope: this project does not target mobile layouts or mobile capture.

## Branch Workflow
This repo uses two remotes with different roles:

- `origin` is the stable repo: `rgougelet/fnirs-webpipe`
- `experimental` is the preview repo: `rgougelet/fnirs-webpipe-experimental`

This is the intended workflow:

- Do active development on local `experimental`.
- Publish preview work to `experimental/main`.
- Keep local `main` for stable release promotion only.
- When a version is stable, merge `experimental` into `main`.
- Push `main` to `origin/main`.

In short: do not develop on `main`.

Useful commands:

```powershell
git switch experimental
npm run git:push:experimental

git switch main
git merge experimental
npm run git:push
```

If two agents need to work at the same time, use separate worktrees instead of sharing one checked-out directory.

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

Useful variants:

- `npm run codex:new` starts a new session.
- `npm run codex:pick` opens Codex's resume picker.

If the Codex TUI was exited with `/exit`, restart with `npm run codex`; it uses
`codex resume --last`, so you should not need to copy the conversation ID.

## Repo wrapper workflow
Only a small set of wrappers are retained. They exist to encode branch policy
or reduce repeated approval prompts:

```powershell
npm run git:push:experimental
npm run git:push
npm run ui:capture
npm run ui:capture:light
npm run ui:install
```

- `git:push:experimental` pushes local `experimental` to `experimental/main` and refuses to run on other branches.
- `git:push` pushes local `main` to `origin/main` and refuses to run on other branches.
- `ui:capture` runs the screenshot flow through one stable npm command.
- `ui:capture:light` runs the light-theme screenshot flow through one stable npm command.
- `ui:install` installs Chromium for Playwright through one stable npm command.

Removed wrappers:

- `git:status`
- `git:add`
- `git:save`
- `git:delete-branch`

Use raw `git` for those operations.

## Status
Active development.

License: CC BY-NC 4.0
