# Architecture
_Last updated: 2026-10-27_

## Overview
Browser UI <-> Node HTTP server <-> one long-lived `claude -p` process per session in stream-json mode.
The server speaks Claude Code's control protocol (the one the Agent SDK uses) over the process's stdin/stdout:
user turns, permission prompts, interrupt, model/mode switches, and read-only catalog queries. No database;
sessions are kept in memory and saved to `data/sessions.json`.

## Data Flow
0. While the user types, `POST /api/warm` starts the CLI ahead of time: the session's own process, or (on the welcome
   page) a spare process with the draft settings that `createSession` adopts when cwd, mode, model and effort match
1. User sends text -> `POST /api/sessions/:id/messages`
2. `session-service` stores a user item, marks the session running, calls `session-runtime.sendMessage`
3. `session-runtime` starts the process if needed (`cli-args` builds the flags from the detected capabilities,
   `--resume <id>` keeps the conversation) and writes `{"type":"user",...}` to stdin
4. Each stdout line: `control_response` settles a pending request; `control_request` `can_use_tool` becomes a
   permission prompt; everything else -> `event-translator` -> UI items / streaming deltas -> SSE (`/api/events`)
5. Browser `events.js` updates state and views; a permission answer goes back as `control_response`
6. `result` ends the turn; the process stays warm and closes itself after `idleMinutes`
7. A message sent while a turn runs goes to `session.queue`; the end of the turn sends the next one (step 2).
   Stop empties the queue first and hands the texts back to the browser

## Models
- `GET /api/models` (`lib/model-list.js`): with a custom `ANTHROPIC_BASE_URL` the list is the model server's
  `GET /v1/models` (Ollama: `/api/tags` as fallback) plus the names in `config.json` (`model`, `ANTHROPIC_*_MODEL`);
  with Anthropic (or when nothing is known) the browser uses the CLI's own list from the catalog
- One model -> the composer's model chip is a plain label; several -> a menu. Picking one sets the session's model
  (`--model` on start, `set_model` live)

## Responsiveness
- The CLI's startup (seconds) is paid while typing (step 0), not after Enter
- Menus never wait for the CLI: `peekCatalog` gives what is cached, built-in commands show at once, the catalog is
  prefetched ~0.8 s after a view settles; a folder catalog reuses the warm spare instead of a probe
- Background reads (the context ring) pass `ifRunning` and get `null` instead of starting a process

## Slash commands
- Built-in commands of the installed version (read from the 2.1.308 binary) live in `public/js/commands-data.js` with
  Hebrew text and where they run: a GUI panel, a GUI action, the CLI (sent as text), or terminal-only
- The live catalog (`initialize` + `get_skills_dialog` control requests) adds skills, custom/plugin/MCP commands and
  upgrades a terminal-only entry to "send" when this version supports it non-interactively
- `/` at the start of the message lists every command; `/` after a space mid-sentence lists Skills and custom
  commands only, and the pick stays in the text (the model then invokes the skill itself)
- Panels use control requests (`mcp_status`, `get_context_usage`, `list_permission_rules`, ...) and whitelisted
  `claude mcp|plugin|doctor|auth` subcommands

## Key Decisions
| Decision | Why |
|---|---|
| Zero npm dependencies | Corporate network may block npm; nothing to install |
| Plain JavaScript, ES modules, no build | Runs as-is; nothing to compile |
| Persistent stream-json process per session | Permission prompts, interrupt, live switches and catalog queries need an open stdin |
| Capability detection from `--help` | Works with whatever CLI version is installed |
| Probe process for catalogs of idle sessions | Looking at a session must not keep a 100–300 MB process alive |
| Warm-up while typing (spare process for a new session) | CLI startup takes seconds; typing is intent, so the cost is paid before Enter |
| Queue on the server, not in the browser | Survives tab switches and reloads; every tab sees the same queue |
| Model list from the model server | The CLI's aliases all point to one local model behind a custom base URL; only real models are worth a menu |
| Prompt via stdin JSON, settings via files | Avoids shell quoting and encoding issues (Hebrew, cmd.exe) |
| Loopback bind + Host/Origin check, file kinds, CLI whitelist | Sessions can run commands; other websites and arbitrary paths must not be reachable |
| SSE instead of WebSocket | One-way stream, built into browsers and Node |

## Security
Threat model: one user on a closed network. The server can do everything Claude Code can, so access to the API equals
the right to run commands as that user.

**Protections in place**
- Binds to 127.0.0.1 only; Host check blocks DNS rebinding; Origin check blocks cross-site POST/PUT/DELETE
  (this covers the process-starting `POST /api/warm` and folder creation `POST /api/folders`)
- Folder creation accepts a single name only (no separators, `.` or `..`) inside an existing folder
- Static files cannot escape `public/`; Claude's files are reachable only by kind with validated names; writes need an explicit folder
- `claude` subcommands: whitelist of commands *and* options (`lib/cli-commands.js`); `mcp add` passes through only after `--`
- git runs with repository-configured programs disabled (fsmonitor, external diff, textconv)
- `.cmd` claudePath: arguments with `%` are refused (cmd.exe expansion)
- Markdown from the model or files is escaped before rendering (checked against XSS payloads)
- Risk confirmations in the browser (`public/js/risk.js`) before: settings changes touching hooks, env, auth helpers,
  status line, MCP auto-approval, plugins or new allow rules; any user-wide file in ~/.claude; `mcp add`; plugin
  install/update/enable and marketplaces; bypass/auto mode; slash commands acting on the account or the cloud.
  These are confirmations, not blocks: the user can still do everything.

**Known and accepted (not fixed on purpose — closed network)**
| Issue | Impact | Fix when needed |
|---|---|---|
| Cross-site GET allowed (simple GETs carry no Origin) | A web page in the same browser can start `claude` probes in any folder (`/api/catalog?cwd=`), run git there, list files and folders (`/api/files`, `/api/folders`), make the server ask the model server for its models (`/api/models`), exhaust memory. It cannot read responses. | Startup token required on every /api call; reject `Sec-Fetch-Site: cross-site`; process-starting endpoints as POST |
| No authentication on 127.0.0.1 | Any local program/user can drive sessions (incl. bypassPermissions), start CLI processes (`/api/warm`), create folders and edit ~/.claude settings | Same startup token |

**Outside this computer**
- The GUI server makes one network call: GET {ANTHROPIC_BASE_URL}/v1/models (read-only, with the configured token) to
  list the models, only when the base URL is not Anthropic's. Claude Code talks to the model server only through the
  messages API, which cannot change the server's configuration.
- Tools Claude runs (Bash/PowerShell) can reach any host the user can, including the model server's own HTTP API
  (Ollama's API has no authentication: pull/delete/create models). This needs the user's approval in the ask modes,
  and happens freely in bypass mode. Protect the model server itself if that matters.
- Account/cloud slash commands (design-*, schedule, ultrareview, usage-credits) and network plugin marketplaces
  are confirmed first; on the closed network they fail.

## Patterns
- Event format isolation: `lib/event-translator.js` (live events and saved transcripts)
- Item kinds: user, text, thinking, tool, tool-result, result, command-output, divider, notice (`stopped: true` when a
  stop ended the turn), error
- Session fields beyond settings: `queue` ([{ id, text, at }], persisted), `status`, `costUsd`, `claudeSessionId`
- SSE event types: session, removed, item, status, delta, runtime, permission, permission-resolved
- Claude's spark: `thread.js` sets `data-state` on the working line (starting -> thinking/writing/tool/waiting ->
  done/error/stopped); all motion is CSS in `public/css/animations.css` (off with prefers-reduced-motion)
- Panels: `public/js/panels/registry.js` lists them; each exports `render(body, context)`; the context comes from `actions.js`
