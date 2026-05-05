# Agent Workflow Rules

This repository uses two GitHub remotes on purpose:

- `origin` -> `rgougelet/fnirs-webpipe`
- `experimental` -> `rgougelet/fnirs-webpipe-experimental`

Branch policy:

- Active development happens on local `experimental`.
- Stable releases happen on local `main`.
- Push local `experimental` to `experimental/main`.
- Push local `main` to `origin/main`.
- Do not treat `origin` as the day-to-day development remote.
- Do not push experimental work to `origin/main`.

Current local tracking:

- local `experimental` tracks `experimental/main`
- local `main` tracks `origin/main`

Promotion workflow:

1. Work on `experimental`.
2. Push preview updates to the experimental repo.
3. When stable, merge `experimental` into `main`.
4. Push `main` to `origin`.

Worktree policy:

- If more than one agent is working at the same time, use separate worktrees.
- Do not have multiple agents editing the same worktree concurrently.
- Before any write, check `git status --short --branch`.

Wrapper policy:

- Keep wrappers only when they encode repo policy or reduce repeated approval prompts.
- Prefer raw `git` for ad hoc inspection and branch surgery.
- Do not run raw `node scripts/capture-ui.mjs` or raw `playwright` commands when an npm wrapper exists.
- For browser capture and Chromium install, prefer npm wrappers so approvals can be reused.
- Prefer exact wrapper names over ad hoc extra args for repeated browser tasks.
- If a browser workflow will be reused, add a dedicated npm script first.

Approved workflow commands:

```powershell
npm run git:push:experimental
npm run git:push
npm run ui:capture
npm run ui:capture:light
npm run ui:install
```

Command meaning:

- `npm run git:push:experimental` pushes preview work from local `experimental` to `experimental/main`.
- `npm run git:push` pushes stable work from local `main` to `origin/main`.
- `npm run ui:capture` runs the Playwright screenshot workflow through one stable wrapper.
- `npm run ui:capture:light` runs the light-theme screenshot workflow through one stable wrapper.
- `npm run ui:install` installs Chromium for Playwright through one stable wrapper.

If you are an agent entering this repo cold, assume `experimental` is the working branch unless the user explicitly says they are preparing a stable release.
