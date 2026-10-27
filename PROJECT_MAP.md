# Project Map
_Last updated: 2026-10-27 (added public/js/split-view.js, warm-up.js, css/split.css; earlier: turn-stats.js, lib/model-health.js, public/js/model-health.js; earlier: lib/file-view.js, public/js/file-viewer.js; earlier: turn-changes.js, working-line.js, lib/templates.js, templates.js, panels/panel-templates.js, session-groups.js, session-search.js, search-hits.js, chip-menus.js)_

## File Tree
```
./AGENT_CONTEXT.md  ./ARCHITECTURE.md  ./CHANGELOG.md  ./DEPENDENCIES.md  ./PROJECT_MAP.md
./config.json
./server.js
./dev/config.fake.json  ./dev/fake-claude.cmd  ./dev/fake-claude.js
./lib/api-routes.js  ./lib/api-routes-tools.js  ./lib/catalog-service.js  ./lib/claude-files.js
./lib/cli-args.js  ./lib/cli-capabilities.js  ./lib/cli-commands.js  ./lib/cli-process.js  ./lib/config.js
./lib/event-hub.js  ./lib/event-translator.js  ./lib/failure-messages.js  ./lib/file-view.js  ./lib/http-utils.js  ./lib/model-list.js  ./lib/model-health.js  ./lib/images.js  ./lib/uploads.js
./lib/session-runtime.js  ./lib/session-service.js  ./lib/session-store.js  ./lib/side-questions.js  ./lib/spawn-utils.js
./lib/static-files.js  ./lib/task-tracker.js  ./lib/templates.js  ./lib/transcripts.js  ./lib/workspace-info.js
./public/index.html  ./public/icon.svg
./public/css/tokens.css  ./public/css/layout.css  ./public/css/messages.css  ./public/css/composer.css  ./public/css/panels.css  ./public/css/animations.css  ./public/css/split.css
./public/js/app.js  ./public/js/events.js  ./public/js/notify.js  ./public/js/page-status.js  ./public/js/state.js  ./public/js/api.js  ./public/js/actions.js
./public/js/thread.js  ./public/js/working-line.js  ./public/js/turn-changes.js  ./public/js/turn-stats.js  ./public/js/render-items.js  ./public/js/render-tools.js  ./public/js/markdown.js
./public/js/composer.js  ./public/js/composer-menus.js  ./public/js/popover.js  ./public/js/prompt-cards.js
./public/js/sidebar.js  ./public/js/session-groups.js  ./public/js/session-search.js  ./public/js/search-hits.js  ./public/js/chip-menus.js  ./public/js/side-question.js  ./public/js/file-viewer.js  ./public/js/model-health.js  ./public/js/split-view.js  ./public/js/warm-up.js  ./public/js/templates.js  ./public/js/chrome.js  ./public/js/folder-browser.js  ./public/js/attachments.js  ./public/js/ui.js  ./public/js/risk.js  ./public/js/dom.js  ./public/js/icons.js  ./public/js/modes.js
./public/js/commands-data.js  ./public/js/command-catalog.js  ./public/js/command-runner.js
./public/js/panels/registry.js  ./public/js/panels/panel-host.js  ./public/js/panels/kit.js  ./public/js/panels/file-editor.js
./public/js/panels/panel-model.js  ./public/js/panels/panel-permissions.js  ./public/js/panels/panel-usage.js
./public/js/panels/panel-workspace.js  ./public/js/panels/panel-skills.js  ./public/js/panels/panel-agents.js
./public/js/panels/panel-mcp.js  ./public/js/panels/panel-plugins.js  ./public/js/panels/panel-config.js
./public/js/panels/panel-status.js  ./public/js/panels/panel-help.js  ./public/js/panels/panel-notifications.js  ./public/js/panels/panel-tasks.js  ./public/js/panels/panel-templates.js
```
Also at the root: `./spec.md` (permanent requirements).

## File Descriptions
| File | Description |
|---|---|
| `server.js` | Entry point. HTTP server, request guard, routing to API or static files. |
| `config.json` | Port, `claudePath`, `model`, default folder, `idleMinutes`, extra environment variables. |
| `dev/fake-claude.js` | Fake CLI speaking stream-json + control protocol, for developing without an API key. `FAKE_CLAUDE_STARTUP_MS` simulates the real CLI's startup time; replies list the images it received; answers `side_question` (600 ms); the word "task" starts a background task (progress after 1.5 s, done after `FAKE_TASK_MS`, default 8000) and `stop_task` / `get_task_output` are answered; "ask" matches the whole word only; unknown control subtypes with "Unsupported control request subtype: X". |
| `dev/fake-claude.cmd`, `dev/config.fake.json` | Shim and config to run the GUI against the fake CLI (port 3738). The shim is Windows-only. |
| `lib/config.js` | Loads `config.json` (or `CLAUDE_GUI_CONFIG`) with defaults. |
| `lib/http-utils.js` | JSON helpers, `httpError`, Host/Origin guard. |
| `lib/static-files.js` | Serves `public/` safely. |
| `lib/event-hub.js` | SSE clients and broadcast. |
| `lib/session-store.js` | In-memory sessions with persistence to `data/sessions.json` (or `CLAUDE_GUI_DATA`); attachments live next to it in `data/images/` and `data/uploads/`. |
| `lib/spawn-utils.js` | How to start `claude` (cmd.exe quoting) and run it to completion. |
| `lib/cli-capabilities.js` | Reads `claude --help/--version`: version, flags, permission modes. |
| `lib/cli-args.js` | Flags for a session process, filtered by capabilities (always `--add-dir` for the uploads folder). |
| `lib/cli-process.js` | One long-lived stream-json process and its control protocol. |
| `lib/session-runtime.js` | Process per session: start, route events, permission prompts, interrupt, idle shutdown (skipped while background tasks run); warm-up while typing and the spare process for a new session. |
| `lib/event-translator.js` | CLI `stream-json` events -> UI items and streaming deltas; `readTaskEvent` normalizes `task_started` / `task_progress` / `task_notification`; `translateResult` keeps time (`durationMs`, `durationApiMs`), cost, rounds and usage (input, output, cacheRead, cacheWrite). |
| `lib/task-tracker.js` | Background tasks of each session, in memory only (they die with the CLI process): apply/list/endAll/forget, 50 per session, a `started` event always starts a fresh record. |
| `lib/failure-messages.js` | Hebrew explanation of a failed CLI process. |
| `lib/session-service.js` | Glue: sessions, messages and their queue, stop, clear, fork, permissions, settings, warm-up; broadcasts the `tasks` SSE event and marks running tasks "killed" when the CLI exits. |
| `lib/side-questions.js` | `/btw`: validates and sends the CLI's `side_question` control request (10 min timeout, starts the CLI if needed); returns `{ response, notice }`; unsupported CLI -> 501. Costs tokens. |
| `lib/catalog-service.js` | Commands/skills/agents/models catalog and whitelisted control requests (session, warm spare, or probe; incl. `get_task_output`, `stop_task`); `ifRunning` reads never start a process. |
| `lib/images.js` | Images attached to messages: validation (type, magic bytes, 5 MB), storage in `data/images/`, image blocks for the CLI, serving, cleanup. |
| `lib/uploads.js` | Other attached files: storage in `data/uploads/<id>/<name>`, the "[Attached files]" paths in the message, download serving, cleanup; the folder every session gets with `--add-dir`. |
| `lib/model-list.js` | Models the user can switch between: model server (/v1/models) + config.json, or the CLI's list on Anthropic. Exports `envOf` / `isAnthropic` (used by `model-health.js`). |
| `lib/model-health.js` | Is the model server up? `checkModelServer(config, {refresh})`: the same read-only GET /v1/models, only for a custom base URL (Anthropic/none -> `unknown`, no request); up = 2xx, down = timeout / connection error / any non-2xx; cached 15 s; URL shown without credentials, token never returned. |
| `lib/cli-commands.js` | Whitelisted `claude mcp|plugin|doctor|auth ...` subcommands. |
| `lib/claude-files.js` | Read/write settings, CLAUDE.md, agents, skills, commands, output styles by kind. |
| `lib/transcripts.js` | Past CLI conversations of a folder (/resume) and their import (the user's images are stored via `lib/images.js` and shown as thumbnails; failed ones marked "[תמונה]"; listing/titles use the text marker). |
| `lib/workspace-info.js` | Folder browser listing/creation, file search for @-mentions, git status/diff. |
| `lib/api-routes.js` | Route table and session routes (messages with attachments, queue, stop, warm, side-question, permissions...); serves `/api/images` and `/api/uploads` as raw bytes. |
| `lib/templates.js` | Prompt templates the user saves and reuses, in `data/templates.json` next to `sessions.json`: list (newest first), save (create or update; name 80, text 20000, 200 max; temp file + rename), remove (404 when missing). |
| `lib/file-view.js` | Read-only text of a file for the file viewer: only inside the session's folder, `addDirs` and the uploads folder (roots from the session, real paths, separator boundary); relative paths against the cwd; 404 missing, 400 directory, 403 outside, 415 binary; 2 MB cap with `truncated`; `totalLines` excludes the final newline. |
| `lib/api-routes-tools.js` | Routes behind the panels (catalog, control, models, cli, files, transcripts, git, folders, templates, `GET /api/file-view`, `GET /api/model-health`). |
| `public/index.html` | Page shell (RTL, Hebrew): sidebar, top bar, thread, composer area, the split-view pane (`<aside id="split-pane">`); the model health dot (`#model-health`) in the sidebar footer. The brand spark is inline SVG (same rays as `icons.js`). |
| `public/css/tokens.css` | Colors (light/dark), fonts, base elements. |
| `public/css/layout.css` | Sidebar (incl. search snippets, grouping switch, pin button), top bar, search-matches bar and hit outlines in the thread, welcome page, buttons, the model health dot. |
| `public/css/messages.css` | Messages and their copy buttons, thinking, tool rows, diffs, todos, results, working line, the per-turn changed-files card, the open-file buttons. |
| `public/css/composer.css` | Composer, chips, queue strip, popover menus, permission/question/plan cards, the `/btw` side card. |
| `public/css/panels.css` | File viewer dialog, settings modal, panel building blocks, dialogs (incl. the folder browser), toasts, template editor, variable fill dialog and the "+" menu template search. |
| `public/css/split.css` | Split view (split-view.js): a second session in a pane beside the main thread. |
| `public/css/animations.css` | Claude's spark in each state (starting, thinking, writing, tool, waiting, done/error/stopped), welcome, sidebar. |
| `spec.md` | Permanent requirements confirmed by the user (platform constraints, Notifications, /btw side questions, Background tasks, Full-text session search, Sidebar pinning and grouping, Prompt templates, Per-turn changed-files summary, Model server health indicator, File viewer, Per-turn stats, Images in resumed conversations, Split view); new permanent features are added here. |
| `public/js/app.js` | Frontend entry: wiring, refresh (also refreshes the split pane), keyboard shortcuts (incl. Ctrl+\ for the split view), sidebar search (150 ms debounce, Enter opens the first result, `openFromSidebar`); page status via `page-status.js`; chip dropdowns via `chip-menus.js`; passes `onOpenGit` to the thread (the changed-files card's "git diff" button); enables the file viewer links (`enableFileLinks`); creates the model health dot (`createModelHealth`, `eventView.onTurnFailed`); creates the split view (`createSplitView`, `eventView.paneThread`, topbar `onSplit`). Warm-up and prefetch live in `warm-up.js`. Still over the size budget (162 lines). |
| `public/js/warm-up.js` | Work done ahead of the user: start Claude Code while a message is typed, and fetch the catalog before a menu opens. Moved verbatim from app.js. |
| `public/js/split-view.js` | `createSplitView({app, pane, selectMain, openPanel, onChange})` -> `{toggle, refresh, threadFor, sessionId}`: a second pane beside the main thread with another session: header (picker of the other sessions, swap "פתיחה בחלון הראשי", close), its own `createThread`, approval cards, and a mini composer (text, send, stop; outward slash commands confirmed; no attachments / menus / `/btw`). Never the same session as the main pane. Per browser (localStorage `claude-gui.split-open`, `claude-gui.split-session`). Refuses below 1000 px. |
| `public/js/chip-menus.js` | Dropdowns of the composer's chips: permission mode, model + effort, and the "+" menu (moved from app.js; has the "תבניות פרומפטים" item: searchable template list + "ניהול תבניות…"). |
| `public/js/templates.js` | Using prompt templates in the composer: the "+" menu's searchable list, `{{variable}}` parsing (any-script names, unique, order of first appearance), and the fill form. The filled text is inserted into the composer (replaces an empty one, appended to a draft), never sent by itself. |
| `public/js/session-search.js` | Full-text search over every session's messages (user, Claude's text incl. subagents, shell commands): case-insensitive, ignores niqqud, newest 3000 items per session, count capped at 99; returns hits with snippets. Pure, no DOM. |
| `public/js/search-hits.js` | Search matches inside the open conversation: sticky bar "k מתוך N" with ▲ ▼ and close (Enter / Shift+Enter / Esc), outlines the matching messages, scrolls to the current one; cleared on session change. |
| `public/js/events.js` | Applies SSE events to state and views (`runtime` ends the working line's "starting" state); triggers notifications (turn end, new permission request); routes item / delta / status / runtime / permission events to every thread showing the session (main thread if active + `view.paneThread(id)`), unread only when the session is on screen nowhere; handles the `tasks` event (also as window event `claude-gui:tasks`); passes the item index and `session.items` for live items (`data-item-index`; the items let the thread build the changed-files card); calls `view.onTurnFailed()` when a finished turn's outcome is an error (rechecks the model health dot). |
| `public/js/notify.js` | User-chosen notifications (desktop, sound, tab-title count) when a turn ends, waits for approval or fails (`notify(kind, session, {onScreen, onOpen})`; "away" = hidden / unfocused / not shown in the main or split pane); preferences in localStorage `claude-gui.notifications`. |
| `public/js/page-status.js` | Page-wide status: the brand spark (busy / waiting) and the tab title with the count of sessions that need the user (waiting or finished-unread). |
| `public/js/state.js` | Client state, cached catalog (`getCatalog` / non-waiting `peekCatalog`), system models (`getModels`/`peekModels`), recent folders. |
| `public/js/api.js` | Fetch wrappers (incl. `modelHealth`, `viewFile`, `sideQuestion`, `templates` / `saveTemplate` / `deleteTemplate`) and SSE subscription. |
| `public/js/actions.js` | Session actions (incl. `sideQuestion`, `setPinned`) and the context given to panels (incl. `composerText()`). |
| `public/js/thread.js` | Conversation view: items, live streaming (`append(item, index, items)`), message copy; shows the working line from `working-line.js` and the changed-files card from `turn-changes.js` after each result (history in `show`, live in `append`); passes each result item its tool-call count (`resultContext`, history and live); every item node carries `data-item-index` (index in `session.items`) so search hits can find it (the card has none). |
| `public/js/working-line.js` | The "working" line under a running turn: Claude's spark in the current state (`data-state`: starting, thinking, writing, tool, waiting, done/error/stopped; animated in css/animations.css), a verb, the elapsed time, and a short done/error/stopped moment when the turn ends. Moved from thread.js. |
| `public/js/turn-changes.js` | "Files changed in this turn" card after a turn's `result`: files written by Edit, MultiEdit, Write ("נכתב"), NotebookEdit (top level and subagents; error results skipped; edits to a file merged) with +/− counts; click a file for that turn's diffs, "הכול" for all, "git diff" opens the git panel, a row button opens the file viewer. Recomputed from the session's items, nothing stored; turns without edits show nothing. |
| `public/js/render-items.js` | Items -> DOM (user messages with image thumbnails and file chips, copy buttons); the result meta line from `turn-stats.js` (`appendItem(container, item, context)`, context = `{ toolCalls }`); Markdown export. |
| `public/js/turn-stats.js` | Numbers of one finished turn for its meta line and tooltip: time, output tokens/s (API time, or total time when unknown), tokens in/out (input includes cache), rounds, tool calls, cost when above 0. `countToolCalls(items, resultIndex)` counts `tool` items back to the last user item. Nothing stored. |
| `public/js/render-tools.js` | Tool rows: terminal, diffs, todos, results, the open-file button on file tools; `toolMeta` (verb/target of a tool, also used by the working line). |
| `public/js/markdown.js` | Safe Markdown renderer with code copy. |
| `public/js/composer.js` | Message box, chips, send/stop, attachments (picker, paste, drop), queue strip, history, Shift+Tab. |
| `public/js/composer-menus.js` | `/` command menu (whole message), `/` skills menu mid-sentence, `@` mention menu. |
| `public/js/popover.js` | Dropdowns and keyboard-driven list menus. |
| `public/js/prompt-cards.js` | Permission, AskUserQuestion and plan-approval cards. |
| `public/js/side-question.js` | `/btw` card above the composer: question, loader, Markdown answer, follow-ups with history, close/Esc; closes on session change. Nothing persisted. |
| `public/js/file-viewer.js` | File viewer dialog: the file's current text with line numbers, the lines a tool read or wrote highlighted and scrolled into view (Read offset/limit, Edit/MultiEdit `new_string`, Write whole file), copy path / content, Esc / backdrop; textContent only, first 20000 lines. `enableFileLinks` is the one delegated click listener for every open button (wired in app.js). |
| `public/js/model-health.js` | `createModelHealth`: the model server's health dot in the sidebar footer (green up, red down, grey unknown). Checks on load, every 60 s while the tab is visible, after a failed turn (silent) and on a click (refresh + toast); one request at a time; tooltip with URL, latency, error. |
| `public/js/session-groups.js` | How the sidebar groups sessions: pinned first ("מוצמדים"), then by date or by project folder (collision titles "parent/name"); the mode is in localStorage `claude-gui.sidebar-grouping`. Pure, no DOM. |
| `public/js/sidebar.js` | Session list: "לפי תאריך / לפי פרויקט" switch, pinned sessions first, rows with a pin button (hover; always visible when pinned), grouping from `session-groups.js`, with a search over names, folders and the text of every conversation (snippet with the match marked + match count; empty state "אין סשנים או הודעות תואמים"). |
| `public/js/chrome.js` | Top bar (incl. the split-view button, the "N ברקע" chip that opens the tasks panel, and the "עוד" menu item pin/unpin) and welcome page. |
| `public/js/attachments.js` | Composer attachments: read files, shrink images, limits, conversion to what the server stores and back (queue restore). |
| `public/js/folder-browser.js` | "Open folder" dialog (welcome page, /add-dir) over GET/POST /api/folders; falls back to the default/home folder, accepts Explorer's quoted paths. |
| `public/js/ui.js` | Toasts, confirm/prompt dialogs, theme. |
| `public/js/risk.js` | Confirmations before significant actions (`guardedApi`, risky modes, account/cloud commands). |
| `public/js/dom.js` | `h()` element helper and small utilities. |
| `public/js/icons.js` | Inline SVG icons (incl. `bell`, `pin`, `columns`); `spark` is Claude's mark with one path per ray (`--i`) for animations.css. |
| `public/js/modes.js` | Permission modes and effort levels. |
| `public/js/commands-data.js` | Built-in slash commands of 2.1.308, Hebrew text, where each runs. |
| `public/js/command-catalog.js` | Merge with the live CLI catalog, grouping, filtering, parsing. |
| `public/js/command-runner.js` | Executes a slash command (panel, action incl. `btw`, CLI, terminal-only). |
| `public/js/panels/registry.js` | List of panels in navigation order. |
| `public/js/panels/panel-host.js` | Settings-style modal with side navigation. |
| `public/js/panels/kit.js` | Panel building blocks (sections, rows, badges, fields, loading). |
| `public/js/panels/file-editor.js` | Inline editor for Claude's own files. |
| `public/js/panels/panel-notifications.js` | Notifications panel: the user picks the channels (desktop, sound, tab title), the events, and when to be told; test button, permission state. |
| `public/js/panels/panel-tasks.js` | Background tasks panel (`/tasks`): live list with status, usage, last tool, summary; stop and output tail; neutral note on CLIs without the requests. |
| `public/js/panels/panel-templates.js` | Prompt templates panel (id `templates`, group session): create, edit, duplicate, delete and use saved prompts with `{{variables}}`; "שמירת ההודעה הנוכחית כתבנית" when the composer has text. |
| `public/js/panels/panel-*.js` | One panel each: model (system models, folder browser for /add-dir), permissions, usage, workspace (diff/resume), skills, agents, mcp, plugins, config (hooks/memory/settings), status (+appearance), help. |
