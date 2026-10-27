# Agent Context
_Last updated: 2026-10-27 after adding the message queue, folder browser and inline skills_

## What This Project Is
A local web GUI for the Claude Code CLI that looks and works like the Claude desktop app (Code tab), in Hebrew/RTL.
A zero-dependency Node.js server keeps one long-lived `claude -p --input-format stream-json --output-format stream-json`
process per session and talks to it with the CLI's control protocol. Everything the terminal offers under `/`
is reachable: every slash command, skills, agents, MCP servers, plugins, hooks, memory, permissions, context, resume.
Built for a corporate Windows machine without another terminal.

## Current State
- ✅ Working: sessions (create from the welcome page, rename, delete, fork, clear), token streaming, thinking, tool rows
  (terminal, diffs, todos, nested subagents), interactive permission prompts, AskUserQuestion cards, plan approval,
  stop/interrupt, message queue (Enter while running), folder browser on the welcome page, `/` skills mid-sentence, live model/mode switch, Shift+Tab mode cycling, `/` menu with the live CLI catalog, `@` files + agents,
  15 settings panels (model, permissions, context/usage, git diff, resume, skills, agents, MCP, plugins, hooks, memory,
  settings files, status/doctor, appearance, help), light/dark theme, persistence to `data/sessions.json`
- ✅ Tested: end-to-end against `dev/fake-claude.js` (message flow, permissions, questions, plan, stop, /cost, fork,
  clear, failures) in a real browser; catalog and control requests against the real Claude Code 2.1.308 binary
- ✅ Tested with real model turns on Claude Code 2.1.308, 2.1.310 and **2.1.246 (the closed machine's version)**:
  permissions (allow, deny with feedback), questions, plan approval, stop, live model switch, fork, resume, clear
- 🎯 Target: closed (offline) machine with Claude Code 2.1.246 and a local qwen model (`config.json`: ANTHROPIC_BASE_URL + qwen model);
  development machine runs the same CLI version against Anthropic. Get 2.1.246 with `npm pack @anthropic-ai/claude-code-win32-x64@2.1.246`
- 🚧 Not tested: the `claude plugin` JSON shapes
  with installed plugins, the corporate Ollama setup (`config.json`)
- ❌ Known limits: images/attachments are not supported; terminal-only commands (login, ide, remote-control, ...) are
  listed but only explained; partial streamed text of a stopped turn is not kept
- ⚠️ Known security issues, accepted on purpose (closed network, single user; details in ARCHITECTURE.md → Security):
  1. Cross-site GET: a website open in the same browser can trigger GET endpoints (no Origin is sent for simple GETs).
     Responses are unreadable, but `/api/catalog?cwd=` starts a `claude` probe in any folder (in `-p` mode the folder's
     own settings/hooks load without a trust prompt), `/api/git` runs git there, and repeated calls can exhaust memory.
  2. No authentication: any program or user on the machine can use the API on 127.0.0.1 — including sessions in
     bypassPermissions mode (run any command) and writing ~/.claude settings (hooks = persistence).
  Fix when needed: random token generated at startup and required on every /api call (cookie or header), reject
  `Sec-Fetch-Site: cross-site`, and make the process-starting endpoints POST.

## Last Changes
- 2026-10-27 — Server-side message queue (session.queue), folder browser (/api/folders), inline `/` skills menu,
  context ring no longer starts a CLI process (`ifRunning`), Markdown heading and title-rename fixes.
- 2026-10-26 — Initial implementation of server, API, and UI.
- 2026-10-26 — lib/config.js tolerant parsing + `model`; wrapper-script message; startup diagnostics.
- 2026-10-26 — Rewrite: persistent CLI process + control protocol (lib/cli-process.js, lib/session-runtime.js),
  capability detection (lib/cli-capabilities.js), catalog/control/CLI/files/transcripts/workspace APIs, new frontend in
  public/js + public/css (desktop design), dev/fake-claude.js for development.

## Entry Points
- `server.js` — starts the HTTP server (loopback only)
- `public/js/app.js` — frontend entry (ES modules, no build step)
- Run: `node server.js`, open http://127.0.0.1:3737. Set `claudePath` (and `model`/`env` if needed) in `config.json`.
- Develop without an API key: `CLAUDE_GUI_CONFIG=dev/config.fake.json CLAUDE_GUI_DATA=<temp dir> node server.js` (port 3738).

## Key Patterns Used
- All knowledge of the CLI event format is in `lib/event-translator.js`; control-protocol calls in `lib/cli-process.js`
- Every UI update flows through one path: server broadcast -> SSE -> `public/js/events.js` -> views
- Slash commands: `public/js/commands-data.js` (built-ins of 2.1.308 + Hebrew text + where each runs) merged with the
  live catalog from the CLI in `public/js/command-catalog.js`; executed by `public/js/command-runner.js`
- Optional CLI flags are passed only when `claude --help` lists them (`lib/cli-capabilities.js`)
- The browser can only reach Claude's own files through kinds (`lib/claude-files.js`) and whitelisted CLI subcommands
  and options (`lib/cli-commands.js`); writes need an explicit folder (no fallback to the home folder)
- Significant actions are never blocked, only confirmed: panels get `guardedApi` from `public/js/risk.js` (settings with
  hooks/env/allow rules, user-wide files, MCP add, plugin install/marketplaces); also bypass/auto mode and slash commands
  that act on the Anthropic account or the cloud (design-*, schedule, ultrareview, usage-credits)

## Next Steps
- [ ] Run one real conversation on the corporate machine and adjust `lib/event-translator.js` if needed
- [ ] Image paste / file attachments (stream-json user content blocks)
- [ ] `/btw` side questions via the `side_question` control request
- [ ] Background tasks panel (`/tasks`) from `task_started` / `task_notification` events

## Gotchas / Watch Out
- Queue: `sendMessage` on a running session appends to `session.queue` (persisted); `onTurnEnd` sends the next one.
  Stop empties the queue *before* interrupting (otherwise the interrupted turn's end would send the next message)
  and returns the texts to the browser. After a crash or a server restart the queue waits for "שליחת הבאה" (resume)
- Environment variables (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN) are inherited from the shell that starts the server, or set under `env` in `config.json`
- Each open session keeps a CLI process (100–300 MB) until `idleMinutes` (default 20) of inactivity; catalogs of idle sessions use a short-lived probe instead
- Settings changes without a live control request (effort, agent, output style, add-dir) restart the process with `--resume` on the next message
- 2.1.246 does not support the control requests list_permission_rules, get_hooks_listing, get_memory_dialog, get_skills_dialog, get_status;
  panels must degrade (`isUnsupported` in public/js/panels/kit.js). Its `initialize` has no claude_code_version and commands have no `builtin` flag
- `--permission-prompt-tool stdio` is required for permission prompts even on 2.1.x (hidden from `--help`); without it every ask is silently denied
- 2.1.x names the "default" permission mode "manual" in `--help`; both are accepted, the GUI always uses "default"
- On the user's machine `claude` on PATH is an interactive wrapper that asks for a model; `claudePath` must point to the real CLI
- `.cmd` shims on Windows run through cmd.exe; arguments are quoted by `lib/spawn-utils.js`, JSON goes through files, never arguments;
  arguments containing `%` are refused there (cmd.exe expands %VAR% even in quotes)
- The git panel disables repository-configured programs (fsmonitor, external diff, textconv) — keep those flags in `lib/workspace-info.js`
- The GUI server itself never opens network connections; anything outside the machine happens through Claude Code
  (model API calls, MCP/plugins) or through tools Claude runs (Bash can reach the model server's HTTP API — e.g.
  Ollama's unauthenticated /api/delete — when the user approves it or in bypass mode)
- Requiring `lib/session-store.js` registers an exit hook that writes `data/sessions.json`; set `CLAUDE_GUI_DATA` in experiments
