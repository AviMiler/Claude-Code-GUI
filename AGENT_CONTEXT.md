# Agent Context
_Last updated: 2026-10-27 — after D2 (the Changes pane with line comments), the second of 16 features that copy the latest Claude Code Desktop Code tab; before it D1 (workspace panes + session details rail) and the split view, the last of the earlier 12 user-approved features (on top of images in resumed conversations, per-turn stats, the model server health dot, the file viewer, the per-turn changed-files summary, prompt templates, pinned sessions and grouping by project, full-text session search, the background tasks panel, /btw side questions, notifications, images and file attachments, the queue, folder browser, inline skills, warm-up, system models, animations, copy buttons)_

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
  18 settings panels (model, permissions, context/usage, git diff, resume, skills, agents, MCP, plugins, hooks, memory,
  settings files, status/doctor, appearance, help, notifications, background tasks, prompt templates), light/dark theme, persistence to `data/sessions.json`,
  prompt templates with `{{variables}}` ("+" menu, panel; stored in `data/templates.json`),
  user-chosen notifications (desktop, sound, tab title), `/btw` side questions (not in thread, not persisted),
  background tasks panel `/tasks` (live status, stop, output; topbar chip; in memory only),
  full-text search across all sessions in the sidebar (snippets, match bar in the thread),
  per-turn "files changed" card after each result (Edit/MultiEdit/Write/NotebookEdit; that turn's diffs on click),
  file viewer: open button on Read/Edit/MultiEdit/Write/NotebookEdit tool rows and card rows (line numbers, relevant lines highlighted; read-only, session folders only),
  model server health dot in the sidebar footer (green up / red down / grey unknown; polled every 60 s, rechecked after a failed turn),
  per-turn stats on the result line (time, output tokens/s, tokens in/out, rounds, tool calls, cost; tooltip breakdown),
  images the user sent are shown (thumbnails) when a past CLI conversation is imported ("שיחות קודמות"),
  split view: a second pane beside the main thread with another session (own live thread, approval cards, mini composer text/send/stop;
  topbar button or Ctrl+\; picker, swap, per browser; refuses below 1000 px; a pane session counts as on screen for notifications),
  workspace panes + session details rail (D1 of the Desktop-parity batch): a resizable pane area beside the chat of the main session
  (topbar button / "עוד" menu; per browser; hidden without room or on the welcome page) with the cards Environment, Changes (+N −M from git),
  Tasks and Context (percentage; categories on click, never starts the CLI),
  Changes pane (D2): the folder's uncommitted changes file by file against HEAD (new untracked files included), old/new line numbers, "+" beside a line number
  to comment (Enter adds, Esc cancels), Ctrl+Enter / footer sends all comments to Claude as ONE message; opened from the rail card, the topbar diff icon, Ctrl+Shift+D,
  and the changed-files cards' "כל השינויים" button; comments in memory only
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
  response is unknown (the panel reads output/content/text/tail defensively);
  the features of the 12-feature batch were all checked in a browser against the fake CLI only (search, pinning, templates, changed-files card, health dot,
  file viewer, stats, imported images, split view); the real CLI and the real model server have not been tried with them. Split view: the search-hits bar with the
  split open and light/dark screenshots of the pane were not checked;
  Changes pane: checked in a browser against the fake CLI (3 verify rounds), but not in the light theme, not with the real CLI or a real model answering a comment message,
  not with a real Windows repository (Hebrew file names, CRLF files), and the last fix (the in-flight send flag is per session) was not re-run in a browser
- ❌ Known limits: images inside tool results of resumed CLI conversations still show "[תמונה]" (images the user sent are shown); non-image files reach the model
  only as paths it must read; terminal-only commands (login, ide, remote-control, ...) are
  listed but only explained; partial streamed text of a stopped turn is not kept
- ⚠️ Known security issues, accepted on purpose (closed network, single user; details in ARCHITECTURE.md → Security):
  1. Cross-site GET: a website open in the same browser can trigger GET endpoints (no Origin is sent for simple GETs).
     Responses are unreadable, but `/api/catalog?cwd=` starts a `claude` probe in any folder (in `-p` mode the folder's
     own settings/hooks load without a trust prompt), `/api/git` runs git there, `/api/folders` lists folders,
     `/api/models` and `/api/model-health` make the server call the model server, and repeated calls can exhaust memory.
  2. No authentication: any program or user on the machine can use the API on 127.0.0.1 — including sessions in
     bypassPermissions mode (run any command), writing ~/.claude settings (hooks = persistence), starting CLI processes
     (`/api/warm`) and creating folders (`POST /api/folders`).
  3. A base URL with `user:password@` (not fixed, found 2026-10-27): `/api/models` fails ("Request cannot be constructed from a URL that
     includes credentials") and its error text echoes the full URL with the credentials to the browser. The health dot already strips them.
     Fix: build the request from a cleaned URL (as lib/model-health.js does) and strip credentials from the error text in lib/model-list.js.
  Fix when needed: random token generated at startup and required on every /api call (cookie or header), reject
  `Sec-Fetch-Site: cross-site`, and make the process-starting endpoints POST.

## Last Changes
- 2026-10-27 — D2 of 16 (Desktop-parity batch): Changes pane with line comments. New `public/js/panes/` files: `pane-changes.js` (the pane), `diff-parse.js` (pure parser), `diff-view.js` (one file's table, "+" button, comment box and bubbles),
  `diff-comments.js` (per-session comments in memory + `composeMessage`), `changes-chrome.js` (toolbar, notes, footer), `session-fetch.js` (fetch cache shared with the rail); `public/css/changes-pane.css`;
  server `lib/git/session-diff.js` + `GET /api/sessions/:id/diff` (api-routes-tools.js, `sessionDiff` in api.js) and `core.quotepath=false` in `lib/git/run.js`. The pane shows the WHOLE repository against HEAD (staged + unstaged in
  one diff per file) plus untracked files synthesized in node (100 files, 512 KB each, 2 MB, symlinks skipped). Entry points: rail card, topbar diff icon (now the pane toggle), Ctrl+Shift+D (`event.code`, in app.js), the
  per-turn card's button (renamed "כל השינויים") and the split pane's card button. pane-host.js gained `open(id)` and `onChange`; split-view.js `openPanel` became `openChanges`. The settings-modal git panel `/diff` is unchanged.
  spec.md: new section + the stale lines replaced (per-turn card button, split card button, rail card). Deviations from the Invocation-1 plan: own route and diff against HEAD instead of reusing `gitChanges`; whole repository,
  not only the session folder; untracked files shipped (no descope); footer text "N הערות · ניקוי · שליחה ל-Claude"; Ctrl+Shift+D in app.js for now. Stage 3: round 1 No-Go (`--`/`++` content lines dropped, trailing tab in paths,
  draft lost at turn end, double send, weak anchors), round 2 No-Go (non-repository stuck on "טוען…", errors while typing during a send), round 3 Go; one small fix after Go not re-run in a browser (send flag per session).
  Known: the rail's counts and the pane's toolbar counts can differ (untracked files); `app.js` is 170 lines (over budget); comments are lost on reload; the synthesized new-file diffs have mode 100644 and no "No newline" line.
- 2026-10-27 — D1 of 16 (Desktop-parity batch: copy the latest Claude Code Desktop Code tab, Hebrew labels, one folder per feature): workspace panes + session details rail.
  Layout: `.main` = topbar + `.workspace` (`.chat` = thread + composer, ids unchanged; `#pane-area` on the chat's inline-end, physical left in RTL). New `public/js/panes/` (`panes.js` is the only module
  app.js talks to; `pane-host.js` registry, stacked panes, resize, room rule, `closeFocused()` not bound; `pane-details.js` the rail), `public/css/panes.css`. Rail: Environment (no process state —
  dropped on purpose, no client signal and not in the reference), Changes (+N −M, files, new files; click opens the git diff panel until D2), Tasks, Context (percentage; categories on expand via
  `get_context_usage` + `ifRunning`). Server: git runner extracted to new `lib/git/run.js` (`git`, SAFE_GIT/SAFE_DIFF moved verbatim), `gitChanges` moved to new `lib/git/changes.js` plus new `gitSummary`;
  `lib/workspace-info.js` is now folders + @-file search only; new `GET /api/sessions/:id/git-summary` (session's own folder, `cwd` ignored). Also chrome.js (toggle + menu item), api.js (`gitSummary`),
  icons.js (`panel-right`), panel-usage.js (`renderContextUsage` exported and shared), index.html. spec.md got the two cross-cutting rules (Platform constraints), a Split view bullet and a new section.
  Behavior fix in app.js: the "don't rebuild the topbar while editing" guard now protects only focused text fields (a focused button used to freeze the topbar and left the toggle stale).
  Deviations from the Invocation-1 plan: process state dropped; the "hides while split is open" is only the room rule (no explicit split check; very wide windows keep the area). Stage 3: first pass No-Go
  (stale toggle state because of the editing guard; first click without room silently cleared the saved state; no refetch on session switch), all fixed, then Go. Verified in a browser (repo, non-repo,
  empty repo, binary, rename; counts = numstat staged + unstaged; route ignores `cwd`; request counts: select 1, turn 2, idle 0, refresh +1, switch +1; tasks; context with and without a CLI, no process started;
  persistence; resize; narrow and split hide + toast; /diff panel, folder browser and @-search after the git move). Not checked: light theme of the rail, the real CLI.
  Known minor: keyboard focus is lost after Enter on a card header (cards are rebuilt each refresh); a missing session folder shows "not a git repository".
  PENDING (c) FOR D4: Desktop uses Ctrl+\ to close the focused pane, spec "Split view" says Ctrl+\ toggles the split. Left unchanged in D1; ask the user once in D4 with the whole shortcut table
  (options: Ctrl+\ = close focused pane and split gets another key, or Ctrl+\ stays split and closing a pane gets another key). Do not change spec.md line "Toggle: ... Ctrl+\" before the user answers.
- 2026-10-27 — Split view (feature 12 of 12, the last of the batch): a second pane beside the main thread with another session, opened by a topbar button or Ctrl+\.
  New public/js/split-view.js (header with picker / swap / close, own `createThread`, approval cards, mini composer: Enter sends, queue while busy, stop returns the texts;
  outward slash commands confirmed; no attachments / slash menus / `@` / `/btw`), public/css/split.css; events.js routes the pane session's events to the pane too;
  notify.js `onScreen` (pane = on screen, no unread); app.js, chrome.js, icons.js (`columns`), index.html. Frontend only. Refactor: warm-up and catalog prefetch moved verbatim
  from app.js to new public/js/warm-up.js (app.js 183 -> 162, still over budget). No deviation. Verify found two issues, fixed: pane skipped the outward-command confirmation; choosing a
  session into the pane did not clear its sidebar unread dot. Not checked: search bar with the split open (code untouched), light/dark look of the pane.
- 2026-10-27 — Images in resumed conversations (feature 11 of 12): importing a past CLI transcript now stores the user's base64 images via `images.saveImages` (one call per image) and attaches them as `images` on the user item, so thumbnails and full-size view work; failed/URL/file-ref images keep a "[תמונה]"/"[N תמונות]" marker. lib/transcripts.js only (`imageBlocks`, `userText(line, markedImages)`, `storeImages`, `userItem`). Listing/titles unchanged (text marker).
  Limits kept: images in tool results still "[תמונה]"; re-import stores images again (new ids); images of items cut by the 3000-item cap are swept at startup. Stage 3 first pass found `titleOf` passing the map index as `markedImages` (fixed with `line => userText(line)`); re-verified Go in a browser. No deviation.
- 2026-10-27 — Per-turn stats (feature 10 of 12): the result meta line now shows total time · output tokens/s (output ÷ API time, total time when unknown) · input(incl. cache) → output · rounds (>1) ·
  tool calls · cost (>0), with a native tooltip breakdown. `translateResult` also keeps `durationApiMs`, `usage.cacheRead`, `usage.cacheWrite`. Tool calls counted on the frontend
  (`countToolCalls` in new public/js/turn-stats.js, passed by thread.js via `appendItem(..., { toolCalls })`); nothing else stored. render-items.js, thread.js, event-translator.js.
  No deviation. Verified in a browser (plain, tool, API time + cache, reload, old items, failed turn). Nit kept: tooltip always lists rounds and tool calls.
- 2026-10-27 — Model server health indicator (feature 9 of 12): green/red/grey dot in the sidebar footer by the version label. Up = 2xx from `GET {ANTHROPIC_BASE_URL}/v1/models`;
  down = timeout 4 s, connection error or any non-2xx; grey = Anthropic/no base URL (no request). `GET /api/model-health[?refresh=1]` (lib/model-health.js, new, cached 15 s,
  URL shown without credentials, token never returned); public/js/model-health.js (new): checks on load, every 60 s while visible, after a failed turn (silent), click = check + toast.
  Also model-list.js exports envOf/isAnthropic; api-routes-tools.js, api.js, index.html, layout.css, app.js, events.js. No deviation. Verified in a browser against a fake model server.
  Found, not fixed: a base URL with `user:password@` breaks `/api/models` and its error text echoes the URL with the credentials to the browser.
- 2026-10-27 — File viewer (feature 8 of 12): open button on file tool rows (Read, Edit, MultiEdit, Write, NotebookEdit) and changed-files card rows opens the file's current
  text with line numbers and the tool's lines highlighted. `GET /api/file-view?sessionId=&path=` (lib/file-view.js, new) only inside the session folder, addDirs and uploads
  (real paths; `cwd` param ignored); 2 MB cap, binary 415. New public/js/file-viewer.js; api.js, render-tools.js, turn-changes.js, app.js, panels.css, messages.css.
  Deviation: Grep/Glob/Bash not linked (folders). Stage 3 first pass found a stray "null" and an extra empty last line; fixed. Verified in a browser against the fake CLI and with
  curl security cases; light theme not checked; a 2 MB cut may leave one replacement character.
- 2026-10-27 — Per-turn changed-files summary (feature 7 of 12): card after each `result` listing files Claude's edit tools wrote that turn (+/− counts, "נכתב" for Write,
  failed calls skipped, edits merged), click = that turn's diffs only. Recomputed from session items, nothing stored. New public/js/turn-changes.js; thread.js, events.js,
  app.js, messages.css. Deviations from the plan: "נכתב" instead of "חדש" (new file vs overwrite is unknowable); card stays in focus view. Refactor: working line moved
  from thread.js to public/js/working-line.js (thread.js 150 lines). Also fixed feature 6: templates panel failed to open (view.composerText missing in app.js).
  Verified in a browser against the fake CLI; "tool" working-line state by code review only; a turn continuing after a mid-turn result is untested.
- 2026-10-27 — Prompt templates (feature 6 of 12): saved prompts with `{{variables}}` in `data/templates.json` (server, so they survive a browser reset),
  GET/PUT/DELETE /api/templates (browser-generated id, PUT upserts), "+" menu list and panel "תבניות פרומפטים". The filled text is inserted into the
  composer (empty composer replaced, draft appended), never sent. New lib/templates.js, public/js/templates.js, panels/panel-templates.js. Verified in a
  browser against the fake CLI (dark theme; light not checked visually). Stage 3's first pass found the panel replacing a draft; fixed to the append rule.
- 2026-10-27 — Pinned sessions and grouping by project (feature 5 of 12): `pinned` boolean via PATCH (no CLI restart, not inherited by forks),
  "מוצמדים" group first (only there), "לפי תאריך / לפי פרויקט" switch (localStorage `claude-gui.sidebar-grouping`), pin button on rows and in the
  topbar "עוד" menu. New public/js/session-groups.js; sidebar.js, actions.js, chrome.js, app.js, icons.js, layout.css. Verified in a browser against the fake CLI.
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
- Claude's state is a `data-state` on the working line (`working-line.js`); motion lives only in `public/css/animations.css`
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
- [ ] On the corporate machine: check the health dot against the real model server (does `/v1/models` answer 2xx? otherwise the dot is red although turns work)
- [ ] On the corporate machine: try imported images (does a real past transcript with images show thumbnails?) and the split view with two real sessions (both stream at once; permission card in the pane)
- [ ] Look at the new screens in the light theme and at a narrow window (split pane, changed-files card, stats line, file viewer, health dot); only the dark theme was inspected
- [ ] Check the search-hits bar with the split view open (main pane only is intended)
- [ ] Fix the credentials-in-ANTHROPIC_BASE_URL problem of `/api/models` (see Known security issues, item 3)
- [ ] D4 (keyboard shortcuts): ask the user the Ctrl+\ question (see Last Changes, PENDING (c)); wire `panes.closeFocused()` to whatever key they choose
- [ ] Look at the rail and pane area in the light theme and at the room limits (window just above and below 560 px chat + pane); only the dark theme was inspected. Also try the rail with a real CLI session (Context card, model label)
- [ ] D4 (keyboard shortcuts): move Ctrl+Shift+D (Changes pane toggle, `event.code === 'KeyD'`, one line in the app.js keydown listener) into the shortcut module. The letter bindings there (Ctrl+K, Ctrl+Shift+O, Ctrl+B) test `event.key`, which reports a Hebrew letter while the Hebrew layout is active, so they likely do not fire (not tested); use `event.code`
- [ ] Look at the Changes pane in the light theme and at the room limits; try it on the corporate machine with a real Windows repository (Hebrew file names, CRLF files, a session in a subfolder) and send one comment message to the real model
- [ ] File-size debt (~150-line budget): `lib/session-service.js` (283 lines), `lib/session-runtime.js` (243), `public/js/app.js` (170, was 167 before D2, 162 before D1, 183 before warm-up.js)

## Gotchas / Watch Out
- Split view: `events.js` updates every thread showing the event's session, so any new live view update must go through that list (main thread if active + `view.paneThread(id)`),
  not only `view.thread`. The same session must never be in both panes (`split-view.js` swaps). Unread marks are set only when the session is on screen nowhere; after
  changing the pane's session call `onChange` (page refresh) or the sidebar keeps a stale unread dot. `/btw` and the search bar are main-pane only on purpose. The pane has its own
  delegated file-viewer listener bound to the pane's session
- File viewer: `lib/file-view.js` is the only GET that returns file contents, so keep its checks: roots come from the session on the server (never from the request),
  real paths compared with a separator boundary (case-insensitive on win32/darwin), read from the resolved path, `cwd` ignored. Render content with textContent only.
  Edit marks are found by searching the CURRENT file for `new_string`, so a later change leaves no marks (not an error). One delegated listener (`enableFileLinks`, app.js)
  handles every button and stops the tool row's `<summary>` toggle
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
- Git views disable repository-configured programs (fsmonitor, external diff, textconv) — keep those flags in `lib/git/run.js` (`SAFE_GIT`, `SAFE_DIFF`), and run every git command through its `git()`; never call `execFile('git')` elsewhere
- Panes: the pane area belongs to the main session only (`getSession` = the active session); a new pane registers in `public/js/panes/panes.js` with `{ id, title, icon, render(body, session) }`, and `render` runs on every refresh, so
  keep its own state (open sections, cached fetches, in-flight requests) outside the DOM it rebuilds. The host re-attaches section nodes only when the open set changes (moving a node drops focus). The saved open set
  (`claude-gui.panes-open`) is kept when there is no room, and a toggle without room must not change it. `panes/` (side panes of the chat) is not `panels/` (the settings modal's pages). The rail's git summary is cached per
  session and refetched only when `session.status` changes, on switch or by hand: do not add a timer (both panes use `createSessionFetch` from `panes/session-fetch.js`). The `refresh()` guard in app.js protects only focused text fields; do not widen it to any focused element
- The Changes card counts the folder's uncommitted changes (git), not only what this session wrote: that is stated in its tooltip and the spec on purpose; untracked files are counted as files, not lines (the Changes pane's toolbar does count their lines, so the two can differ)
- Changes pane: `view.refresh()` runs on nearly every SSE `item` event and the host calls the pane's `render` each time, so `pane-changes.js` redraws only when the diff text changed and one file at a time otherwise; never rebuild the body on every render or a half-typed comment loses its text and focus.
  Esc in the comment box must `preventDefault` + `stopPropagation` (the page's Esc handler stops a running turn). Ctrl+Enter is bound on the pane element, not on `document` (the composer has its own). Comments are cleared only when `send` returns true.
  `diff-parse.js` relies on the fixed `a/` `b/` prefixes of `session-diff.js` and on `core.quotepath=false` (`run.js`); lines inside a hunk that start with `--`/`++` are content, not headers. The route reads the whole repository and untracked file text: keep the limits (100 files, 512 KB, 2 MB, `lstat`) and
  keep every git call going through `lib/git/run.js`. `/api/git` and the `/diff` panel are separate and unchanged (staged and unstaged apart, no untracked files)
- The GUI server's only network call is GET {ANTHROPIC_BASE_URL}/v1/models, used by the model list (lib/model-list.js, 4 s timeout, cached 5 min)
  and the health dot (lib/model-health.js, cached 15 s, polled every 60 s per visible tab), only for a custom base URL; never ping the cloud.
  Health = 2xx only (any other answer is red, no `/api/tags` fallback). Everything else outside the machine happens through Claude Code
  (model API calls, MCP/plugins) or through tools Claude runs (Bash can reach the model server's HTTP API — e.g.
  Ollama's unauthenticated /api/delete — when the user approves it or in bypass mode)
- Requiring `lib/session-store.js` registers an exit hook that writes `data/sessions.json`; set `CLAUDE_GUI_DATA` in experiments
