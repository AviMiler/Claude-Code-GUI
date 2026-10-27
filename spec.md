# Spec — Claude Code GUI
_Created 2026-10-27 from what shipped (there was no spec before). Background: ARCHITECTURE.md, AGENT_CONTEXT.md, PROJECT_MAP.md._

Requirements the user confirmed as permanent. Each new permanent feature gets a section here.

## Platform constraints
- Zero npm dependencies; plain JavaScript, ES modules, no build step.
- Runs on a closed (offline) Windows machine, single user, served on http://127.0.0.1:3737. No external files, fonts, sounds or CDNs.
- Hebrew, right-to-left UI; light and dark theme.

## Notifications (confirmed permanent, 2026-10-27)
The user chooses what to be told about. Frontend only, no server changes.
- Channels (each on/off): desktop notification (browser Notification API; click focuses the tab and opens that session), sound (generated with WebAudio, no audio files; volume setting; rising tone = done, double = waiting, falling = error), tab-title count.
- Events (each on/off): turn finished, waiting for the user's approval (permission, AskUserQuestion, plan card), error (crash, failed start, or a result with isError). A turn the user stopped notifies nothing.
- When: "away" (default: tab hidden or unfocused, or the session is not on screen) or "always". A session shown in the main pane or in the split-view pane counts as on screen (no notification, no unread mark).
- Tab title shows "(N)" = sessions waiting for approval plus sessions finished and unread; this replaced the earlier waiting-only count, and can be turned off.
- Settings are per browser (localStorage `claude-gui.notifications`) and edited in the settings modal, panel "התראות" (also a bell button in the sidebar footer). The panel has a test button and shows/requests the desktop permission.
- Defaults: desktop off, sound off, title on, volume 60, all three events on, when = away.
- Code: `public/js/notify.js`, `public/js/page-status.js`, `public/js/panels/panel-notifications.js`; triggers in `public/js/events.js`.

## /btw side questions (confirmed permanent, 2026-10-27)
The user can ask Claude a quick question about the current conversation without interrupting the running turn and without adding to the conversation (like Claude Code's `/btw`). It calls the model, so it costs tokens.
- `/btw <question>` works while a turn runs (it runs at once, it is not queued). `/btw` with no question inserts "/btw " in the composer. It needs an open session; on the welcome page a toast says to open one.
- A card "שאלת צד" above the composer shows the question, a loader, then the answer as Markdown, a follow-up input (the earlier questions and answers of the card are sent as history) and a close button (Esc closes it and does not stop the turn). Selecting another session closes it.
- Not added to the thread, not in the queue, not persisted (history lives only in the open card), no notifications.
- Server: `POST /api/sessions/:id/side-question` `{ question, history }` -> CLI control request `side_question` (starts the session's CLI if needed, 10 minute timeout because the local model can be slow). Limits: question not empty and up to 4000 characters, history up to 20 entries. Kept out of the generic no-token `/control` whitelist on purpose.
- A Claude Code version without `side_question` (2.1.246 is untested) shows a neutral "not available in this version" note (HTTP 501), not an error.
- Code: `lib/side-questions.js`, `public/js/side-question.js`; wiring in `lib/api-routes.js`, `public/js/actions.js`, `command-runner.js`, `commands-data.js`, `app.js`.

## Background tasks (confirmed permanent, 2026-10-27)
The user sees and controls what Claude runs in the background (shell commands, subagents, Monitor) in the session, like Claude Code's `/tasks`.
- Panel "משימות רקע" (settings modal, group session) lists the session's tasks: description, type, status badge (running, completed, failed, stopped, killed), duration, tokens, tool uses, last tool, summary. It updates live. Actions: stop (a running task) and show output (tail of a shell/Monitor task's output). `/tasks` and `/bashes` open it.
- A topbar chip "N ברקע" shows while tasks run and opens the panel. The existing thread notices for task start and finish stay.
- Tasks are kept in memory only, per session, and are never persisted: they live inside the CLI process. When that process ends (crash, kill, idle shutdown, server restart) its running tasks become "killed" with the summary "התהליך של Claude Code נסגר". At most 50 tasks per session (finished ones are dropped first).
- A CLI process is NOT retired by the idle timeout (`idleMinutes`) while it has running background tasks; the timer is re-armed when the last one ends.
- Stop and output use the CLI's `stop_task` / `get_task_output` control requests (no model turn, no tokens), in the generic `/control` whitelist (stop as a write, output as a read).
- A Claude Code version without these events or requests (2.1.246 is untested) shows a neutral "not available in this version" note, not an error.
- Server: SSE `{type:'tasks', sessionId, tasks}`; tasks are also in the session meta. Code: `lib/task-tracker.js`, `readTaskEvent` in `lib/event-translator.js`, hooks in `lib/session-runtime.js` and `lib/session-service.js`, `public/js/panels/panel-tasks.js`, chip in `public/js/chrome.js`, `events.js`.

## Full-text session search (confirmed permanent, 2026-10-27)
The sidebar search ("חיפוש סשנים") finds sessions by the text of their conversations, not only by name and folder. Frontend only, no server changes: the browser already holds every session's items.
- Matches the session name and folder (as before) and the text of messages: user messages, Claude's answers (including nested subagent text) and shell commands (`input.command` of tool items). Not searched: thinking, tool results, notices, command output. `/btw` answers are never in the items, so they are not searchable.
- Case-insensitive and ignores Hebrew points (niqqud). Runs on input with a 150 ms debounce. Only the newest 3000 items of each session are scanned; the match count per session is capped at 99 (shown "99+").
- A session that matches by content shows under its row a 2-line snippet around the first match with the match marked, and "· N התאמות". Nothing found: "אין סשנים או הודעות תואמים". Enter in the search box opens the first result.
- Opening a result opens the session with a sticky bar at the top of the thread: "k מתוך N", previous/next (▲ ▼), close. The matching messages are outlined and the current one is scrolled to. Enter / Shift+Enter / Esc work while the focus is in the bar. Selecting another session clears the bar.
- Code: `public/js/session-search.js` (pure search), `public/js/search-hits.js` (bar and highlights), `sidebar.js` (results), `thread.js` (`data-item-index` on every item node), `events.js`, `app.js`, `css/layout.css`.

## Sidebar: pinned sessions and grouping by project (confirmed permanent, 2026-10-27)
The user keeps important sessions on top and can view the session list by date or by project folder.
- Pin: a boolean `pinned` on the session, saved in `data/sessions.json` and changed through `PATCH /api/sessions/:id` (non-boolean values are ignored). It is not a CLI setting: pinning never restarts or touches the CLI process, and does not change the session's recency. A fork does NOT inherit `pinned`.
- Pin/unpin from a pin button on the session row (shown on hover, always visible when pinned) and from the topbar "עוד" menu ("הצמדה למעלה בסרגל" / "ביטול הצמדה").
- Pinned sessions show first, in a group "מוצמדים", and ONLY there (not again in their date or folder group). In the pinned group the folder line under the name is shown.
- A switch at the top of the sidebar chooses the grouping: "לפי תאריך" (default: היום / אתמול / 7 ימים ...) or "לפי פרויקט" (one group per folder, titled by the folder name with the full path as a tooltip; if two folders share a name the title is "parent/name"; groups ordered by most recent activity, sessions inside by recency; the folder line under each name is hidden). The choice is per browser (localStorage `claude-gui.sidebar-grouping`: `date` | `project`). Search works the same in both groupings.
- Frontend plus one accepted field on the existing PATCH route. The UI changes on the server broadcast (no optimistic update).
- Code: `public/js/session-groups.js` (grouping), `sidebar.js`, `actions.js` (`setPinned`), `chrome.js` (menu item), `app.js` (`onPin`/`onRegroup`), `icons.js` (`pin`), `css/layout.css`, `updateSession` in `lib/session-service.js`.

## Prompt templates (confirmed permanent, 2026-10-27)
The user saves prompts they reuse, with variables, picks them from the composer's "+" menu and manages them in a panel. No model call, no tokens.
- Storage: on the server in `data/templates.json` (next to `sessions.json`, honors `CLAUDE_GUI_DATA`), so templates survive a browser reset and every tab sees the same list. Not per browser, unlike the notification and grouping preferences. Written atomically (temp file + rename).
- Template: id, name (not empty, up to 80 characters), text (up to 20000 characters). At most 200 templates (the 201st is refused, HTTP 409). The list is newest first.
- Server: `GET /api/templates`, `PUT /api/templates/:id` (create or update; the BROWSER generates the id with `crypto.randomUUID`; the server accepts ids matching `/^[\w-]{1,64}$/`), `DELETE /api/templates/:id` (404 when missing). PUT and DELETE pass the existing Origin check.
- Variables: `{{name}}` placeholders; a name is letters of any script (Hebrew or English), digits, space, `_` and `-`, up to 40 characters. Variables are unique and ordered by first appearance; a repeated variable is asked once and filled everywhere.
- Using a template with variables opens a small form (one field per variable). Enter = next field / confirm, Shift+Enter = newline, Esc or cancel = nothing is inserted. A template without variables is inserted directly.
- The filled text is INSERTED into the composer and never sent automatically, so the user can still edit it. Rule everywhere (menu and panel): an empty composer is replaced, a composer with a draft gets the text appended.
- UI: "+" menu item "תבניות פרומפטים" opens a searchable list (Enter picks the first visible) with "ניהול תבניות…"; the settings panel "תבניות פרומפטים" (id `templates`, group session) creates, edits, duplicates, deletes and uses templates, and shows "שמירת ההודעה הנוכחית כתבנית" (prefilled from the composer) when the composer has text.
- Code: `lib/templates.js`, routes in `lib/api-routes-tools.js`, `public/js/templates.js` (variables, fill form, pick menu), `public/js/panels/panel-templates.js`, `public/js/panels/registry.js`, `chip-menus.js` ("+" menu), `api.js`, `actions.js` (`composerText`), `app.js`, `css/panels.css`.

## Per-turn changed-files summary (confirmed permanent, 2026-10-27)
After each turn the user sees which files Claude changed in THAT turn, and can open that turn's diffs only (not the whole git diff). Frontend only: recomputed from the session's items, nothing extra is stored and no server change.
- A card "Files changed in this turn" appears after the turn's `result` item, in history (re-rendered sessions) and for live turns. A turn is everything from the last user item to the result. Turns without file edits show nothing. The card stays visible in focus view (it is the turn's outcome).
- Counted: the edit tools Claude called — Edit, MultiEdit (its edits merged), Write, NotebookEdit — at top level and inside subagents. Calls whose tool result is an error (denied or failed) are skipped. Several edits to the same file are merged into one row.
- Header "שונה קובץ אחד" / "שונו N קבצים". One row per file: name (LTR, full path as tooltip) and +added / −removed line counts. Write counts all its lines as added and gets the badge "נכתב" (not "חדש": the GUI cannot tell a new file from an overwrite). NotebookEdit counts the lines of `new_source` as added and shows the raw cell text.
- Clicking a row expands that file's diffs from this turn only (reusing `diffLines` / `renderDiff` of `render-tools.js`). A "הכול" toggle expands all. A separate "git diff" button opens the existing git diff panel.
- Limit, said in a tooltip: only what Claude's edit tools wrote is shown. Files changed by Bash commands appear only in the git panel.
- Known edge (untested): if a turn continues after a mid-turn `result`, it is counted from the last user item.
- The card nodes carry no `data-item-index`, so search hits and item indexes are unaffected.
- Code: `public/js/turn-changes.js`; rendered by `thread.js` after result items (history in `show`, live in `append(item, index, items)`); `events.js` passes `session.items`; `app.js` passes `onOpenGit`; `css/messages.css`.

## Model server health indicator (confirmed permanent, 2026-10-27)
A small dot in the sidebar footer, next to the Claude Code version label, tells at once whether the model server behind `ANTHROPIC_BASE_URL` (for example a local qwen on Ollama or LiteLLM) is up, so a failed turn can be told apart from a server that is down. No model call, no tokens.
- States: green = up, red = down, grey = unknown. Unknown = the base URL is Anthropic's own (or empty): no request is made at all, the cloud is never pinged.
- The check is the same read-only `GET {ANTHROPIC_BASE_URL}/v1/models` that the model list uses (4 s timeout, same auth headers), and only for a custom base URL. There is no `/api/tags` fallback for health.
- Up = a 2xx answer. Down = no answer within 4 seconds ("אין תשובה תוך 4 שניות"), a connection error (its code, for example ECONNREFUSED), or ANY non-2xx answer ("השרת ענה HTTP 401"): a server that answers 401 or 404 cannot be used by Claude Code either.
- Server: `GET /api/model-health[?refresh=1]` -> `{ state, latencyMs, error, url, checkedAt }`. Cached 15 s, so many tabs do not multiply requests; `refresh=1` bypasses the cache. The displayed `url` has no user:password and no query. The token and key are sent only as request headers and are never returned.
- Tooltip on the dot: the URL, the latency and the error. Click = check now (refresh) plus a toast.
- When it checks: on page load, every 60 s while the tab is visible (paused while hidden, resumes when visible), right after a turn ends with an error (silent, no extra notification), and on a click. One request at a time.
- Code: `lib/model-health.js` (`checkModelServer(config, {refresh})`), `envOf` / `isAnthropic` exported from `lib/model-list.js`, route in `lib/api-routes-tools.js`, `modelHealth(refresh)` in `public/js/api.js`, `public/js/model-health.js`, the `#model-health` button in `public/index.html`, `css/layout.css`, `createModelHealth` and `eventView.onTurnFailed` in `app.js`, `view.onTurnFailed()` called from `events.js`.

## File viewer (confirmed permanent, 2026-10-27)
Clicking a file path in a tool row opens the file's CURRENT text in a read-only viewer with line numbers and the relevant lines highlighted. No model call, no tokens.
- Where: an open button on the tool row of Read, Edit, MultiEdit, Write and NotebookEdit (it does not toggle the row), and on each row of the per-turn changed-files card. Grep, Glob and Bash are NOT linked (their path is usually a folder or a command).
- Dialog: path, "N שורות · M מסומנות", copy path, copy content, close (Esc or backdrop). Monospace, left-to-right, line numbers, marked lines scrolled into view. Plain text only: no syntax highlighting (no library), and the content is set with `textContent`, never HTML (a `<script>` in a file is shown as text).
- Marks: Read marks `offset` to `offset+limit-1` when given (else nothing); Edit marks where `new_string` now appears, MultiEdit each `new_string`, found by searching the current content; Write marks the whole file; NotebookEdit opens the raw JSON with no marks; the changed-files card marks each diff's added block. Text not found (the file changed since) shows the file with no marks and no error. The viewer shows the file as it is now, not as it was when the tool ran.
- Server: `GET /api/file-view?sessionId=&path=` -> `{ path, content, totalLines, truncated, size }`. Read-only, no body. Any `cwd` query parameter is ignored.
- Allowed only inside the session's folder, its extra folders (`addDirs`) and the uploads folder (the places Claude works in without asking). The roots come from the session on the server, never from the request. Real paths are compared with a separator boundary (`/proj` does not match `/proj-evil`), case-insensitive on win32 and darwin, after `realpath`, and the file is read from the resolved path, so `..` and symlinks cannot escape. Relative paths resolve against the session cwd; surrounding quotes are stripped.
- Errors: missing 404; directory 400; outside the folders 403 "הקובץ מחוץ לתיקיות של הסשן"; binary (NUL in the first 8 KB) 415. Reads up to 2 MB; larger returns the first 2 MB with `truncated: true` and the dialog says so. `totalLines` does not count the final newline. The dialog renders at most 20000 lines and says when it cut.
- Known nit: the 2 MB cut can split a multibyte character (one replacement character at the very end of a truncated file).
- Security: the first GET that returns file contents. Cross-site pages cannot read the response (no CORS; Host and Origin checks), and a local program with API access can already run commands through a session. See ARCHITECTURE.md -> Security.
- Code: `lib/file-view.js`, route in `lib/api-routes-tools.js`, `public/js/api.js` (`viewFile`), `public/js/file-viewer.js` (dialog and one delegated listener `enableFileLinks`, wired in `app.js`), buttons in `render-tools.js` and `turn-changes.js`, `css/panels.css` (viewer), `css/messages.css` (buttons).

## Per-turn stats (confirmed permanent, 2026-10-27)
Each finished turn shows its performance on the `result` meta line. With a local model the cost is irrelevant but the speed matters. Per turn only: no session totals (the usage panel keeps session cost and context). No model call.
- Line, in this order: total time · output tokens per second · "input → output טוקנים" (input includes cache read and cache write) · rounds (only when more than 1) · tool calls ("כלי אחד" / "N כלים", hidden at 0) · cost (only when above 0).
- Speed = output tokens divided by API seconds (time spent waiting for the model). When API time is unknown it uses total seconds; the tooltip then adds "(לפי הזמן הכולל)".
- Native `title` tooltip with the breakdown: total time, model time and tools/other time (only when API time is known), input, cache read, cache write, output, speed, rounds, tool calls, cost. The tooltip always lists rounds and tool calls even when the line hides them.
- Old saved items degrade gracefully: no API time means speed from total time; no cache fields count as 0; `usage` null shows time only. A failed turn keeps the unchanged "נכשל" line.
- Tool calls are counted on the frontend (nothing stored): `tool` items, top level and inside subagents, from the last user item back from the result (same turn boundary as the changed-files card; same untested mid-turn-result edge).
- Server stores three more fields on the `result` item: `durationApiMs` (from `duration_api_ms`), `usage.cacheRead` and `usage.cacheWrite` (from `cache_read_input_tokens` and `cache_creation_input_tokens`).
- The result node keeps its `data-item-index`, so search is unaffected.
- Code: `public/js/turn-stats.js` (`turnStats`, `countToolCalls(items, resultIndex)`), `renderResult` and `appendItem(container, item, context)` in `public/js/render-items.js`, `resultContext` in `public/js/thread.js`, `translateResult` in `lib/event-translator.js`.

## Images in resumed conversations (confirmed permanent, 2026-10-27)
Importing a past CLI conversation ("שיחות קודמות", `lib/transcripts.js`) shows the images the user sent in it, instead of the "[תמונה]" marker. Server only; the existing thumbnails and full-size view are reused. No model call.
- On import, each base64 image block (PNG, JPEG, GIF, WebP) of a typed user line is stored through `saveImages` in `lib/images.js` (same rules: magic bytes must match the type, up to 5 MB) and attached to the user item as `images: [{ id, mediaType, name }]`, exactly like a message typed in the GUI. An image-only line has empty text plus `images`.
- Images are stored one by one (one `saveImages` call each), so the 10-per-call cap does not apply: one imported message can hold more than 10 images. Imported items are never re-sent, so this is harmless.
- An image that fails validation, or that is given by URL or file reference instead of base64, keeps a marker in the text ("[תמונה]" / "[N תמונות]", counting only the failed ones) and the reason is logged ("[transcripts] image not imported: ...").
- Lines whose text starts with "<" (command output and the like) are unchanged: no marker, nothing stored.
- Listing and titles keep the text marker and decode no images; images are stored only on import.
- Deleting the session removes its imported images (cleanup by references); unreferenced ones are swept at startup.
- Known limits: images inside tool results (for example Claude reading an image file) still show "[תמונה]" in the tool output; re-importing the same transcript stores the images again with new ids; images of items cut by the 3000-item import cap become unreferenced and are swept at startup.
- Code: `imageBlocks`, `userText(line, markedImages)`, `storeImages`, `userItem` in `lib/transcripts.js`.

## Split view (confirmed permanent, 2026-10-27)
The user can watch and drive two sessions side by side, for example one planning and one executing. Frontend only, no server changes: the server already streams every session's events to the browser. No extra model call.
- Toggle: a topbar button (icon `columns`) and Ctrl+\ open or close a second pane beside the main thread. Below 1000 px the toggle refuses with a toast, and an open split closes when the window gets that narrow.
- The pane has a header (session picker listing the other sessions, "פתיחה בחלון הראשי" swap, close), its own live thread (streaming text, thinking, tool rows, working line, changed-files card, stats, file viewer links), the session's own permission / question / plan cards, and a compact composer: text, send, stop. Enter sends, Shift+Enter is a newline; a message sent while that session works is queued on the server like in the main composer; stop returns the queued texts to the box. The "git diff" button of the pane's changed-files card swaps the session into the main pane and opens the diff panel.
- Pane composer limits, on purpose: no attachments, no slash menu or GUI commands, no `@` mentions, no model / mode chips, no `/btw`. A message that starts an outward slash command gets the same confirmation as in the main composer. To use those, swap the session into the main pane.
- The same session is never in both panes: choosing the main session in the picker swaps them; picking the pane's session in the sidebar changes only the main pane, and the pane then shows an empty state. A sidebar pick always changes the main pane only. Choosing a session into the pane clears its unread mark.
- Events of the pane's session (item, delta, status, runtime, permission, permission-resolved) update the pane as well as the main thread. Notifications treat a pane session as on screen (see Notifications); a third session still notifies.
- The `/btw` card and the search-hits bar belong to the main pane only.
- Per browser (localStorage): `claude-gui.split-open` and `claude-gui.split-session`; reload restores both.
- Code: `public/js/split-view.js` (`createSplitView`), `public/css/split.css`, `<aside id="split-pane">` in `public/index.html`, the split button in `chrome.js` (icon `columns` in `icons.js`), routing in `events.js` (`view.paneThread`), `notify.js` (`onScreen`), wiring and Ctrl+\ in `app.js`.
