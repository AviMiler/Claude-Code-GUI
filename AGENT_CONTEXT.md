# Agent Context
_Last updated: 2026-10-27 — after adding full-text session search (on top of the background tasks panel, /btw side questions, notifications, images and file attachments, the the queue, folder browser, inline skills, warm-up, system models, animations, copy buttons)_

## What This Project Is
A local web GUI for the Claude Code CLI that looks and works like the Claude desktop app (Code tab), in Hebrew/RTL.
A zero-dependency Node.js server keeps one long-lived `claude -p --input-format stream-json --output-format stream-json`
process per session and talks to it with the CLI's control protocol. Everything the terminal offers under `/`
is reachable: every slash command, skills, agents, MCP servers, plugins, hooks, memory, permissions, context, resume.
Built for a corporate Windows machine without another terminal.

## Current State
- ✅ Working: sessions (create from the welcome page, rename, delete, fork, clear), token streaming, thinking, tool rows
  (terminal, diffs, todos, nested subagents), interactive permission prompts, AskUserQuestion cards, plan approval,
  stop/interrupt, message queue (Enter while running), folder browser (welcome page, /add-dir), `/` skills mid-sentence,
  CLI warm-up while typing, model list from the model server, Claude's animated states, copy button per message,
  attachments of any type (+ menu, paste, drag): images to the model as images, other files by path,
  live model/mode switch, Shift+Tab mode cycling, `/` menu with the live CLI catalog, `@` files + agents,
  17 settings panels (model, permissions, context/usage, git diff, resume, skills, agents, MCP, plugins, hooks, memory,
  settings files, status/doctor, appearance, help, notifications, background tasks), light/dark theme, persistence to `data/sessions.json`,
  user-chosen notifications (desktop, sound, tab title), `/btw` side questions (not in thread, not persisted),
  background tasks panel `/tasks` (live status, stop, output; topbar chip; in memory only),
  full-text search across all sessions in the sidebar (snippets, match bar in the thread)
- ✅ Tested: end-to-end against `dev/fake-claude.js` (message flow, permissions, questions, plan, stop, /cost, fork,
  clear, failures) in a real browser; catalog and control requests against the real Claude Code 2.1.308 binary
- ✅ Tested with real model turns on Claude Code 2.1.308, 2.1.310 and **2.1.246 (the closed machine's version)**:
  permissions (allow, deny with feedback), questions, plan approval, stop, live model switch, fork, resume, clear
- ✅ Tested on 2026-10-27 against the fake CLI only (with `FAKE_CLAUDE_STARTUP_MS=2500`) in a real browser: queue
  (order, edit, remove, stop returns texts), folder browser, inline skills, warm-up (first answer 2.8 s -> 0.1 s),
  non-blocking menus, model list with 1 and 3 models from a fake `/v1/models`, all spark states, copy buttons,
  attachments (picker, paste, shrink of a 3000 px PNG to 1568, text file by path, queue + stop restore, re-send by
  reference) and their security checks (fake type, traversal, download headers)
- 🎯 Target: closed (offline) machine with Claude Code 2.1.246 and a local qwen model (`config.json`: ANTHROPIC_BASE_URL + qwen model);
  development machine runs the same CLI version against Anthropic. Get 2.1.246 with `npm pack @anthropic-ai/claude-code-win32-x64@2.1.246`
- 🚧 Not tested: the `claude plugin` JSON shapes with installed plugins, the corporate Ollama setup (`config.json`);
  everything from 2026-10-27 with the real CLI: spare adoption on 2.1.246, whether the proxy at the configured
  ANTHROPIC_BASE_URL answers `/v1/models`, whether qwen invokes a skill named mid-sentence, whether the local model
  accepts image blocks (vision) — without vision the turn fails with the model server's error;
  `/btw` with the real CLI: the response shape (`response`, `fallback_notice`) comes from reading the 2.1.311 binary,
  and whether 2.1.246 supports `side_question` is unknown (the GUI then shows a neutral "not available" note);
  background tasks with the real CLI: event shapes come from reading the 2.1.311 binary, 2.1.246 may lack the task events,
  `stop_task` or `get_task_output` (neutral notes exist, untested), and the real field name of the `get_task_output`
  response is unknown (the panel reads output/content/text/tail defensively)
- ❌ Known limits: images of resumed CLI conversations are not shown (only "[תמונה]"); non-image files reach the model
  only as paths it must read; terminal-only commands (login, ide, remote-control, ...) are
  listed but only explained; partial streamed text of a stopped turn is not kept
- ⚠️ Known security issues, accepted on purpose (closed network, single user; details in ARCHITECTURE.md → Security):
  1. Cross-site GET: a website open in the same browser can trigger GET endpoints (no Origin is sent for simple GETs).
     Responses are unreadable, but `/api/catalog?cwd=` starts a `claude` probe in any folder (in `-p` mode the folder's
     own settings/hooks load without a trust prompt), `/api/git` runs git there, `/api/folders` lists folders,
     `/api/models` makes the server call the model server, and repeated calls can exhaust memory.
  2. No authentication: any program or user on the machine can use the API on 127.0.0.1 — including sessions in
     bypassPermissions mode (run any command), writing ~/.claude settings (hooks = persistence), starting CLI processes
     (`/api/warm`) and creating folders (`POST /api/folders`).
  Fix when needed: random token generated at startup and required on every /api call (cookie or header), reject
  `Sec-Fetch-Site: cross-site`, and make the process-starting endpoints POST.

## Last Changes
- 2026-10-27 — Full-text session search (feature 4 of 12): the sidebar search matches message text (user, Claude, shell commands; niqqud and case ignored),
  shows snippet + count, opens the session with a "k מתוך N" bar (▲ ▼, Esc). Frontend only: public/js/session-search.js, search-hits.js, `data-item-index`
  on thread items. Also moved the chip dropdowns from app.js to chip-menus.js (app.js still 175 lines, over budget). Verified in Chromium against the fake CLI.
- 2026-10-27 — Background tasks panel `/tasks` (feature 3 of 12): live list of the session's shell/subagent/Monitor tasks with stop and output,
  topbar chip "N ברקע". lib/task-tracker.js (memory only), `readTaskEvent` in event-translator, hooks in session-runtime / session-service,
  public/js/panels/panel-tasks.js. Idle shutdown now waits for running tasks; a closed CLI turns running tasks into "killed".
  Verified in a browser against the fake CLI only (incl. crash, kill -9, idle shutdown, reload); real CLI untested (see Current State).
- 2026-10-27 — `/btw` side questions (feature 2 of 12): card above the composer, answered by the CLI's `side_question` control request
  without touching the running turn or the thread: lib/side-questions.js, POST /api/sessions/:id/side-question, public/js/side-question.js.
  Fake CLI gained a `side_question` handler. Verified in a browser against the fake CLI only; real CLI untested (see Current State).
- 2026-10-27 — Notifications (desktop / sound / tab title; done, waiting, error; away or always) chosen in the "התראות" panel:
  public/js/notify.js, page-status.js, panels/panel-notifications.js. Tab-title "(N)" now = waiting + finished-unread, can be turned off.
  First spec.md created; requirements live there from now on. Not re-checked in browser: title preference off.
- 2026-10-27 — Images and files attached to messages (lib/images.js, lib/uploads.js, public/js/attachments.js);
  every session gets `--add-dir data/uploads`; body limit 90 MB.
- 2026-10-27 — Folder browser: a missing start folder opens the default/home folder, Explorer's quoted paths work,
  and an unknown /api route says to restart the server (the cause of "no paths found" after an update).
- 2026-10-27 — Icon-only copy button under every user message and Claude answer (copies the original Markdown).
- 2026-10-27 — CLI warm-up while typing (spare process for new sessions), non-blocking `/` and model menus, catalog
  prefetch, model list from the model server (lib/model-list.js), state animations of Claude's spark (css/animations.css).
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
- After pulling an update: restart `node server.js`. Files in `public/` are read from disk on every load, but API
  routes load only at startup, so a new screen against an old server fails (the 404 says so).
- Develop without an API key: `CLAUDE_GUI_CONFIG=dev/config.fake.json CLAUDE_GUI_DATA=<temp dir> node server.js` (port 3738).
  `dev/fake-claude.cmd` runs on Windows only; elsewhere point `claudePath` at a shell script that runs
  `node dev/fake-claude.js "$@"`. Add `"FAKE_CLAUDE_STARTUP_MS": "2500"` under `env` to feel the real startup delay.
  For the model list, point `ANTHROPIC_BASE_URL` at any small server answering `GET /v1/models` with `{ data: [{ id }] }`.

## Key Patterns Used
- All knowledge of the CLI event format is in `lib/event-translator.js`; control-protocol calls in `lib/cli-process.js`
- Every UI update flows through one path: server broadcast -> SSE -> `public/js/events.js` -> views
- Slash commands: `public/js/commands-data.js` (built-ins of 2.1.308 + Hebrew text + where each runs) merged with the
  live catalog from the CLI in `public/js/command-catalog.js`; executed by `public/js/command-runner.js`
- Optional CLI flags are passed only when `claude --help` lists them (`lib/cli-capabilities.js`)
- The browser can only reach Claude's own files through kinds (`lib/claude-files.js`) and whitelisted CLI subcommands
  and options (`lib/cli-commands.js`); writes need an explicit folder (no fallback to the home folder)
- The UI never waits for the CLI to open a menu: read cached data (`peekCatalog`, `peekModels`) and update when the
  real answer arrives; background reads pass `ifRunning` so they never start a process
- Claude's state is a `data-state` on the working line (`thread.js` `currentState`); motion lives only in `public/css/animations.css`
- Significant actions are never blocked, only confirmed: panels get `guardedApi` from `public/js/risk.js` (settings with
  hooks/env/allow rules, user-wide files, MCP add, plugin install/marketplaces); also bypass/auto mode and slash commands
  that act on the Anthropic account or the cloud (design-*, schedule, ultrareview, usage-credits)

## Next Steps
- [ ] Run one real conversation on the corporate machine and adjust `lib/event-translator.js` if needed
- [ ] On the corporate machine: check `/api/models` against the real ANTHROPIC_BASE_URL, and the warm-up (first answer
      time, memory of the spare process) with Claude Code 2.1.246
- [ ] On the corporate machine: send one image to check the local model's vision, and one file to check the Read path
- [ ] On the corporate machine: try `/btw` (does 2.1.246 support `side_question`? real response shape)
- [ ] On the corporate machine: try `/tasks` (does 2.1.246 emit task events and support `stop_task` / `get_task_output`? real output response field)
- [ ] Split `lib/session-service.js` (283 lines) and `lib/session-runtime.js` (243) — over the ~150-line budget

## Gotchas / Watch Out
- Background tasks: idle shutdown (`scheduleIdle` in session-runtime) is skipped while `runtime.runningTasks > 0` and re-armed when the last task
  ends, so such a process outlives `idleMinutes` (100–300 MB) on purpose. Tasks are never persisted; when the CLI exits (crash, kill, idle,
  between turns) running tasks become `killed`. A `task_started` always creates a fresh record because a restarted CLI may reuse ids.
  `stop_task` / `get_task_output` are in the no-token `/control` whitelist (write / read). The fake CLI's "task" keyword runs `FAKE_TASK_MS` (8000)
- `/btw`: `side_question` costs tokens, so it has its own route and is NOT in the generic `/control` whitelist (catalog-service
  `WRITE_SUBTYPES`, documented as no-token with short timeouts). The unsupported-CLI error must keep the text "not supported by this
  Claude Code version" so `isUnsupported` (panels/kit.js) matches it. The fake CLI now answers unknown control subtypes with
  "Unsupported control request subtype: X" like the real one
- Notifications: preferences in localStorage `claude-gui.notifications`; triggers are in `events.js` (`status: idle` -> done/error from the items
  after the last user item, a stopped turn notifies nothing; `permission` with a new requestId -> waiting). Browsers need a click before the
  Notification permission prompt and before WebAudio plays (panel buttons give it; audio unlocks on the first click/key). Corporate browser
  policy may block notifications — the panel shows the permission state. The tab title is built only in `page-status.js`
- Stale server: `public/` changes take effect on reload, `lib/` changes only after restarting `node server.js`.
  An unknown /api route answers "נתיב API לא קיים: … צריך להפעיל מחדש את השרת" — keep that message when touching routing
- Warm-up: typing calls POST /api/warm. A spare process (id `spare-…`) is used by `createSession` only if cwd, mode,
  model and effort match exactly; it closes after 3 idle minutes. Never key anything else on the runtime's sessionId
  before adoption — `adoptSpare` changes it
- Models: with one model in the system the chip is static on purpose (user request: no switch = no menu).
  A base URL on anthropic.com counts as Anthropic (CLI list), so a dev shell exporting it does not hide the menu
- The spark's rays exist twice: `icons.js` (`spark`) and the inline SVG of the brand in `public/index.html`.
  Change both; animations rely on 8 `.ray` paths with `--i` 0..7 clockwise from the top
- Attachments: messages and queue entries keep only references (`images: [{ id, mediaType, name }]`,
  `files: [{ id, name, size, path }]`); bytes are read again when the turn is sent (`images.userContent`,
  `uploads.messageText`). A plain-text message stays a string, so slash commands still work; with attachments the
  composer never treats the text as a GUI command
- Attachments taken off the queue are not deleted (they may be sent again by reference); `sweep` at startup removes
  unreferenced ones older than a day, and deleting a session removes the ones no other session (fork) uses
- `/api/images/:id` and `/api/uploads/:id/:name` are served before the JSON routes (raw bytes) in `lib/api-routes.js`
- `session-service` keeps `lastConfig` from the last request: queued messages start from a turn end, which has no config
- Copy buttons find their text through a WeakMap in `render-items.js` (`copySourceOf`), not a data attribute;
  live streaming answers get the button only when the final item arrives
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
- The GUI server's only network call is GET {ANTHROPIC_BASE_URL}/v1/models (lib/model-list.js, 4 s timeout, cached 5 min,
  only for a custom base URL). Everything else outside the machine happens through Claude Code
  (model API calls, MCP/plugins) or through tools Claude runs (Bash can reach the model server's HTTP API — e.g.
  Ollama's unauthenticated /api/delete — when the user approves it or in bypass mode)
- Requiring `lib/session-store.js` registers an exit hook that writes `data/sessions.json`; set `CLAUDE_GUI_DATA` in experiments
