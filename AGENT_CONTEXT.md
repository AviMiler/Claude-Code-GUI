# Agent Context
_Last updated: 2026-11-24 (develop HEAD 12aec3e, pushed). History: CHANGELOG.md (older: CHANGELOG-archive.md, not read by sessions); requirements: spec.md; reasons: DECISIONS.md; structure: ARCHITECTURE.md, PROJECT_MAP.md; third-party file: DEPENDENCIES.md; git rules: git-instructions.md._

## What This Project Is
Local web GUI for the Claude Code CLI (Hebrew/RTL, looks like the Desktop Code tab). Zero-npm-dependency Node.js server keeps one long-lived `claude -p --input-format stream-json --output-format stream-json` process per session and uses the CLI's control protocol. Built for a corporate Windows machine (closed/offline, no other terminal); target model is LOCAL (qwen via Ollama at `ANTHROPIC_BASE_URL`), Claude Code 2.1.246 (`npm pack @anthropic-ai/claude-code-win32-x64@2.1.246`). The dev machine runs the same CLI against Anthropic.

## Current State
- Shipped: everything in spec.md (459 tests in 60 files pass: `node --test test/*.test.js`). Verified only against the fake CLI / fake Ollama (+ real 2.1.246/2.1.308-314 on the dev machine). NOT verified on the real closed machine: see the full list in CHANGELOG-archive.md ("Moved from AGENT_CONTEXT.md").
- Known limits and accepted security issues (closed network, single user: no auth on 127.0.0.1, cross-site GET mostly closed by `X-Claude-Gui: 1`): ARCHITECTURE.md -> Security; full lists in the archive.
- Size budget ~150 lines per file; over: `lib/session-service.js` 181, `lib/session-runtime.js` 154, `public/js/panes/pane-changes.js` 153 (new logic goes into new modules).

## Standing Rules (set by the user)
- Workflow: develop is pushed; main is untouched until the user tests on the closed machine; `.claude/worktrees/` agent worktrees are cleaned only after that; the user deletes `C:\repo` himself; the user's `config.json` / `config.json.bak` are never committed or edited.
- ALL manual checks on the real machine are run by the user while using the app, not by the agent; only fix what he reports.
- Accessibility pass: declined by the user. PR links: skipped (on-prem Azure DevOps, closed network).
- The CLI is the source of truth, GUI only displays (DECISIONS.md 2026-10-29): follow the CLI; a departure is said out loud and written to DECISIONS.md.
- Defaults decided without a question (spec.md / DECISIONS.md): D5, D6, D7, D9 and the 2026-10-30 / 11-16 / 11-19 ones; tell the user.

## Entry Points
- `server.js` (loopback HTTP); `public/js/app.js` (ES modules, no build; `public/vendor/highlight/` as classic scripts).
- Run: `node server.js` -> http://127.0.0.1:3737; set `claudePath`, `model`, `env` and optional keys in `config.json`. Restart after pulling (API routes load at startup; `public/` reads from disk).
- Tests: `node --test test/*.test.js` (bare-folder form fails on Node 22); use temp `CLAUDE_GUI_DATA` / `CLAUDE_CONFIG_DIR`.
- No API key: `CLAUDE_GUI_CONFIG=dev/config.fake.json CLAUDE_GUI_DATA=<temp> node server.js` (port 3738); `dev/fake-claude.js`, `dev/fake-ollama.js`.

## Key Patterns
- CLI event format only in `lib/event-translator.js`; control calls in `lib/cli-process.js`; optional flags only if `--help` lists them (`lib/cli-capabilities.js`).
- One UI update path: broadcast -> SSE (`event-hub.js`, per-tab filter `lib/sync/subscriptions.js`) -> `public/js/events.js` -> views. Browser `fetch` to `/api/` goes through `public/js/api.js`.
- Browser reaches Claude's files only via `lib/claude-files.js` kinds and `lib/cli-commands.js`; all git via `lib/git/run.js` under the repo lock; the conversation is the CLI's file (never store items; `pushExtra` for GUI-only).
- Features get their own folder; ONE context-percentage function (`public/js/context/context-info.js`); significant actions are confirmed, never blocked (`risk.js`); UI never waits for the CLI (`peek*`, `ifRunning`).
- Per-area gotchas (model gate, rewind, worktrees, panes, shell, schedule, sidebar, files, etc.): **read the area's line in GOTCHAS.md before changing it.**

## Last Changes
- 2026-11-19 Worktree decision closed: GUI keeps creating worktrees with git (not the CLI's `--worktree`).
- 2026-11-19 Worktree cleanup list, diff colors and side-by-side, dev servers from `launch.json`.
- 2026-11-19 Chat without a project (`chat: true`, shared `<data>/chats`).
- 2026-11-19 Flexible scheduling (`rule` kind); highlight.js; add selection to chat.
- 2026-11-19 Keep-awake; branch-vs-base diff; timestamps and links; discard a file; Ctrl+F; local merge.

## Next Steps (detail: spec.md; DECISIONS.md)
- [ ] First real-machine run: adjust `lib/event-translator.js`, check `/api/models` and the health dot, vision, files, imports, split view.
- [ ] Real Ollama context window (`/api/show`, `/api/ps`), ring, 70% warning, "סכם ונקה".
- [ ] Real CLI 2.1.246: `--settings` Stop hook, `--tools`, `mcp_toggle`, timestamps, rewind, `/btw`, elicitation, fallback model.
- [ ] Windows: keep-awake, DST/sleep, scheduled `rule`, dev servers, editor, commit/push, worktree lock, terminals.
- [ ] Visual checks: light theme, narrow window, dark chat folder, Edge preview, Hebrew keyboard shortcuts.
- [ ] Debt: split `session-service.js`, `session-runtime.js`, `pane-changes.js` at next change; Stop-hook cost; scoped worktree prune.
- [ ] Confirm Desktop docs details (terminal output to context, Ctrl+`, plan buttons, launch.json format).
- [ ] At the end of development: build one self-contained Hebrew RTL HTML manual-test checklist (pass/fail/skip, notes, localStorage, print report).
