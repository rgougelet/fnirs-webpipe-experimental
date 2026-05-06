# Agents

This folder stores repo-local agent workflow material.

Read [../AGENTS.md](../AGENTS.md) before doing branch, remote, or Playwright operations. It defines the current main-only, two-remote workflow, the separate-worktree rule for concurrent agents, and the wrapper policy for Chromium-related commands, including the preference for exact npm wrappers like `ui:capture` and `ui:capture:light`.

That file also defines a hard pre-push rule: every push, including `experimental`, must update synced version markers and last-updated timestamps before release.

## Chat History

Codex sessions launched with `npm run codex` write PowerShell transcripts to
`agents/chat-history/`.

Keep useful transcripts here when they document project decisions, debugging
steps, or implementation history worth preserving with the repository.
