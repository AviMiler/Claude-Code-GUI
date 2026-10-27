# Changelog

## 2026-10-27 (transcript view modes)
- Added: D3 of 16 of the Desktop-parity batch (user request: copy the Claude Code Desktop "Transcript view"). Three modes per session, Hebrew "רגילה" (Normal, default), "חשיבה" (Thinking), "מפורטת" (Verbose). Normal: a run of 2+ consecutive top-level tool rows collapses into one closed group row ("N כלים", verbs with ×N, state icon spinner / x / check) that opens to the original rows; all thinking hidden. Thinking: same grouping plus thinking blocks (offered only once the session has top-level thinking; a subagent's own does not count). Verbose: no groups, every top-level tool row open (also rows arriving live), thinking shown. Frontend only
- Added: Ctrl+O cycles the modes and toasts "תצוגת תמליל: <label>" (physical key, so it works on a Hebrew layout; ignored with Shift/Alt; a held key cycles once; always stops the browser's open-file dialog; no session = nothing; cycles from the in-memory mode, so it works with blocked storage). The topbar "עוד" menu starts with the section "תצוגת תמליל (Ctrl+O)" (three modes with descriptions, check on the current; Thinking disabled until the session has thinking) and a "סשן" header before the older items
- Added: the mode is saved per session in this browser (localStorage `claude-gui.transcript-view`, `{sessionId: mode}`, 300 entries, newest last). Each thread (main and split pane) applies its own session's mode; Ctrl+O and the menu act on the main thread only. A search hit inside a closed group or row opens it before scrolling. `/focus` is unchanged and also hides the groups
- New files: public/js/transcript/view-mode.js, tool-groups.js, transcript-view.js, reveal.js; public/css/transcript.css; public/js/shortcuts.js, main-composer.js, message-copy.js. Touched: thread.js, chrome.js, search-hits.js, app.js, index.html
- Refactor (size rule, touched files over ~150 lines): the page-wide keydown listener moved verbatim from app.js to shortcuts.js (`bindShortcuts(run)`, plus Ctrl+O; `event.key` is now null-safe), the main composer's handler block from app.js to main-composer.js, the copy-button handler from thread.js to message-copy.js. app.js 170 -> 149 lines. D4 now starts from shortcuts.js
- Spec: new section "Transcript view modes"; reworded the Split view thread line and the "main pane only" line, added the reveal sentence to Full-text session search, and replaced the stale `app.js` mentions of Ctrl+\ and Ctrl+Shift+D (now `shortcuts.js`)
- Deviations from the plan: a lone tool row is not grouped (runs of 2+ only); the Thinking menu entry is disabled, not hidden; a subagent's thinking does not count and is hidden in Normal; three extra moved files; section headers in the "עוד" menu
- Verify: round 1 No-Go (the moved keydown threw on a key-less synthetic keydown; Ctrl+O stuck on Thinking when `localStorage.setItem` throws) plus minor notes (subagent thinking counted, nested thinking visible in Normal, unused exports, group verbs rendered LTR), all fixed; narrow re-check and the full scenario green, no console errors. Not checked: real CLI, light theme, a session with very many tool rows
- Known: `panels/panel-help.js` (the "קיצורי מקלדת" list) does not list Ctrl+O, Ctrl+\ or Ctrl+Shift+D; D4 handles it. The group's count (a run's top-level calls) can differ from the result line's per-turn tool count (includes subagents)

## 2026-10-27 (Changes pane with line comments)
- Added: D2 of 16 of the Desktop-parity batch (user request: copy the Claude Code Desktop Code tab's diff view). A "שינויים" pane in the pane area: the folder's uncommitted changes file by file (collapsible, old/new line numbers, status, +N −M), new untracked files shown as added files. Hover a line, click "+" beside its number, write a comment (Enter adds, Shift+Enter new line, Esc cancels without stopping a turn); Ctrl+Enter in the pane or the footer button sends ALL comments as one message through the normal send path (queued while Claude works); comments are cleared only after a successful send. Comments are anchored by file + side + line + line text; a line that changed since moves its comment to "הערות על שורות שהשתנו מאז", a file that left the diff lists its comments at the top; nothing is dropped silently. Comments live in memory per session (a reload loses them)
- Added: entry points: the rail's Changes card, the topbar diff icon (now the pane toggle, pressed state, "שינויים (Ctrl+Shift+D)"), Ctrl+Shift+D (physical D key, works on a Hebrew layout), the changed-files card's button (renamed "כל השינויים") and the split pane's card button (swaps the session into the main pane, then opens the pane). The settings-modal git panel stays as `/diff`
- Added: `GET /api/sessions/:id/diff` -> `{ isRepo, diff, truncated, newFilesSkipped }` (new lib/git/session-diff.js): everything uncommitted against HEAD (staged + unstaged in one diff per file) for the WHOLE repository from its top level, plus untracked files synthesized as added files in node (max 100 files, 512 KB each, 2 MB read per request, symlinks not followed, `.gitignore` honored, binary and empty files handled); no commits -> git's empty tree; 300000-character cap -> `truncated`; fixed `a/` `b/` prefixes. Session's own folder from the server, no `cwd` parameter, unknown session 404
- Changed: `SAFE_GIT` in lib/git/run.js gained `-c core.quotepath=false`, so Hebrew file names are no longer octal-escaped (also in the git panel and the rail's `git status`)
- Changed: pane-host.js gained `open(id)` (never closes an open pane) and an `onChange` callback (app.js redraws the topbar after any open/close, including a pane's X); split-view.js dependency `openPanel` renamed `openChanges`; the rail's Changes card, `onOpenGit` (app.js) and the topbar all go to the pane
- Refactor: the per-session "fetch once, again on status change, switch or by hand" cache of the rail moved to public/js/panes/session-fetch.js (`createSessionFetch`) and is used by both panes
- New files: public/js/panes/pane-changes.js, diff-parse.js, diff-view.js, diff-comments.js, changes-chrome.js, session-fetch.js; lib/git/session-diff.js; public/css/changes-pane.css. Touched: pane-host.js, panes.js, pane-details.js, split-view.js, turn-changes.js (button label and tooltip), chrome.js, app.js, api.js (`sessionDiff`), lib/api-routes-tools.js, lib/git/run.js
- Spec: new section "Changes pane with line comments"; replaced the three stale lines (per-turn card button and its tooltip line, split pane card button) and the rail's "to be retargeted" line
- Deviations from the plan: the pane does NOT reuse `gitChanges` / `/api/git` (that has no untracked files and shows staged and unstaged apart); it has its own route against HEAD. It covers the whole repository, not only the session folder. Untracked files DID ship (the plan risk was a possible descope). Footer text is "N הערות · ניקוי · שליחה ל-Claude" instead of "שליחת N הערות ל-Claude". Ctrl+Shift+D lives in app.js for now (D4 moves it)
- Verify: three rounds. Round 1 No-Go (lines starting with `--` / `++` dropped by the parser, trailing tab in paths, a draft lost at turn end, double send, weak anchors and smaller items); round 2 No-Go (a non-repository stuck on "טוען…", errors while typing during a send); round 3 Go. A last small fix after Go was not re-run in a browser: the in-flight send flag is per session (another session's button no longer stays disabled)
- Known: the rail's counts (numstat, untracked = files only) and the pane's toolbar counts (new files' lines included) can differ; the Ctrl+\ question is still pending for D4. Not checked: light theme, the real CLI with a comment message

## 2026-10-27 (workspace panes + session details rail)
- Added: D1 of 16 of the Desktop-parity batch (user request: copy the latest Claude Code Desktop Code tab, Hebrew labels, one folder per feature). A pane area beside the main session's chat with the session details rail: cards Environment (folder with copy, git branch, extra folders, model, permission mode), Changes (+N −M, files, new files, refresh; click opens the git diff panel), Tasks (running background tasks; click opens the tasks panel) and Context (percentage; categories on click via `get_context_usage` with `ifRunning`, never starts the CLI). Topbar button and "עוד" menu item toggle it; drag the edge to resize. Per browser: `claude-gui.panes-open` (default `["details"]`), `claude-gui.panes-width` (default 340, min 280). Shown only when the row has 560 px of chat plus the pane width (else hidden, saved choice kept, the toggle only toasts); hidden on the welcome page. Files: public/js/panes/panes.js, pane-host.js, pane-details.js (new), public/css/panes.css (new), index.html (`.workspace` > `.chat` + `#pane-area`), chrome.js, app.js, api.js, icons.js (`panel-right`), panels/panel-usage.js (`renderContextUsage` exported)
- Added: `GET /api/sessions/:id/git-summary` -> `{ isRepo, branch, files, untracked, added, removed }` (session's own folder, `cwd` ignored, unknown session 404; staged + unstaged numstat; untracked files counted as files). Refactor: git runner moved verbatim to lib/git/run.js, `gitChanges` to lib/git/changes.js (with the new `gitSummary`); lib/workspace-info.js is now folders + @-file search only; `/api/git` unchanged for callers
- Fixed: app.js `refresh()` froze the topbar while any element inside it (a button) had focus; the guard now protects only focused text fields
- Deviations from the plan: the Claude Code process state is not shown (no client signal, not in the Desktop reference); there is no explicit split-view check, the room rule alone hides the area while the split is open. Not changed on purpose: Ctrl+\ still toggles the split view; Desktop's "close focused pane" is a pending question for D4 (`closeFocused()` exists, unbound)
- Spec: Platform constraints gained the two cross-cutting rules (follow the Desktop Code tab, Hebrew labels; code separated by feature), Split view gained "panes belong to the main pane only", new section "Workspace panes and session details rail"
- Verify: first pass No-Go (stale toggle state from the editing guard; the first click without room silently cleared the saved state; no refetch on session switch), fixed, then Go. Known minor: keyboard focus is lost after Enter on a card header; a missing session folder shows "not a git repository". Not checked: light theme, real CLI

## 2026-10-27 (split view)
- Added: two sessions side by side (feature 12 of 12). A topbar button / Ctrl+\ opens a second pane with a session picker, swap ("פתיחה בחלון הראשי") and close, its own live thread, its own permission/question/plan cards and a mini composer (text, send, stop; Enter sends, queue while busy, stop returns queued texts). No attachments, slash menus, `@` or `/btw` in the pane. Why: user request (one session plans, another executes). Files: public/js/split-view.js (new), public/css/split.css (new), events.js (events go to every thread showing the session), notify.js (`onScreen`: a pane session counts as on screen), app.js, chrome.js, icons.js (`columns`), index.html
- Per browser (localStorage `claude-gui.split-open`, `claude-gui.split-session`); the same session is never in both panes; below 1000 px the toggle refuses and an open split closes. No server change
- Refactor: warm-up and catalog prefetch moved verbatim from app.js to public/js/warm-up.js (app.js 183 -> 162 lines, still over the budget)
- Verify found and fixed: the pane composer skipped the outward-command confirmation; choosing a session into the pane did not clear its sidebar unread dot. No deviation from the plan. Not checked: search bar with the split open, light/dark appearance of the pane

## 2026-10-27 (images in resumed conversations)
- Added: importing a past conversation ("שיחות קודמות") now shows the images the user sent, as thumbnails (click = full size), instead of "[תמונה]". Each base64 image is stored through `images.saveImages` (magic bytes, 5 MB) one by one and attached to the user item like a composer image; an image that fails validation or comes by URL/file reference keeps the "[תמונה]" / "[N תמונות]" marker. Why: user request (feature 11 of 12). Files: lib/transcripts.js
- Listing and titles still use the text marker. Limits: images inside tool results still show "[תמונה]"; re-importing stores the images again (new ids); images of items cut by the 3000-item cap are swept at startup. No deviation from the plan
- Fixed during verify: `titleOf` passed the map index to `userText` as the image count; now `lines.map(line => userText(line))`

## 2026-10-27 (per-turn stats)
- Added: the meta line of each finished turn now shows total time · output tokens per second · input → output tokens (input includes cache) · rounds (when more than 1) · tool calls · cost (when above 0), with a tooltip giving the full breakdown (model time vs tools/other time, cache read/write, speed). Why: user request (feature 10 of 12); with a local model speed matters more than cost. Files: lib/event-translator.js (`translateResult` also keeps `durationApiMs`, `usage.cacheRead`, `usage.cacheWrite`), public/js/turn-stats.js (new), render-items.js (`renderResult`, `appendItem(container, item, context)`), thread.js
- Speed uses API time; when it is unknown (older saved items, fake CLI) it uses total time and the tooltip says so. Tool calls are counted on the frontend, nothing new stored. Failed turns keep the old "נכשל" line. No deviation from the plan
- Known nit: the tooltip always lists rounds and tool calls even when the line hides them

## 2026-10-27 (model server health indicator)
- Added: a green / red / grey dot in the sidebar footer next to the Claude Code version label shows whether the model server is up, so a failed turn is quickly explained (is qwen down?). Up = 2xx answer to `GET {ANTHROPIC_BASE_URL}/v1/models`; down = timeout (4 s), connection error, or any non-2xx (401, 404, 500...); grey = Anthropic's own base URL or none (no request is made). Tooltip: URL, latency, error; click = check now + toast. Checked on load, every 60 s while the tab is visible, and right after a turn ends with an error. Why: user request (feature 9 of 12). Files: lib/model-health.js (new), lib/model-list.js (exports `envOf`, `isAnthropic`; header comment reworded), lib/api-routes-tools.js (`GET /api/model-health[?refresh=1]`), public/js/model-health.js (new), api.js, index.html, css/layout.css, app.js, events.js
- Server cache 15 s; the displayed URL has no user:password or query; the token is never returned. No new kind of network call (same GET as the model list); no deviation from the plan
- Found, NOT fixed (outside this task): when `ANTHROPIC_BASE_URL` contains `user:password@`, `/api/models` fails ("Request cannot be constructed from a URL that includes credentials") and its error text echoes the full URL with the credentials to the browser

## 2026-10-27 (file viewer)
- Added: an open button on the tool rows of Read, Edit, MultiEdit, Write and NotebookEdit, and on each row of the per-turn changed-files card, opens a read-only viewer with the file's current text, line numbers and the lines the tool read or wrote highlighted and scrolled into view; copy path, copy content; plain text, no highlighting library. Why: user request (feature 8 of 12). Files: lib/file-view.js (new), lib/api-routes-tools.js (`GET /api/file-view?sessionId=&path=`), public/js/file-viewer.js (new), api.js (`viewFile`), render-tools.js, turn-changes.js, app.js, css/panels.css, css/messages.css
- Security: allowed only inside the session's folder, `addDirs` and the uploads folder, resolved real paths (`..`, symlinks, sibling prefix folders and data/sessions.json -> 403); a `cwd` parameter is ignored; 2 MB cap with `truncated`; binary -> 415; content shown with textContent only
- Changed from the plan: Grep, Glob and Bash are not linked (their path is a folder or a command); the changed-files card rows did get the button (it was optional)
- Known nit: the 2 MB cut can split a multibyte character (one replacement character at the end of a truncated file)
- Not tested: light theme visually; a file changed by the user after the tool ran simply shows no marks

## 2026-10-27 (per-turn changed-files summary)
- Added: a card after each turn's result, "שונה קובץ אחד" / "שונו N קבצים", listing the files Claude's edit tools (Edit, MultiEdit, Write, NotebookEdit; top level and subagents; failed or denied calls skipped; edits to one file merged) wrote in that turn, with +added/−removed counts. Click a file for that turn's diffs only, "הכול" for all, "git diff" opens the git panel. Recomputed from the session's items, nothing stored. Why: user request (feature 7 of 12). Files: public/js/turn-changes.js (new), thread.js, events.js, app.js, css/messages.css
- Changed from the plan: Write shows the badge "נכתב", not "חדש", because the GUI cannot tell a new file from an overwrite. The card stays visible in focus view. A tooltip says Bash-made changes show only in the git panel
- Refactor: the working line (Claude's spark state, verb, elapsed time, done/error/stopped moment) moved verbatim from thread.js to the new public/js/working-line.js (thread.js 193 -> 150 lines)
- Fixed: the templates panel failed to open (view.composerText missing in app.js) — follow-up fix to feature 6
- Not tested: a turn that continues after a mid-turn result (counted from the last user message); the "tool" working-line state was checked by code review only (other states checked in a browser against the fake CLI)

## 2026-10-27 (prompt templates)
- Added: prompt templates library — saved prompts with `{{variables}}` (Hebrew or English names), picked from a searchable list in the "+" menu or managed in the new panel "תבניות פרומפטים" (create, edit, duplicate, delete, use, "save the current message as a template"). A template with variables opens a fill form; the text is inserted into the composer (replaces an empty one, appended to a draft) and never sent automatically. Why: user request (feature 6 of 12). Files: lib/templates.js (new), lib/api-routes-tools.js (GET/PUT/DELETE /api/templates), public/js/templates.js (new), public/js/panels/panel-templates.js (new), registry.js, chip-menus.js, api.js, actions.js, app.js, css/panels.css
- Changed: stored on the server in `data/templates.json` (survives a browser reset, shared by all tabs), not in localStorage; limits name 80, text 20000, 200 templates; the browser generates the id. The panels count is 18
- Not checked: light theme visually (dark theme and behavior verified in a browser against the fake CLI)

## 2026-10-27 (pinned sessions, grouping by project)
- Added: pin a session (row button, or topbar "עוד" menu) so it shows first under "מוצמדים"; a "לפי תאריך / לפי פרויקט" switch groups the sidebar by date or by folder (collision titles "parent/name", full path as tooltip); search works in both. Why: user request (feature 5 of 12). Files: public/js/session-groups.js (new), sidebar.js, actions.js, chrome.js, app.js, icons.js, css/layout.css, `updateSession` in lib/session-service.js (accepts boolean `pinned`; no CLI restart)
- Changed: date grouping logic moved from sidebar.js to session-groups.js; a fork does not inherit `pinned`; grouping choice is per browser (localStorage `claude-gui.sidebar-grouping`)
- Known nits: no optimistic update (UI changes on the server broadcast); two paths sharing their last two segments still get the same group title

## 2026-10-27 (full-text session search)
- Added: the sidebar search also matches message text (user messages, Claude's answers, shell commands), case-insensitive and ignoring niqqud; content matches show a snippet and "· N התאמות"; opening one shows a bar in the thread ("k מתוך N", ▲ ▼, Esc) and outlines the matching messages (public/js/session-search.js, search-hits.js, sidebar.js, thread.js `data-item-index`, events.js, app.js, css/layout.css). Why: user request (feature 4 of 12). Frontend only; newest 3000 items per session scanned, count capped at 99
- Changed: Enter in the sidebar search box opens the first result; search is debounced 150 ms
- Refactor: the composer chips' dropdowns (permission mode, model + effort, "+" menu) moved verbatim from app.js to the new public/js/chip-menus.js (app.js 209 -> 175 lines)
- Debt: public/js/app.js (175 lines) is still over the ~150-line budget, next to lib/session-service.js and lib/session-runtime.js
- Known nits: the hit outline wraps the whole item; the search re-runs on every refresh while a query is active

## 2026-10-27 (background tasks)
- Added: "משימות רקע" panel (`/tasks`, `/bashes`) with live status, progress, output tail and stop for the session's background tasks, plus a topbar chip "N ברקע" (lib/task-tracker.js, readTaskEvent in event-translator.js, session-runtime.js, session-service.js, catalog-service.js, public/js/panels/panel-tasks.js, chrome.js, events.js, actions.js, commands-data.js). Why: user request (feature 3 of 12)
- Changed: idle shutdown no longer retires a CLI process while it has running background tasks (a long job would otherwise be killed after `idleMinutes`); when a CLI process ends, its running tasks are shown as "killed"
- Changed: `/tasks` was terminal-only; it now opens the panel. The panels count is 17
- Changed: the fake CLI starts a background task on the word "task", answers `stop_task` / `get_task_output`, answers an error when a control handler throws, and its "ask" keyword now matches the whole word only (dev/fake-claude.js)
- Not tested: the real CLI (2.1.246 may lack the task events, `stop_task` or `get_task_output`; the real field name of the output response is unknown, the panel reads output/content/text/tail)
- Debt: lib/session-service.js (283 lines) and lib/session-runtime.js (243) exceed the ~150-line budget

## 2026-10-27 (/btw side questions)
- Added: `/btw <question>` asks Claude about the current conversation without interrupting the running turn and without adding to the thread; a "שאלת צד" card above the composer shows the Markdown answer, takes follow-ups (history kept only while the card is open) and closes with Esc (lib/side-questions.js, POST /api/sessions/:id/side-question, public/js/side-question.js, actions.js, command-runner.js, app.js, css/composer.css). Why: user request (feature 2 of 12); it costs tokens, so it is a separate route, not in the no-token /control whitelist
- Changed: `btw` was terminal-only in the command list; it now runs in the GUI (commands-data.js)
- Changed: the fake CLI answers `side_question`, handles control requests asynchronously, and replies "Unsupported control request subtype: X" to unknown ones like the real CLI (dev/fake-claude.js)
- Not tested: the real CLI (response shape read from the 2.1.311 binary; 2.1.246 support unknown)

## 2026-10-27 (notifications)
- Added: user-chosen notifications — desktop, sound (WebAudio) and tab-title count; events turn finished / waiting for approval / error; "only when away" or always; settings panel "התראות" with test button (public/js/notify.js, panels/panel-notifications.js, events.js triggers)
- Changed: the tab title "(N)" now counts sessions waiting for approval plus finished-unread (was waiting only) and can be turned off; page status moved out of app.js to public/js/page-status.js
- Added: spec.md (first spec, from what shipped) with the Notifications requirement

## 2026-10-27 (documentation)
- Documented: the folder browser fixes and the "restart the server after an update" rule (AGENT_CONTEXT.md entry points, gotchas, last changes; ARCHITECTURE.md patterns; PROJECT_MAP.md)

## 2026-10-27 (images and file attachments)
- Added: attach files of any type to a message — "העלאת קבצים ותמונות" in the + menu, paste (Ctrl+V: screenshots, copied images or files) or drag onto the composer; up to 10 images and 10 files, 60 MB per message (public/js/attachments.js, composer.js)
- Added: images (PNG, JPEG, GIF, WebP; BMP converted) go to the model as image content blocks; larger than 1568 px or 3.75 MB they are shrunk in the browser first. Stored in `data/images/`, shown as thumbnails in the message (click = full size) (lib/images.js)
- Added: other files are stored in `data/uploads/<id>/<name>` and listed by full path at the end of the message, so Claude reads them with its own tools (works with any model). Every session gets `--add-dir data/uploads`, so reading them needs no permission prompt. Shown as chips that download the stored copy (lib/uploads.js, lib/cli-args.js)
- Added: queued messages keep their attachments; Stop / edit put them back in the composer and they are sent again by reference
- Added: resumed CLI conversations mark where images were ("[תמונה]") (lib/transcripts.js)
- Security: image bytes must match the declared type (no SVG/HTML as an image); uploads are always served as downloads (`application/octet-stream`, nosniff); file names are sanitized and stay in their own folder; references are checked against stored ids
- Changed: request body limit 1 MB → 90 MB (attachments travel as base64) (lib/http-utils.js)
- Changed: the fake CLI echoes the images it received (dev/fake-claude.js)

## 2026-10-27 (folder browser fixes)
- Fixed: an API route missing on a server that was not restarted after an update answered a bare "נתיב לא קיים"; it now names the route and says to restart `node server.js` (lib/api-routes.js)
- Fixed: the folder browser stayed empty when its starting folder did not exist; it now opens the default (or home) folder, and its error stays visible in the list (public/js/folder-browser.js, lib/workspace-info.js)
- Fixed: a path pasted with Explorer's "Copy as path" quotes was not found

## 2026-10-27 (documentation)
- Documented: everything added on 2026-10-27 in AGENT_CONTEXT.md (state, what was and was not tested, gotchas, next steps), ARCHITECTURE.md (warm-up step, models, responsiveness, new endpoints in Security, session fields), PROJECT_MAP.md (file roles) and DEPENDENCIES.md (optional model server)

## 2026-10-27 (copy messages)
- Added: an icon-only copy button under every message of the user and every answer of Claude (shown on hover; a check mark confirms); Claude's answers copy as their original Markdown (public/js/render-items.js, thread.js)

## 2026-10-27 (speed, real model list, Claude's animations)
- Changed: the CLI starts while the message is typed (POST /api/warm): an existing session warms its own process; on the welcome page a "spare" process is started with the draft settings and handed to the new session (lib/session-runtime.js `prewarmNew`/`adoptSpare`). Measured with a 2.5 s simulated startup: first answer 2.8 s → 0.1 s
- Changed: the `/` menu and the model menu never wait for the CLI catalog: built-in commands show at once, Skills join when the catalog arrives; the catalog is prefetched after a view settles (public/js/state.js `peekCatalog`, app.js)
- Changed: a folder catalog reuses the warm spare instead of starting a probe process (lib/catalog-service.js)
- Changed: the model list is the models the system really has: with a custom ANTHROPIC_BASE_URL it comes from the model server (GET /v1/models, or Ollama's /api/tags) plus config.json; on Anthropic from the CLI. With one model the model chip is a plain label and the panel says there is nothing to switch (lib/model-list.js, GET /api/models)
- Added: Claude's spark has a state of its own: starting (CLI starting up), thinking, writing, tool (with the tool and its target), waiting for approval, then a burst when done, a shake on error, a fold when stopped; it floats on the welcome page and turns in the sidebar while any session works (public/css/animations.css, thread.js)
- Added: FAKE_CLAUDE_STARTUP_MS in dev/fake-claude.js to simulate the real CLI's startup time

## 2026-10-27 (queue, folder browser, inline skills, fixes)
- Added: message queue — Enter while Claude works queues the message on the server; queued messages are sent one by one after each turn, can be edited or removed above the composer, and Stop puts them back into the box instead of sending them (lib/session-service.js, public/js/composer.js, actions.js)
- Added: folder browser ("עיון…") on the welcome page and in /add-dir: drives, breadcrumbs, filter, hidden folders, new folder (GET/POST /api/folders, public/js/folder-browser.js)
- Added: "/" in the middle of a sentence opens a Skills-only menu; the picked skill stays part of the text (public/js/composer-menus.js)
- Changed: the stop button is separate from send, so a message can be queued while a turn runs
- Fixed: after the CLI crashed, the context ring started a new CLI process right away (and kept it for idleMinutes); background reads now pass `ifRunning` and never start one (lib/catalog-service.js, public/js/app.js)
- Fixed: a Markdown block whose first line started with "#" but was not a heading rendered a later line twice as a heading and dropped the first line (public/js/markdown.js)
- Fixed: switching to a session that waits for a permission showed "חושב…" instead of "ממתין לאישור שלך" (public/js/thread.js)
- Fixed: clearing the session title opened the rename dialog; it now keeps the old name (public/js/chrome.js)

## 2026-10-26 (security review)
- Documented: two accepted issues — cross-site GET can trigger actions, and the API has no authentication (ARCHITECTURE.md → Security)
- Fixed: `claude` subcommand whitelist now checks options too; removed the unused `auto-mode` and `--version`/`agents` entries (lib/cli-commands.js)
- Fixed: git panel ran with repository-controlled programs enabled (fsmonitor, external diff, textconv) (lib/workspace-info.js)
- Fixed: writing or deleting a Claude file without a folder silently used the home folder (lib/api-routes-tools.js)
- Fixed: `%` in arguments was expanded by cmd.exe when claudePath is a .cmd (lib/spawn-utils.js)
- Added: confirmations before significant actions, without blocking them (public/js/risk.js, actions.js)
- Fixed: confirm dialogs showed a stray "null" and lost line breaks (public/js/ui.js, panels.css)

## 2026-10-26 (target version 2.1.246)
- Verified: the whole GUI against Claude Code 2.1.246 (the closed machine's version) with real turns: permission allow and deny-with-feedback, AskUserQuestion, plan approval with mode switch, stop mid-stream, live model switch, fork, resume, clear
- Fixed: 2.1.246 lacks the list_permission_rules, get_hooks_listing, get_memory_dialog, get_skills_dialog and get_status control requests; rules and hooks are now read from the settings files, other sections show a neutral "not available in this version" note (public/js/panels/kit.js, panel-permissions.js, panel-config.js)
- Fixed: 2.1.246 sends no `builtin` flag on commands, so bundled skills were tagged "custom" (public/js/command-catalog.js)
- Fixed: an empty streamed thinking block stayed on screen as "חושב…" until the turn ended (public/js/thread.js)

## 2026-10-26 (real-CLI verification)
- Fixed: permission prompts never reached the GUI on Claude Code 2.1.x (tools were denied with "you haven't granted it yet"); lib/cli-args.js now always passes `--permission-prompt-tool stdio`. Verified with a real conversation on 2.1.310: Write request -> card -> allow -> file created.

## 2026-10-26 (full feature set + desktop design)
- Changed: one persistent `claude -p --input-format stream-json` process per session instead of one per message, so the GUI can use the control protocol (lib/cli-process.js, lib/session-runtime.js)
- Added: interactive permission prompts (allow / always allow / deny with feedback), AskUserQuestion answers, plan approval with mode switch
- Added: real interrupt (Esc), live model and permission-mode switch, Shift+Tab mode cycling, effort, output style, main agent, extra folders (/add-dir)
- Added: token streaming (`--include-partial-messages`), thinking blocks, tool rows with terminal output, diffs, todo checklist and nested subagent calls
- Added: `/` menu with every built-in command of Claude Code 2.1.308 (Hebrew descriptions) merged with the live catalog: skills, custom, plugin and MCP commands; `@` menu for files, folders and agents
- Added: settings modal with panels for model, permissions (rules editor), context/usage, git diff, resume past CLI conversations, skills, agents, MCP servers, plugins/marketplaces, hooks, CLAUDE.md memory, settings files, status/doctor, appearance, help
- Added: capability detection from `claude --help` so optional flags are only passed when supported
- Added: fork (/fork, /branch), clear (/clear), export (/export), copy (/copy), focus view (/focus), light/dark theme
- Added: dev/fake-claude.js and `CLAUDE_GUI_CONFIG` / `CLAUDE_GUI_DATA` for development without an API key
- Changed: complete redesign in the style of the Claude desktop app (ivory/clay palette, rounded composer, sidebar grouped by date)
- Removed: lib/claude-runner.js and the old public/*.js, public/styles.css (replaced by public/js, public/css)

## 2026-10-26
- Added: server, API, session store, CLI runner, event translator (backend)
- Added: Hebrew RTL web UI with parallel sessions, tool-call rows, permission mode, stop button
- Added: Host/Origin guard on all requests

- Fixed: non-JSON CLI output (plain-text errors on stdout) is now shown in the error item instead of being dropped
- Fixed: /favicon.ico returns 204
- Fixed: config.json with single backslashes in Windows paths is now accepted
- Added: `model` in config.json, passed as `--model`
- Added: clear error when claudePath points to an interactive wrapper script
- Added: startup log of claudePath, model and ANTHROPIC_BASE_URL
- Fixed: batch-file claudePath is no longer quoted unless it has spaces (cmd.exe %~dp0 resolved to the session folder)
