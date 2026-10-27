# Project Map
_Last updated: 2026-10-27 (added lib/templates.js, public/js/templates.js, panels/panel-templates.js; earlier: session-groups.js, session-search.js, search-hits.js, chip-menus.js)_

## File Tree
```
./AGENT_CONTEXT.md  ./ARCHITECTURE.md  ./CHANGELOG.md  ./DEPENDENCIES.md  ./PROJECT_MAP.md
./config.json
./server.js
./dev/config.fake.json  ./dev/fake-claude.cmd  ./dev/fake-claude.js
./lib/api-routes.js  ./lib/api-routes-tools.js  ./lib/catalog-service.js  ./lib/claude-files.js
./lib/cli-args.js  ./lib/cli-capabilities.js  ./lib/cli-commands.js  ./lib/cli-process.js  ./lib/config.js
./lib/event-hub.js  ./lib/event-translator.js  ./lib/failure-messages.js  ./lib/http-utils.js  ./lib/model-list.js  ./lib/images.js  ./lib/uploads.js
./lib/session-runtime.js  ./lib/session-service.js  ./lib/session-store.js  ./lib/side-questions.js  ./lib/spawn-utils.js
./lib/static-files.js  ./lib/task-tracker.js  ./lib/templates.js  ./lib/transcripts.js  ./lib/workspace-info.js
./public/index.html  ./public/icon.svg
./public/css/tokens.css  ./public/css/layout.css  ./public/css/messages.css  ./public/css/composer.css  ./public/css/panels.css  ./public/css/animations.css
./public/js/app.js  ./public/js/events.js  ./public/js/notify.js  ./public/js/page-status.js  ./public/js/state.js  ./public/js/api.js  ./public/js/actions.js
./public/js/thread.js  ./public/js/render-items.js  ./public/js/render-tools.js  ./public/js/markdown.js
./public/js/composer.js  ./public/js/composer-menus.js  ./public/js/popover.js  ./public/js/prompt-cards.js
./public/js/sidebar.js  ./public/js/session-groups.js  ./public/js/session-search.js  ./public/js/search-hits.js  ./public/js/chip-menus.js  ./public/js/side-question.js  ./public/js/templates.js  ./public/js/chrome.js  ./public/js/folder-browser.js  ./public/js/attachments.js  ./public/js/ui.js  ./public/js/risk.js  ./public/js/dom.js  ./public/js/icons.js  ./public/js/modes.js
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
| `lib/event-translator.js` | CLI `stream-json` events -> UI items and streaming deltas; `readTaskEvent` normalizes `task_started` / `task_progress` / `task_notification`. |
| `lib/task-tracker.js` | Background tasks of each session, in memory only (they die with the CLI process): apply/list/endAll/forget, 50 per session, a `started` event always starts a fresh record. |
| `lib/failure-messages.js` | Hebrew explanation of a failed CLI process. |
| `lib/session-service.js` | Glue: sessions, messages and their queue, stop, clear, fork, permissions, settings, warm-up; broadcasts the `tasks` SSE event and marks running tasks "killed" when the CLI exits. |
| `lib/side-questions.js` | `/btw`: validates and sends the CLI's `side_question` control request (10 min timeout, starts the CLI if needed); returns `{ response, notice }`; unsupported CLI -> 501. Costs tokens. |
| `lib/catalog-service.js` | Commands/skills/agents/models catalog and whitelisted control requests (session, warm spare, or probe; incl. `get_task_output`, `stop_task`); `ifRunning` reads never start a process. |
| `lib/images.js` | Images attached to messages: validation (type, magic bytes, 5 MB), storage in `data/images/`, image blocks for the CLI, serving, cleanup. |
| `lib/uploads.js` | Other attached files: storage in `data/uploads/<id>/<name>`, the "[Attached files]" paths in the message, download serving, cleanup; the folder every session gets with `--add-dir`. |
| `lib/model-list.js` | Models the user can switch between: model server (/v1/models) + config.json, or the CLI's list on Anthropic. |
| `lib/cli-commands.js` | Whitelisted `claude mcp|plugin|doctor|auth ...` subcommands. |
| `lib/claude-files.js` | Read/write settings, CLAUDE.md, agents, skills, commands, output styles by kind. |
| `lib/transcripts.js` | Past CLI conversations of a folder (/resume) and their import (images marked as "[תמונה]"). |
| `lib/workspace-info.js` | Folder browser listing/creation, file search for @-mentions, git status/diff. |
| `lib/api-routes.js` | Route table and session routes (messages with attachments, queue, stop, warm, side-question, permissions...); serves `/api/images` and `/api/uploads` as raw bytes. |
| `lib/templates.js` | Prompt templates the user saves and reuses, in `data/templates.json` next to `sessions.json`: list (newest first), save (create or update; name 80, text 20000, 200 max; temp file + rename), remove (404 when missing). |
| `lib/api-routes-tools.js` | Routes behind the panels (catalog, control, models, cli, files, transcripts, git, folders, templates). |
| `public/index.html` | Page shell (RTL, Hebrew): sidebar, top bar, thread, composer area. The brand spark is inline SVG (same rays as `icons.js`). |
| `public/css/tokens.css` | Colors (light/dark), fonts, base elements. |
| `public/css/layout.css` | Sidebar (incl. search snippets, grouping switch, pin button), top bar, search-matches bar and hit outlines in the thread, welcome page, buttons. |
| `public/css/messages.css` | Messages and their copy buttons, thinking, tool rows, diffs, todos, results, working line. |
| `public/css/composer.css` | Composer, chips, queue strip, popover menus, permission/question/plan cards, the `/btw` side card. |
| `public/css/panels.css` | Settings modal, panel building blocks, dialogs (incl. the folder browser), toasts, template editor, variable fill dialog and the "+" menu template search. |
| `public/css/animations.css` | Claude's spark in each state (starting, thinking, writing, tool, waiting, done/error/stopped), welcome, sidebar. |
| `spec.md` | Permanent requirements confirmed by the user (platform constraints, Notifications, /btw side questions, Background tasks, Full-text session search, Sidebar pinning and grouping, Prompt templates); new permanent features are added here. |
| `public/js/app.js` | Frontend entry: wiring, refresh, keyboard shortcuts, warm-up while typing, catalog prefetch, sidebar search (150 ms debounce, Enter opens the first result, `openFromSidebar`); page status via `page-status.js`; chip dropdowns via `chip-menus.js`. Still over the size budget (175 lines). |
| `public/js/chip-menus.js` | Dropdowns of the composer's chips: permission mode, model + effort, and the "+" menu (moved from app.js; has the "תבניות פרומפטים" item: searchable template list + "ניהול תבניות…"). |
| `public/js/templates.js` | Using prompt templates in the composer: the "+" menu's searchable list, `{{variable}}` parsing (any-script names, unique, order of first appearance), and the fill form. The filled text is inserted into the composer (replaces an empty one, appended to a draft), never sent by itself. |
| `public/js/session-search.js` | Full-text search over every session's messages (user, Claude's text incl. subagents, shell commands): case-insensitive, ignores niqqud, newest 3000 items per session, count capped at 99; returns hits with snippets. Pure, no DOM. |
| `public/js/search-hits.js` | Search matches inside the open conversation: sticky bar "k מתוך N" with ▲ ▼ and close (Enter / Shift+Enter / Esc), outlines the matching messages, scrolls to the current one; cleared on session change. |
| `public/js/events.js` | Applies SSE events to state and views (`runtime` ends the working line's "starting" state); triggers notifications (turn end, new permission request); handles the `tasks` event (also as window event `claude-gui:tasks`); passes the item index for live items (`data-item-index`). |
| `public/js/notify.js` | User-chosen notifications (desktop, sound, tab-title count) when a turn ends, waits for approval or fails; preferences in localStorage `claude-gui.notifications`. |
| `public/js/page-status.js` | Page-wide status: the brand spark (busy / waiting) and the tab title with the count of sessions that need the user (waiting or finished-unread). |
| `public/js/state.js` | Client state, cached catalog (`getCatalog` / non-waiting `peekCatalog`), system models (`getModels`/`peekModels`), recent folders. |
| `public/js/api.js` | Fetch wrappers (incl. `sideQuestion`, `templates` / `saveTemplate` / `deleteTemplate`) and SSE subscription. |
| `public/js/actions.js` | Session actions (incl. `sideQuestion`, `setPinned`) and the context given to panels (incl. `composerText()`). |
| `public/js/thread.js` | Conversation view: items, live streaming, working line with Claude's state (starting, thinking, writing, tool, waiting, done/error/stopped), message copy; every item node carries `data-item-index` (index in `session.items`) so search hits can find it. |
| `public/js/render-items.js` | Items -> DOM (user messages with image thumbnails and file chips, copy buttons); Markdown export. |
| `public/js/render-tools.js` | Tool rows: terminal, diffs, todos, results; `toolMeta` (verb/target of a tool, also used by the working line). |
| `public/js/markdown.js` | Safe Markdown renderer with code copy. |
| `public/js/composer.js` | Message box, chips, send/stop, attachments (picker, paste, drop), queue strip, history, Shift+Tab. |
| `public/js/composer-menus.js` | `/` command menu (whole message), `/` skills menu mid-sentence, `@` mention menu. |
| `public/js/popover.js` | Dropdowns and keyboard-driven list menus. |
| `public/js/prompt-cards.js` | Permission, AskUserQuestion and plan-approval cards. |
| `public/js/side-question.js` | `/btw` card above the composer: question, loader, Markdown answer, follow-ups with history, close/Esc; closes on session change. Nothing persisted. |
| `public/js/session-groups.js` | How the sidebar groups sessions: pinned first ("מוצמדים"), then by date or by project folder (collision titles "parent/name"); the mode is in localStorage `claude-gui.sidebar-grouping`. Pure, no DOM. |
| `public/js/sidebar.js` | Session list: "לפי תאריך / לפי פרויקט" switch, pinned sessions first, rows with a pin button (hover; always visible when pinned), grouping from `session-groups.js`, with a search over names, folders and the text of every conversation (snippet with the match marked + match count; empty state "אין סשנים או הודעות תואמים"). |
| `public/js/chrome.js` | Top bar (incl. the "N ברקע" chip that opens the tasks panel, and the "עוד" menu item pin/unpin) and welcome page. |
| `public/js/attachments.js` | Composer attachments: read files, shrink images, limits, conversion to what the server stores and back (queue restore). |
| `public/js/folder-browser.js` | "Open folder" dialog (welcome page, /add-dir) over GET/POST /api/folders; falls back to the default/home folder, accepts Explorer's quoted paths. |
| `public/js/ui.js` | Toasts, confirm/prompt dialogs, theme. |
| `public/js/risk.js` | Confirmations before significant actions (`guardedApi`, risky modes, account/cloud commands). |
| `public/js/dom.js` | `h()` element helper and small utilities. |
| `public/js/icons.js` | Inline SVG icons (incl. `bell`, `pin`); `spark` is Claude's mark with one path per ray (`--i`) for animations.css. |
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
