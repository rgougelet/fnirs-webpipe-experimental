# Agent Workflow Rules

This repository uses two GitHub remotes on purpose:

- `origin` -> `rgougelet/fnirs-webpipe`
- `experimental` -> `rgougelet/fnirs-webpipe-experimental`

Git policy:

- Active development happens on local `main`.
- Local `main` should track `experimental/main`.
- Production release happens by explicit push to `origin/main`.
- Do not rely on branch names to distinguish environments. Use remote names.
- Do not assume a local `experimental` branch exists.

Canonical commands:

```powershell
git switch main
git push experimental main:main
git push origin main:main
```

Worktree policy:

- If more than one agent is working at the same time, use separate worktrees.
- Do not have multiple agents editing the same worktree concurrently.
- Before any write, check `git status --short --branch`.

Wrapper policy:

- Prefer raw `git` for ad hoc inspection and branch surgery.
- Git wrappers are intentionally removed while the repo workflow is in flux.
- Do not run raw `node scripts/capture-ui.mjs` or raw `playwright` commands when an npm wrapper exists.
- For browser capture and Chromium install, prefer npm wrappers so approvals can be reused.
- Prefer exact wrapper names over ad hoc extra args for repeated browser tasks.
- If a browser workflow will be reused, add a dedicated npm script first.

Approved workflow commands:

```powershell
npm run ui:capture
npm run ui:capture:light
npm run ui:install
```

Command meaning:

- `npm run ui:capture` runs the Playwright screenshot workflow through one stable wrapper.
- `npm run ui:capture:light` runs the light-theme screenshot workflow through one stable wrapper.
- `npm run ui:install` installs Chromium for Playwright through one stable wrapper.

If you are an agent entering this repo cold, assume local `main` is the working branch and that development should default toward the `experimental` remote unless the user explicitly says they are publishing production.
