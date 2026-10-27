# Architecture
_Last updated: 2026-10-27_

## Overview
Browser UI <-> Node HTTP server <-> one long-lived `claude -p` process per session in stream-json mode.
The server speaks Claude Code's control protocol (the one the Agent SDK uses) over the process's stdin/stdout:
user turns, permission prompts, interrupt, model/mode switches, and read-only catalog queries. No database;
sessions are kept in memory and saved to `data/sessions.json`.

## Data Flow
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

## Slash commands
- Built-in commands of the installed version (read from the 2.1.308 binary) live in `public/js/commands-data.js` with
  Hebrew text and where they run: a GUI panel, a GUI action, the CLI (sent as text), or terminal-only
- The live catalog (`initialize` + `get_skills_dialog` control requests) adds skills, custom/plugin/MCP commands and
  upgrades a terminal-only entry to "send" when this version supports it non-interactively
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
| Prompt via stdin JSON, settings via files | Avoids shell quoting and encoding issues (Hebrew, cmd.exe) |
| Loopback bind + Host/Origin check, file kinds, CLI whitelist | Sessions can run commands; other websites and arbitrary paths must not be reachable |
| SSE instead of WebSocket | One-way stream, built into browsers and Node |

## Security
Threat model: one user on a closed network. The server can do everything Claude Code can, so access to the API equals
the right to run commands as that user.

**Protections in place**
- Binds to 127.0.0.1 only; Host check blocks DNS rebinding; Origin check blocks cross-site POST/PUT/DELETE
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
| Cross-site GET allowed (simple GETs carry no Origin) | A web page in the same browser can start `claude` probes in any folder (`/api/catalog?cwd=`), run git there, list files, exhaust memory. It cannot read responses. | Startup token required on every /api call; reject `Sec-Fetch-Site: cross-site`; process-starting endpoints as POST |
| No authentication on 127.0.0.1 | Any local program/user can drive sessions (incl. bypassPermissions) and edit ~/.claude settings | Same startup token |

**Outside this computer**
- The GUI server makes no network calls. Claude Code talks to the model server only through the messages API, which
  cannot change the server's configuration.
- Tools Claude runs (Bash/PowerShell) can reach any host the user can, including the model server's own HTTP API
  (Ollama's API has no authentication: pull/delete/create models). This needs the user's approval in the ask modes,
  and happens freely in bypass mode. Protect the model server itself if that matters.
- Account/cloud slash commands (design-*, schedule, ultrareview, usage-credits) and network plugin marketplaces
  are confirmed first; on the closed network they fail.

## Patterns
- Event format isolation: `lib/event-translator.js` (live events and saved transcripts)
- Item kinds: user, text, thinking, tool, tool-result, result, command-output, divider, notice, error
- SSE event types: session, removed, item, status, delta, runtime, permission, permission-resolved
- Panels: `public/js/panels/registry.js` lists them; each exports `render(body, context)`; the context comes from `actions.js`
