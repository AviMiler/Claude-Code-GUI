# Architecture
_Last updated: 2026-10-27 (file viewer; earlier: per-turn changed-files card, working-line.js, prompt templates, pinned sessions, grouping)_

## Overview
Browser UI <-> Node HTTP server <-> one long-lived `claude -p` process per session in stream-json mode.
The server speaks Claude Code's control protocol (the one the Agent SDK uses) over the process's stdin/stdout:
user turns, permission prompts, interrupt, model/mode switches, and read-only catalog queries. No database;
sessions are kept in memory and saved to `data/sessions.json`; prompt templates are saved to `data/templates.json`.

## Data Flow
0. While the user types, `POST /api/warm` starts the CLI ahead of time: the session's own process, or (on the welcome
   page) a spare process with the draft settings that `createSession` adopts when cwd, mode, model and effort match
1. User sends text and attachments -> `POST /api/sessions/:id/messages` `{ text, images?, files? }` (base64 or `{ ref }`)
2. `session-service` stores the attachments (`lib/images.js` -> `data/images/`, `lib/uploads.js` -> `data/uploads/`),
   stores a user item with references, marks the session running, calls `session-runtime.sendMessage` with the CLI
   content: image blocks + the text, followed by the paths of attached files
3. `session-runtime` starts the process if needed (`cli-args` builds the flags from the detected capabilities,
   `--resume <id>` keeps the conversation) and writes `{"type":"user",...}` to stdin
4. Each stdout line: `control_response` settles a pending request; `control_request` `can_use_tool` becomes a
   permission prompt; everything else -> `event-translator` -> UI items / streaming deltas -> SSE (`/api/events`)
5. Browser `events.js` updates state and views; a permission answer goes back as `control_response`
6. `result` ends the turn; the process stays warm and closes itself after `idleMinutes` — except while it has running
   background tasks (see Background tasks); the timer is re-armed when the last one ends
7. A message sent while a turn runs goes to `session.queue`; the end of the turn sends the next one (step 2).
   Stop empties the queue first and hands the texts back to the browser

## Attachments
- Images (PNG, JPEG, GIF, WebP): image content blocks in the user turn, so the model sees them (needs a vision model).
  The browser shrinks them to ≤1568 px / ≤3.75 MB first (`public/js/attachments.js`)
- Any other file: stored as `data/uploads/<uuid>/<name>`; the message ends with "[Attached files – read them with the
  Read tool]" and the full paths. Every session process gets `--add-dir <data/uploads>`, so Read needs no prompt
- Items and queue entries hold references only; `sessions.json` never holds file bytes

## Side questions (/btw)
- `/btw <question>` runs in the browser (`command-runner.js` -> `side-question.js`), even while a turn runs, and calls
  `POST /api/sessions/:id/side-question` `{ question, history }` -> `lib/side-questions.js` -> control request `side_question`
  on the session's process (started if needed; 10 min timeout). The answer is `{ response, notice }`
- It never becomes a thread item or a queue entry and is never saved; follow-up history lives only in the open card.
  A CLI without `side_question` -> HTTP 501 -> neutral "not available" note. It calls the model, so it costs tokens

## Background tasks
- `task_started` / `task_progress` / `task_notification` system events are normalized by `readTaskEvent` (event-translator);
  `session-runtime` passes them to the `onTask` hook and keeps `runtime.runningTasks`; `lib/task-tracker.js` holds the tasks
  per session in memory (never persisted, 50 per session); `session-service` broadcasts SSE `tasks` and puts them in the session meta
- When the CLI process ends for any reason, its running tasks become `killed`. Idle shutdown is skipped while a task runs
- The panel (`panel-tasks.js`) stops a task and reads its output with the no-token control requests `stop_task` / `get_task_output`
  (`/control` whitelist); a CLI without them gives a neutral "not available" note

## Prompt templates
- `lib/templates.js` keeps the user's saved prompts in `data/templates.json` (next to `sessions.json`, `CLAUDE_GUI_DATA`; temp file + rename). Routes in
  `lib/api-routes-tools.js`: `GET /api/templates` (newest first), `PUT /api/templates/:id` (upsert; id from the browser, `/^[\w-]{1,64}$/`), `DELETE` (404 if missing).
  Limits: name 80, text 20000, 200 templates (409). Writes pass the Origin check; no model call
- The browser (`public/js/templates.js`) parses `{{name}}` variables, shows the fill form and inserts the result into the composer (never sends); the
  "+" menu (`chip-menus.js`) and the panel (`panel-templates.js`) both use it

## File viewer
- A click on the open button of a file tool row (Read, Edit, MultiEdit, Write, NotebookEdit) or a changed-files card row calls `GET /api/file-view?sessionId=&path=`
  (`lib/file-view.js`, route in `api-routes-tools.js`). The server returns the file's current text `{ path, content, totalLines, truncated, size }`; the browser
  (`file-viewer.js`) shows it with line numbers and marks the lines the tool read or wrote (Edit: found by searching `new_string` in the current text)
- Read-only and session-scoped: allowed roots = session cwd + `addDirs` + uploads folder, taken from the session on the server; real paths, separator boundary,
  read from the resolved path; `cwd` param ignored. 2 MB cap (`truncated`), binary (NUL in first 8 KB) 415. Content is rendered with textContent only. No model call

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
| Files by path, images as content blocks | Read handles text, code, PDF and notebooks with any model; images are the one kind the model must receive itself |
| Model list from the model server | The CLI's aliases all point to one local model behind a custom base URL; only real models are worth a menu |
| `/btw` on its own route, not in the `/control` whitelist | `side_question` calls the model (tokens) and needs a long timeout; the generic control routes are documented as no-token with short timeouts. See DECISIONS.md |
| Background tasks in memory, idle shutdown blocked while they run | Tasks live inside the CLI process, so persisting them would show ghosts; retiring the process would kill a long job after `idleMinutes` |
| Session search in the browser, no server index | The browser already holds every item (`/api/state` + SSE); no route or index to keep in sync. See DECISIONS.md |
| Prompt templates on the server (`data/templates.json`), not localStorage | User content must survive a browser reset and be shared by every tab; preferences stay per browser. See DECISIONS.md |
| File viewer reads the current file through a session-scoped route | Tool items hold only partial content; roots come from the session on the server so the route is not an arbitrary-file reader. See DECISIONS.md |
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
- Attachments: image bytes must match the declared type (magic bytes; no SVG); uploaded file names are sanitized
  (Windows-reserved characters and names) and each file has its own folder; `{ ref }` must be a stored uuid;
  `/api/uploads/...` is always a download (`application/octet-stream`, `Content-Disposition: attachment`, nosniff),
  so an uploaded HTML file never runs in the GUI's origin; images are served with their own type and nosniff
- Request bodies up to 90 MB (attachments as base64); 10 images (5 MB each) and 10 files (25 MB each) per message
- Static files cannot escape `public/`; Claude's files are reachable only by kind with validated names; writes need an explicit folder
- `GET /api/file-view` (the only GET returning file contents): needs a known sessionId; reads only inside that session's folder, `addDirs` and the uploads folder
  (roots from the server, real paths, separator boundary, case-insensitive on win32/darwin, read from the resolved path, so `..`, symlinks and sibling prefix folders
  cannot escape; `data/sessions.json` -> 403); `cwd` ignored; read-only, 2 MB cap, binary refused; no CORS headers, so other sites cannot read the response; shown as text, never HTML
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
| Cross-site GET allowed (simple GETs carry no Origin) | A web page in the same browser can start `claude` probes in any folder (`/api/catalog?cwd=`), run git there, list files and folders (`/api/files`, `/api/folders`), load attachments whose uuid it knows (`/api/images`, `/api/uploads` — uuids are not guessable), make the server ask the model server for its models (`/api/models`, `/api/model-health?refresh=1`), exhaust memory. It cannot read responses. | Startup token required on every /api call; reject `Sec-Fetch-Site: cross-site`; process-starting endpoints as POST |
| No authentication on 127.0.0.1 | Any local program/user can drive sessions (incl. bypassPermissions), start CLI processes (`/api/warm`), create folders, edit ~/.claude settings and read text files inside any session's folders (`/api/file-view`; a local program could read them directly anyway) | Same startup token |

**Outside this computer**
- The GUI server makes one kind of network call: GET {ANTHROPIC_BASE_URL}/v1/models (read-only, with the configured
  token), only when the base URL is not Anthropic's. It serves the model list (`lib/model-list.js`, cached 5 min) and the
  health dot (`GET /api/model-health`, `lib/model-health.js`, cached 15 s, polled by each visible tab every 60 s and after
  a failed turn). The cloud is never pinged. Claude Code talks to the model server only through the messages API, which
  cannot change the server's configuration.
- Tools Claude runs (Bash/PowerShell) can reach any host the user can, including the model server's own HTTP API
  (Ollama's API has no authentication: pull/delete/create models). This needs the user's approval in the ask modes,
  and happens freely in bypass mode. Protect the model server itself if that matters.
- `/btw` side questions send the question and the card's earlier Q&A to the model through Claude Code (token cost, same
  model server as normal turns); the route is POST, so the Origin check applies.
- Account/cloud slash commands (design-*, schedule, ultrareview, usage-credits) and network plugin marketplaces
  are confirmed first; on the closed network they fail.

## Patterns
- Event format isolation: `lib/event-translator.js` (live events and saved transcripts)
- Unknown /api route -> 404 that names the route and says to restart the server: `public/` is served from disk on
  every request, routes load only at startup, so after an update a new screen may call a route the old server lacks
- Item kinds: user, text, thinking, tool, tool-result, result, command-output, divider, notice (`stopped: true` when a
  stop ended the turn), error
- Session fields beyond settings: `queue` ([{ id, text, images?, files?, at }], persisted), `status`, `costUsd`, `claudeSessionId`, `pinned` (boolean, persisted; set via PATCH, not a CLI setting so no restart; not inherited by forks)
- Sidebar grouping: `session-groups.js` (pure: sessions + mode -> groups: pinned first, then by date or by project folder) feeds `sidebar.js`;
  the mode is per browser in localStorage `claude-gui.sidebar-grouping`. Frontend only
- User items: `{ kind: 'user', text, images?: [{ id, mediaType, name }], files?: [{ id, name, size, path }] }`
- SSE event types: session, removed, item, status, delta, runtime, permission, permission-resolved, tasks
- `tasks` are in the session meta (`/api/state`, `session` events) but not in `data/sessions.json`
- Per-turn changed files: `turn-changes.js` derives a card from `session.items` (the edit tool items from the last user item to the `result`, top level and subagents, minus
  calls with an error tool-result); `thread.js` renders it after result items (history and live); nothing is stored and the card has no `data-item-index`. Frontend only.
  Bash-made changes are invisible to it (the git panel covers those)
- Claude's spark: `working-line.js` (used by `thread.js`) sets `data-state` on the working line (starting -> thinking/writing/tool/waiting ->
  done/error/stopped); all motion is CSS in `public/css/animations.css` (off with prefers-reduced-motion)
- Notifications: `events.js` calls `notify.js` on turn end (SSE `status: idle`) and on a new `permission` request; `notify.js` reads the
  per-browser preferences (localStorage) and fires desktop / sound; `page-status.js` owns the tab title count and brand state. Frontend only
- Panels: `public/js/panels/registry.js` lists them; each exports `render(body, context)`; the context comes from `actions.js`
- Session search: `session-search.js` (pure: sessions + query -> hits with snippets) feeds `sidebar.js`; `search-hits.js` shows the bar and
  outlines in the open thread. Every rendered item node in `thread.js` carries `data-item-index` (its index in `session.items`; `events.js`
  passes it for live items), which is how a hit finds its message. Frontend only
