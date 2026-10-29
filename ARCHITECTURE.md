# Architecture
_Last updated: 2026-10-27 (D10: Terminal pane and `!` commands, `lib/terminal/`, SSE `shell`, item kind `shell`, session field `shellContext`; earlier D9: mid-turn corrections, `lib/session-runtime.js` split into four runtime modules; earlier D7: context menus for sessions and file paths, `public/js/context-menu/`, `root` in the `/diff` answer; earlier D6: archived sessions, `lib/session-archive.js`, archive removes a clean worktree and restore checks it out again; earlier D5: a git worktree per session, the first git writes, `lib/session-service.js` split into four modules; earlier D4: one shortcut table in `public/js/shortcuts/` feeds the handler, the Ctrl+/ dialog and the help panel; dropdown placement in `popover.js`; earlier D3: transcript view layer between thread.js and the DOM, a page-wide key listener; earlier D2: Changes pane with line comments, `GET /api/sessions/:id/diff`; earlier D1: workspace panes + session details rail, git moved to lib/git/; earlier: split view; file viewer, images in resumed conversations, per-turn stats, health dot; per-turn changed-files card, working-line.js, prompt templates, pinned sessions, grouping)_

## Overview
Browser UI <-> Node HTTP server <-> one long-lived `claude -p` process per session in stream-json mode.
The server speaks Claude Code's control protocol (the one the Agent SDK uses) over the process's stdin/stdout:
user turns, permission prompts, interrupt, model/mode switches, and read-only catalog queries. No database;
sessions are kept in memory and saved to `data/sessions.json`; prompt templates are saved to `data/templates.json`.

## Data Flow
0. While the user types, `POST /api/warm` starts the CLI ahead of time: the session's own process, or (on the welcome
   page) a spare process with the draft settings that `createSession` adopts when cwd, mode, model and effort match
   (never for a new session in its own worktree: its folder does not exist yet, so warm-up skips such a folder)
1. User sends text and attachments -> `POST /api/sessions/:id/messages` `{ text, images?, files? }` (base64 or `{ ref }`)
2. `session-messages` (behind `session-service`) stores the attachments (`lib/images.js` -> `data/images/`, `lib/uploads.js` -> `data/uploads/`),
   stores a user item with references, marks the session running, calls `session-runtime.sendMessage` with the CLI
   content: image blocks + the text, followed by the paths of attached files
3. `session-runtime` starts the process if needed (`cli-args` builds the flags from the detected capabilities,
   `--resume <id>` keeps the conversation) and writes `{"type":"user",...}` to stdin
4. Each stdout line: `control_response` settles a pending request; `control_request` `can_use_tool` becomes a
   permission prompt and `elicitation` (D13) becomes an elicitation card (the same pending map, `kind: 'elicitation'`); other subtypes get an error reply; everything else -> `event-translator` -> UI items / streaming deltas -> SSE (`/api/events`)
5. Browser `events.js` updates state and views; a permission answer goes back as `control_response`. With the split view open, the
   events of the pane's session (item, delta, status, runtime, permission, permission-resolved) go to the pane's thread too (`view.paneThread(id)`)
6. `result` ends the turn; the process stays warm and closes itself after `idleMinutes` — except while it has running
   background tasks (see Background tasks); the timer is re-armed when the last one ends
7. A message sent while a turn runs goes to `session.queue` (Alt+Enter, or any sender without `delivery`); the end of the turn sends the next one (step 2).
   Stop empties the queue first and hands the texts back to the browser. Archiving a session keeps its queue, paused (`dispatchNext` skips archived sessions)
8. Enter while a turn runs sends `delivery: 'correct'` (see Mid-turn corrections): the message is written to the live CLI at once instead of queued

## Attachments
- Images (PNG, JPEG, GIF, WebP): image content blocks in the user turn, so the model sees them (needs a vision model).
  The browser shrinks them to ≤1568 px / ≤3.75 MB first (`public/js/attachments.js`)
- Any other file: stored as `data/uploads/<uuid>/<name>`; the message ends with "[Attached files – read them with the
  Read tool]" and the full paths. Every session process gets `--add-dir <data/uploads>`, so Read needs no prompt
- Imported CLI transcripts (`lib/transcripts.js`): the user's base64 images are stored through `saveImages` (same validation), one call per image, and referenced on the user item; failed or URL images keep a "[תמונה]" marker
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
  per session in memory (never persisted, 50 per session); `session-events` broadcasts SSE `tasks` and `session-common` puts them in the session meta
- When the CLI process ends for any reason, its running tasks become `killed`. Idle shutdown is skipped while a task runs
- The panel (`panel-tasks.js`) and, since D12, the Background tasks pane (`tasks/tasks-pane.js`) stop a task and read its output with the no-token control requests `stop_task` / `get_task_output`
  (`/control` whitelist), through the shared `tasks/task-actions.js`; a CLI without them gives a neutral "not available" note

## Prompt templates
- `lib/templates.js` keeps the user's saved prompts in `data/templates.json` (next to `sessions.json`, `CLAUDE_GUI_DATA`; temp file + rename). Routes in
  `lib/api-routes-tools.js`: `GET /api/templates` (newest first), `PUT /api/templates/:id` (upsert; id from the browser, `/^[\w-]{1,64}$/`), `DELETE` (404 if missing).
  Limits: name 80, text 20000, 200 templates (409). Writes pass the Origin check; no model call
- The browser (`public/js/templates.js`) parses `{{name}}` variables, shows the fill form and inserts the result into the composer (never sends); the
  "+" menu (`chip-menus.js`) and the panel (`panel-templates.js`) both use it

## File viewer
- A click on the open button of a file tool row (Read, Edit, MultiEdit, Write, NotebookEdit) or a changed-files card row calls `GET /api/file-view?sessionId=&path=`
  (`lib/file-view.js`, route in `api-routes-tools.js`). The server returns the file's current text `{ path, content, totalLines, truncated, size }`; the browser
  (`file-viewer.js`; also reachable from the file context menu, see "Context menus") shows it with line numbers and marks the lines the tool read or wrote (Edit: found by searching `new_string` in the current text)
- Read-only and session-scoped: allowed roots = session cwd + `addDirs` + uploads folder, taken from the session on the server; real paths, separator boundary,
  read from the resolved path; `cwd` param ignored. 2 MB cap (`truncated`), binary (NUL in first 8 KB) 415. Content is rendered with textContent only. No model call

## Context menus
- `public/js/context-menu/`: `menu.js` `openContextMenu(event, entries)` opens `showDropdown` (popover.js, unchanged) with a 0x0 fixed anchor at the pointer, or at the focused element for a keyboard-originated `contextmenu` (Shift+F10, ContextMenu key: the browser fires the event, we have no key handler), clamps the menu vertically, adds arrow/Home/End/Enter/Esc/Tab handling and a danger class, and returns focus to the trigger on close (a MutationObserver sees the popover go). `hasSelection` makes both menus step aside so the browser's menu stays on selected text
- `session-menu.js` (`sessionMenuButton`, `enableSessionMenus(list, view)`; called on each sidebar render, one `contextmenu` listener per list, rows found by `data-session-id`) builds the session menu and calls `session-actions.js` by id (`rename(name, id)`, `fork(id)`, `remove(id)`, `archive(id)`, `unarchive(id)`, `setPinned`, `openInSplit(id)` -> `split-view.js` `open(id)`); `file-menu.js` (`enableFileMenus({ insert })`) is one document-level listener on `[data-file-path]` (buttons of tool rows and cards in `file-viewer.js`, file headers of `diff-view.js`; the session is the split pane's via `data-split-session`, else the main one); `paths.js` (`relativePath`, `joinPath`: Windows backslashes, case-insensitive drive paths). The only server touch is `root` in the `/diff` answer, so a Changes pane header's full path is right for a session started in a subfolder. Frontend otherwise; no model call

## Workspace panes and session details rail
- Layout: `.main` = topbar + `.workspace` (`#workspace`), a row of `.chat` (thread + composer, ids unchanged) and `#pane-area`. `.app` still has the sidebar column and the optional split column, so the order in RTL is
  sidebar, chat, pane area, then the split pane. `public/js/panes/panes.js` is the only module `app.js` talks to; `pane-host.js` owns the area (registry, open set, width, room rule, `closeFocused()`, which Ctrl+\ calls);
  each pane is `{ id, title, icon, render(body, session) }` registered in `panes.js` (the details rail, Changes, Terminal, Files, Plan and Background tasks). The host has `open(id)` (never closes) and `toggle(id)`, and calls `onChange` after any open or close so the topbar toggles stay in step. The area belongs to the main session only
- Room rule: shown only when `#workspace` is at least 560 px of chat plus the column wide (a `ResizeObserver` re-checks); otherwise hidden with the saved choice kept (`claude-gui.panes-open`, `claude-gui.panes-width`).
  The split view needs no special case: it narrows the main region, so the rule hides the area
- The rail (`pane-details.js`) reads only what the browser has (`session`, `state.context`, `session.tasks`) plus the git summary: `GET /api/sessions/:id/git-summary` (`lib/git/changes.js` `gitSummary`: `git status --branch`
  and `git diff --numstat` staged + unstaged through `lib/git/run.js`; the session's own folder, no `cwd` parameter). The summary is fetched on select/switch, on status change and by hand, never on a timer (`panes/session-fetch.js`, shared with the Changes pane).
  The Context card reads categories with `get_context_usage` and `ifRunning` (no CLI is started, no model call). The Changes card opens the Changes pane; the Tasks card opens the Background tasks pane (since D12; the settings-modal panel stays behind `/tasks` and the topbar chip)

## Changes pane
- `pane-changes.js` fetches `GET /api/sessions/:id/diff` (`lib/git/session-diff.js` `sessionDiff`) through `session-fetch.js` (first use, session switch, status change, refresh button; no timers), parses the text with the pure `diff-parse.js`,
  and draws one section per file with `diff-view.js`. The server runs `git rev-parse --show-toplevel`, then `git diff HEAD --` (or git's empty tree without commits) for the whole repository with fixed `a/` `b/` prefixes, so staged and unstaged
  changes are ONE diff per file, and adds every untracked file (`ls-files --others --exclude-standard -z`) as a synthesized "new file" diff built in node (max 100 files, 512 KB each, 2 MB total, `lstat` so symlinks are skipped, binary and empty handled).
  The whole text is cut at 300000 characters (`truncated`). All git calls go through `lib/git/run.js`, which also sets `core.quotepath=false` (Hebrew names)
- The pane redraws only when the diff text changed; an edit to one file (box, comment, collapse) redraws only that file, so the diff stays fast at the cap and a half-typed comment survives a turn end
- Comments (`diff-comments.js`) live in a module-level Map per session id, in memory only. A comment is anchored by path + side + line + the line's text; `diff-view.js` places it under the line only while all four still match, otherwise it is listed as changed since (or, when its file left the diff, at the top). `composeMessage` builds ONE message; the pane sends it with the
  `send` it is given (`actions.send`, the normal path: queued while Claude works) and clears the comments only when that returns true. One send at a time per session; Ctrl+Enter is bound on the pane element, not on the page
- Entry points all go through `panes.open('changes')` or `panes.toggle('changes')`: the rail card, the topbar diff icon, Ctrl+Shift+D (`shortcuts/bind-shortcuts.js`, `event.code`), the per-turn card's button (`onOpenGit`) and the split pane's card button (`openChanges`: swap, then open). The settings-modal git panel (`/api/git`, staged and unstaged apart, no untracked files) is unchanged

## Transcript view modes
- A layer between `thread.js` and the DOM (`public/js/transcript/`). `thread.js` renders every item as before and only calls `createTranscriptView(messages)`: `show(session)` after a full redraw, `appended(item, node)` after each live item (once the live elements
  and the working line are back at the end), `settled()` when a turn ends. The view applies the session's mode (`view-mode.js`: Normal, Thinking, Verbose; saved per session in localStorage `claude-gui.transcript-view`) by setting `messages.dataset.view`
  (`transcript.css` hides thinking in Normal) and by grouping in the DOM (`tool-groups.js`)
- Grouping WRAPS the existing top-level `details.tool` rows of a run of two or more in a `details.tool-group`; it never re-renders them, so the lookups by `data-tool-id` (tool results, subagent children), `data-item-index` (search) and the delegated listeners keep
  working. Verbose has no groups and opens every top-level row. Mode changes regroup the whole thread (`groupAll`); live items extend or create a group (`groupAppended`). Nothing is stored beyond the chosen mode, and no server change
- One view per `createThread`, so the main thread and the split pane each apply their OWN session's mode; the controls (Ctrl+O, the "עוד" menu section) act on the main thread only. `/focus` stays a separate filter (a body class), which also hides the groups.
  `search-hits.js` calls `reveal.js` to open a hit's closed group or row before scrolling to it

## Worktree per session
- A session can run in its own git worktree (Claude Code Desktop). `lib/git/worktree.js` `createWorktree` makes `<main checkout>/.claude/worktrees/<YYMMDD-xxxx>` on the new branch `worktree-<YYMMDD-xxxx>` with `git worktree add -b <branch> <path> HEAD`
  (HEAD of the chosen folder; no fetch, no network). `lib/git/worktree-paths.js` finds the main checkout (first entry of `worktree list --porcelain`, so never a linked worktree, never bare) and holds the shared helpers; `lib/git/worktree-remove.js` removes one. `probeWorktree` answers the welcome page's switch
- Flow: the switch (`public/js/worktree/worktree-toggle.js`, per browser) -> `POST /api/worktree/probe` -> on the first message `createFromDraft` (`session-actions.js`) sends `POST /api/sessions` with `worktree: true` -> `session-service` `startSession` creates the worktree, then the session with `cwd` = the worktree (or the same subfolder in it) and
  `session.worktree = { path, branch, root, source }`. Any failure throws before a session exists. `createSession` (import, fork) is synchronous and takes `worktree` only from the server itself (a fork copies the source's)
- Delete: `confirmWorktreeRemoval` (`worktree/worktree-delete.js`) asks the second question, `DELETE /api/sessions/:id?worktree=remove` -> `deleteSession(id, { removeWorktree })` deletes the session first, then removes the stored path (checks below). Archiving (D6) reuses the same `removeWorktree` without a question, and unarchiving puts the folder back with `restoreWorktree` (see Archived sessions)
- Where the session's project shows: `public/js/worktree/project-folder.js` (`source`, else `cwd`) is what grouping, search, the folder line, the topbar chip and the rail use, so a worktree session stays in its project's group. The worktree's own path and branch are shown in the branch chip and the rail's "worktree" row
- Session modules (split in D5 to stay under the size budget): `session-service.js` (create/start/update/delete/fork/warm), `session-common.js` (`toMeta`, `pushItem`, `setStatus`, `requireSession/Mode/Folder`, and since D6 `requireRunnable`), `session-messages.js` (send, queue, stop; keeps `lastConfig`), `session-events.js` (the `runtime.init` callbacks: items, status, tasks, exits), and since D6 `session-archive.js`

## Mid-turn corrections
- `session-runtime.js` (147 lines since D9, 144 since D13) keeps the process per session; its parts live in `runtime-events.js` (`createRuntimeEvents`: each CLI event, the turn's end, the exit), `runtime-permissions.js` (`can_use_tool` prompts and answers, and since D13 the `elicitation` prompts through a shared `waitFor`; `answerPermission` branches on `prompt.kind`; `cancelAll(runtime)` is what an interrupt calls), `runtime-spare.js` (`createSpare`, the warmed spare) and `runtime-corrections.js`. The factories receive what they need (hooks, the runtimes map, `scheduleIdle`) so there is no circular require.
- Send: `session-messages.sendMessage(..., { delivery: 'correct' })` on a running session asks `runtime.correct`, which succeeds only when `canCorrect` (turn active, the CLI started with `--replay-user-messages`, process live and not closing). It writes `{type:'user', message, uuid}` (no `priority`; the CLI's default is already "next") and tracks the uuid; the session gets a user item with `correction: true` and `correctionId`. If the runtime cannot take it, the message is queued or starts a turn as before.
- Consumption: a replay event (`isReplay`, same uuid) removes the uuid from the waiting set (`noteEvent`). `event-translator.js` still drops replays for the thread.
- Turn end: at a successful `result` with uuids still waiting `holdTurn` keeps `turnActive` true and starts a 20 s fallback (`HOLD_MS`); no `onTurnEnd`, so no notification, no `dispatchNext`. An assistant / stream event or replay clears the fallback; when the fallback already fired, the next such event calls `onTurnResume` and the session is running again. Stop: `dropWaiting` sends `cancel_async_message` per waiting uuid and `stopSession` names the lost corrections in a notice. Exit: `clear`.
- Frontend: `composer.js` sends `delivery` only while running (Enter `correct`, Alt+Enter `queue`); `render-items.js` labels correction items; the turn boundary used by the changed-files card, stats and notifications is `isTurnStart` (`turn-stats.js`), which skips them.
- Unverified with the real CLI 2.1.246 (uuid on stdin, replay uuid, `cancel_async_message`, sweep on interrupt); tested with `dev/fake-claude.js` + `dev/fake-corrections.js`.

## Archived sessions
- `lib/session-archive.js`: `archiveSession(id)` (`POST /api/sessions/:id/archive`) first stores and publishes `archived: true`, `archivedAt` and `pinned: false`, then, if the session runs, adds it to `stopRequested` and calls `runtime.interrupt` (the mark is removed again when there was no turn to interrupt, as `stopSession` does; the turn ends as "stopped"; because the session is already archived the turn's end cannot send the queue), then `runtime.close` (graceful: closes stdin), then `removeWorktree` on the stored worktree unless another session that is not archived uses the same path.
  It answers `{ worktreeRemoved, worktreeError? }`. `unarchiveSession(id)` (`POST /api/sessions/:id/unarchive`) calls `restoreWorktree` (`lib/git/worktree.js`: no-op while the folder exists; else the branch must exist, symlinks are refused, `worktree prune`, `git worktree add <path> <branch>`), turns the HTTP 400 of a failure into the answer (the session stays archived), then clears `archived` and `archivedAt`. `restoreForMessage(id)` runs in the messages route and the queue-resume route, before `sendMessage` / `resumeQueue`: a send is the only thing besides the explicit restore that un-archives
- A session whose folder is gone does not start a CLI: `requireRunnable` (`session-common.js`) answers 409 for `/btw` (`side-questions.js`), control requests (`catalog-service.js` `sessionControl`) and warm-up (`session-service.js` `warm`); `getSessionCatalog` reads the catalog of `worktree.source` for it; the git views in `api-routes-tools.js` answer `{ isRepo: false, folderMissing: true, archived }` instead of an error
- Frontend: `public/js/archive/archive-list.js` holds the archive view's state (in page memory), `sessionsForList` (archived sorted by `archivedAt`, or the others; an emptied archive switches back by itself), the foot button and (since D7) `restoreButton` for archived rows; the archive action itself is an item of the row's context menu (see "Context menus"). `sidebar.js` filters through it before searching, so the search covers the list shown; `session-actions.js` `archive(id)` asks only when background tasks run, navigates to the welcome page and clears the unread mark only after the server succeeded, and toasts the worktree outcome.
  Guards: `notify.js`, `events.js` (unread), `page-status.js` (tab count, brand), `split-view.js` (picker, pane), `warm-up.js`. `chrome.js` shows the chip "בארכיון · שחזור" and the menu items. Archived sessions stay in `state.sessions` on purpose (fork check of the worktree delete, the "שיחות קודמות" duplicate check, search)

## Terminal pane and `!` commands
- `lib/terminal/`: `terminal-routes.js` (`POST /api/sessions/:id/shell` `{ command, source: 'terminal'|'bang', shell? }` -> 202 `{ runId }`, `POST .../shell/stop`; guards: unknown session 404, archived 409, `requireRunnable` 409, bad input 400, a second run in the session 409), `shell-spec.js` (shell enum -> spawn spec: Windows `cmd` with `chcp 65001>nul &`, or `powershell -NoProfile -NonInteractive -EncodedCommand`; Linux `sh -c`; the request never names a program), `shell-run.js` (one spawn per command, stdin closed, `setEncoding('utf8')`, ANSI stripped, 64 KB per stream, kill of the process tree: `taskkill /T /F` or the process group), `shell-runs.js` (one run per session, broadcasts SSE `{type:'shell', sessionId, runId, phase:'start'|'out'|'end'}`, kills all runs on exit and SIGINT / SIGTERM / SIGHUP, and on session delete and archive), `shell-context.js` (`add`, `withPending`, `restore`, `pending`, `clear`)
- Fresh shell per command, not a persistent shell: no PTY without a dependency, and cmd / PowerShell over plain pipes have no usable prompt or end-of-command signal. So no state carries between commands and no interactive programs. See DECISIONS.md
- Terminal pane runs stay in the browser (`terminal/shell-store.js`, in memory per session) and are not told to Claude. A `!` run (source `bang`) ends as a persisted item `{ kind: 'shell', command, stdout, stderr, exitCode }` AND an entry in `session.shellContext` (max 10, persisted). `session-messages.js` puts a prefix built from `shellContext` (`Caveat:` line, `<bash-input>`, `<bash-stdout>`, `<bash-stderr>`; model output cut at 30000 characters) in front of the NEXT message that reaches the CLI: `startTurn` (new turn and dispatched queue) and the correction path; the context is cleared on use and restored if the message never reaches the CLI. The user bubble shows only the user's text
- Frontend (`public/js/terminal/`): `terminal-pane.js` (registered in `panes/panes.js`), `shell-block.js` (a run's block), `shell-item.js` (the persisted item, also `/export`), `shell-live.js` (the live card of a `!` run, appended to the messages element), `shell-command.js` (the composer's `!`), `shell-note.js` (the line above the composer), `shell-choice.js` (cmd / PowerShell, per browser), `shell-store.js`; `events.js` routes `shell` events. No server state is needed to reopen the pane, so a command started before the page opened has no block (a new one gets 409)
- No model call and no CLI start. The prefix format and all Windows behaviour are unverified (fake CLI and Linux only)

## Files pane and editor
- `lib/files/`: `safe-path.js` (`isInside`, `realOrNull`, root resolution; moved out of `file-view.js`, which imports it), `file-tree.js` (`GET /api/sessions/:id/tree?dir=`, one level, hidden-folder set, 2000 entries), `file-open.js` (`GET /api/sessions/:id/file?path=` -> content normalized to LF, `eol`, `bom`, sha256 `hash`, `size`, `mtimeMs`, `writable`, `readOnlyReason`), `file-save.js` (`PUT /api/sessions/:id/file` `{ path, content, baseHash, eol, bom, overwrite? }`), `text-format.js` (BOM, EOL, UTF-8 checks and the way back), `files-routes.js` (registered in `api-routes.js`). The filter box reuses `/api/files?sessionId=&q=` (the `@` index in `workspace-info.js`)
- Save is one synchronous block: re-read the file, compare its hash with `baseHash` (a mismatch is HTTP 412 unless `overwrite === true`), restore BOM and CRLF/LF, write in place. Hash, not mtime (unreliable on Windows and network drives). In place, not temp-plus-rename (Windows locks, file modes, hard links); a crash mid-write can truncate. Existing regular files only, 1 MB cap in bytes
- Roots for writes: session `cwd` and `addDirs` (never uploads). Refused for writes: `..`, NUL, non-regular files, a `:` in the name on win32, any `.git` segment, the server's own data folder (`DATA_DIR` from `session-store.js`) and `config.json` (`CONFIG_PATH` from `config.js`); these files open read-only. An archived session is read-only (writes 409), a missing folder is 409 (`requireRunnable`)
- Frontend (`public/js/files/`): `files-pane.js` (registered in `panes/panes.js`; two states, tree and editor; 134 lines, split at the next change), `tree-view.js`, `tree-filter.js`, `editor-view.js` (textarea, status bar, Save and Ctrl+S, conflict banner "דריסה" / "טעינה מחדש"), `editor-store.js` (per-session open file, draft, base hash, dirty flag, in browser memory), `open-in-files.js` (registry: `file-viewer.js` and `context-menu/file-menu.js` open the pane through it without importing the pane). A save calls `invalidateSessionFetches` (`panes/session-fetch.js`) so the Changes pane and the rail refetch; a clean open file reloads when the session status changes
- Claude is not told about the user's edits (the Changes pane shows them). No model call, no CLI start. Windows behaviour, case-insensitive file systems and the real CLI are unverified

## Plan and Background tasks panes
- Frontend only, no route. `plan/plan-source.js` `planState(session)` scans `session.items` backwards for the latest top-level `ExitPlanMode` plan and `TodoWrite` list and stops at a clear divider (`cleared: true`, set by `/clear` in `session-service.js`; older sessions: text starting "שיחה חדשה"); a pending `ExitPlanMode` in `session.pendingPermissions` overrides the plan and marks it "ממתינה לאישור". `plan/plan-pane.js` renders it (Markdown through `renderMarkdown`, which escapes raw HTML)
- `tasks/tasks-pane.js` draws `session.tasks` (from `task-tracker.js` through the session meta) and redraws on the normal pane refresh; output is read on demand and again when a task's signature changes, throttled to 2 s, on a render only (the CLI gives a tail, not a stream). The cache is keyed by session and task id. `tasks/task-format.js` and `tasks/task-actions.js` were moved unchanged out of `panels/panel-tasks.js`, which imports them
- Entry points: the "עוד" menu through the generic `onTogglePane(id)` / `paneOpen(id)` of `chrome.js` and the rail's Tasks card. No topbar icon, no shortcut. Security: no new surface; model-controlled plan text goes through the Markdown escaper, task text through `textContent`

## MCP elicitation cards
- An MCP server's request for input arrives as `control_request` subtype `elicitation`. `lib/runtime-permissions.js` passes it through `lib/elicitation/elicitation-normalize.js` (limits, flat field list, `json` fallback for unsupported types, URL kept only as text plus an `openable` http/https check) and stores the result in the same `runtime.pending` map as permission prompts, with `kind: 'elicitation'`. So the idle timer, `pendingFor` / session meta `pendingPermissions`, the `permission` / `permission-resolved` SSE events, `control_cancel_request`, exit cleanup, the "waiting" notification, the sidebar state and the split pane all work unchanged
- The answer reuses `POST /api/sessions/:id/permissions/:rid` with `{ action, content }`. `answerPermission` sees `prompt.kind === 'elicitation'`, calls `elicitation-validate.js` (content built only from schema keys, own properties, types, ranges, 64 KB cap) and `elicitation-reply.js` `replyFor`, and answers the CLI. Cross-kind bodies get 400. `cancelAll(runtime)` (called by `interrupt()`) replies `{ action: 'cancel' }` to elicitations and the old deny with `interrupt: true` to permissions. A turn ending does not resolve a pending elicitation (a server may ask between turns)
- Frontend `public/js/elicitation/` (`elicitation-card.js`, `elicitation-fields.js`, `elicitation-url.js`), dispatched from `prompt-cards.js` on `prompt.kind`; text only through `textContent`. Unverified against the real CLI: the subtype and field names (see spec.md); if they differ, the fix is in `lib/elicitation/` or one flag line in `cli-args.js`

## Models
- `GET /api/models` (`lib/model-list.js`): with a custom `ANTHROPIC_BASE_URL` the list is the model server's
  `GET /v1/models` (Ollama: `/api/tags` as fallback) plus the names in `config.json` (`model`, `ANTHROPIC_*_MODEL`);
  with Anthropic (or when nothing is known) the browser uses the CLI's own list from the catalog
- One model -> the composer's model chip is a plain label; several -> a menu. Picking one sets the session's model
  (`--model` on start, `set_model` live)
- Fallback model (D14): `session.fallbackModel`, per session, set from the `/model` panel through `PATCH` (no route, no draft
  default). Applied like effort: idle restart with `--resume`, `set_model` does not touch it. Passed as `--fallback-model <v>`
  only if `--help` lists it and the value differs from the main model; validated by a whitelist (see spec.md "Fallback model")

## Per-session CLI options (`lib/session-options.js`)
- One place for session settings that become CLI flags: `textChanges(patch, current, config)` trims and validates a PATCH
  (model, effort, agent, outputStyle, fallbackModel) and `optionArgs(session, config, supports)` returns flags whose values are
  separate argv items. `cli-args.js` calls it once. A new option is an entry there plus a store field and a restart key in
  `session-runtime.js` `applySettings`. Not yet moved in: the other flags that `cli-args.js` builds itself (`--effort`, `--agent`, ...)

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
| Pane area for the main session only, hidden by a room rule | Desktop panes belong to the focused session; `/btw` and the search bar are already main-only; a width rule is simpler and safer than a special case for the split view. See DECISIONS.md |
| Rail totals from a small `git-summary` route | `/api/git` returns up to 300000 characters of diff; the rail needs only counts and must not fetch that on every turn. See DECISIONS.md |
| Changes pane has its own route against HEAD, untracked files synthesized in node | `/api/git` has no untracked files and shows staged and unstaged apart; Claude mostly creates new files, so the pane must show them. See DECISIONS.md |
| Transcript view groups by wrapping the existing rows in the DOM | Rows keep their nodes, ids and listeners, so live tool results, subagent rows, search hits and the file-viewer buttons need no change; re-rendering from items per mode would duplicate that logic. See DECISIONS.md |
| A worktree per session, made by the GUI with git (not `claude --worktree`), from the local HEAD | `--worktree` needs workspace trust accepted in an interactive terminal; the machine is offline, so no fetch; the GUI knows the path. Hooks run, the branch is never reset or deleted, removal never forces. See DECISIONS.md |
| A worktree session belongs to the folder it was opened from (`worktree.source`) | Grouping by project, search and the folder line would otherwise split one project into a group per worktree. See DECISIONS.md |
| Archiving removes a clean worktree; restoring checks it out again at the same path (user decision, like Desktop) | Matches the Desktop Code tab; no `--force` and the branch stays, so dirty work is never lost; the same path keeps the CLI's per-folder conversation. See DECISIONS.md |
| An archived session opens normally, sending restores it; its queue is kept, paused | No read-only concept to enforce at many entry points; one server rule at the send path; nothing typed is lost. See DECISIONS.md |
| Context menus act on a row by id, are built on `showDropdown`, and the Changes pane's route returns `root` | No selecting a row for an action on another; `popover.js` stays shared and small; a subfolder session needs the repository root for correct paths. See DECISIONS.md |
| Enter while Claude works is a mid-turn correction written to the live CLI; the GUI queue is behind Alt+Enter; a turn with corrections waiting is held open (20 s fallback) | User decision, like Desktop and the terminal; the CLI already queues inbound messages as "next" and replays the ones it takes in, so the GUI only has to track uuids and not end the turn too early. Needs `--replay-user-messages`, else Enter queues. See DECISIONS.md |
| Shell commands: a fresh shell per command, output streamed over SSE; `!` output reaches Claude as a prefix of the next message | No node-pty (zero dependencies) and no usable prompt over pipes on Windows; per-command spawn gives exit codes, kill and attributable output; a prefix needs no model call by itself. See DECISIONS.md |
| Files pane: a plain textarea, save by content hash, in-place write, one file at a time | Zero dependencies rules out CodeMirror / Monaco; mtime is unreliable on Windows and network drives; temp-plus-rename breaks on Windows locks and drops file modes; the user's edits are not sent to Claude because the Changes pane already shows them. See DECISIONS.md |
| Plan pane reads the session's items; Tasks pane re-reads output on change, not on a timer | `get_plan` has an unknown shape and would start the CLI; the items and pending cards already hold the plan and todos, live. The CLI gives only an output tail, so a change-triggered, 2 s throttled re-read avoids timers and request floods. See DECISIONS.md |
| Elicitation reuses the permission pending map, SSE events and answer route, with `kind: 'elicitation'` | Idle timer, reload survival, notifications, sidebar, split pane and exit cleanup all come for free and `session-service.js` / `app.js` stay untouched; the server validates the answer so the browser is not trusted. See DECISIONS.md |
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
- `POST /api/sessions/:id/shell` (D10) is the first route that runs a command WITHOUT Claude and without a permission prompt. Rules: POST only, so the Host / Origin check applies (cross-site POST blocked); the folder is the session's own `cwd` from the server; the request carries only a command string (max 8000 characters), a `source` and a `shell` enum, never a folder, program or environment; `spawn` runs without a request-chosen executable; archived sessions and missing folders are refused (409); one run per session; output is capped (64 KB per stream); runs are killed on session delete, archive, stop and server exit. Output goes to every tab over SSE like all events (a cross-site page cannot read it). Commands see the server's environment including the model token, as Claude's own Bash does. The user types the command on purpose, so there is no confirmation (as in the terminal)
- `PUT /api/sessions/:id/file` (D11) is the second route that changes things WITHOUT Claude and without a permission prompt (it overwrites a file's text), and `GET /api/sessions/:id/tree` and `GET .../file` list and read. Rules: PUT, so the Host / Origin check applies; the session, its `cwd` and `addDirs` come from the server and the request carries only a path (never a folder); real paths with a separator boundary, case-insensitive on win32 and darwin, written at the resolved path; existing regular files only (no create, rename or delete); writes refuse `..`, NUL, a `:` in the name on win32 (alternate data streams), any `.git` segment (a hook is code execution), the server's own `data/` folder and `config.json`, and uploads; content up to 1 MB in bytes; archived sessions 409 on writes, missing folder 409; the conflict check (hash, HTTP 412) stops a blind overwrite. The two GETs return no CORS headers, so other sites cannot read them (the same position as `/api/file-view`). Known: a hard link planted inside the folder to a file under `.git` or the data folder would bypass the write refusal; the write is in place, so a crash mid-write can truncate. Windows aliases (8.3 names, trailing-dot `.git.`) are unverified
- `claude` subcommands: whitelist of commands *and* options (`lib/cli-commands.js`); `mcp add` passes through only after `--`
- git runs with repository-configured programs disabled (fsmonitor, external diff, textconv); every git command goes through `lib/git/run.js`. The views are read-only; the one exception is the worktree write (next bullets), where the repository's own hooks and filters DO run
- `GET /api/sessions/:id/git-summary` (the session details rail): read-only, the folder is the session's own (taken from the server; there is no `cwd` parameter, so it does not widen the accepted cross-site-GET issue that `/api/git?cwd=` already has), unknown session 404, same git flags
- `GET /api/sessions/:id/diff` (the Changes pane): read-only, the folder is the session's own (from the server; no `cwd` parameter), unknown session 404, same git flags. It returns TEXT OF FILES like `/api/file-view`, but with a wider reach: the whole repository from its top level (a session in a subfolder sees the files outside that folder),
  and the content of untracked files (`.gitignore` honored; paths come from `git ls-files`, so they cannot leave the repository; `lstat` skips symlinks; max 100 files, 512 KB each, 2 MB per request; binary not returned). It does not apply `/api/file-view`'s session-folder and `addDirs` roots, on purpose: the pane shows the repository's changes
- Worktrees (D5) are the GUI's first git WRITES: `git worktree add -b` (new directory, new branch, a checkout), an append to `<git-common-dir>/info/exclude`, and `git worktree remove` (deletes a directory tree). Rules that keep them contained:
  - Creating and removing are POST / DELETE routes, so the Origin check applies (`POST /api/sessions`, `DELETE /api/sessions/:id?worktree=remove`, and `POST /api/worktree/probe` for the welcome switch; the probe is a POST on purpose, since it needs a `cwd` and a GET would add to the accepted cross-site-GET issue below). The request carries a folder (checked to exist, then to be in a repository) and booleans only: the worktree name and branch are generated on the server (`YYMMDD-xxxx`, ASCII), never taken from a request, and `execFile` runs git without a shell
  - The branch is made with `-b`, never `-B`, and only after the name was checked free as a folder and as a branch: an existing branch cannot be reset. The user's actions never delete a branch (only the cleanup of a failed add deletes the branch that add had just created)
  - Removal takes the path stored on the session (never one from the request) and requires, by real path, that it lies under `<root>/.claude/worktrees` and that `git worktree list` knows it. It never uses `--force`, so uncommitted or untracked changes keep the folder. Files git ignores are deleted with the folder. A symlink at `.claude`, `.claude/worktrees` or the target stops the creation
  - Archiving (D6) is a second way to remove: `POST /api/sessions/:id/archive` calls the same `removeWorktree` on the stored path (same checks, no `--force`, skipped while a non-archived fork uses the path), and `POST /api/sessions/:id/unarchive` runs `git worktree add <path> <branch>` for the stored path and branch (never `-b`, so it cannot create or reset a branch; it needs the branch to exist; symlinks refused; hooks and filters run, as for a creation, with the 3-minute limit). Both are POST routes behind the Origin check and take no path or branch from the request. The branch is still never deleted
  - The repository's own post-checkout hook, `core.hooksPath` hooks and clean/smudge filters (LFS) run during `worktree add`, as with the CLI and a plain `git checkout`; only fsmonitor is off (`SAFE_GIT`). This is a decision, not an oversight: the user asked for the checkout, the config that defines those programs is the user's own, and the project already accepts that a session in a folder loads that folder's Claude hooks without a trust prompt (issue 1 in AGENT_CONTEXT.md). A hook that hangs is cut by the 3-minute limit (`git()` takes `timeoutMs` and closes stdin); a hook that fails makes the add fail and the leftover worktree and branch are removed
  - Nothing here talks to a remote: no fetch, no push, no pull-request features. The base is the chosen folder's local HEAD
- MCP elicitation (D13): schema, message, server name and URL come from an MCP server and are untrusted. The server clamps them (message 4000, name 100, 50 fields, 100 options, text 500, URL 2048) and builds a flat field list; the browser renders it with `textContent` only, never HTML or Markdown; the URL opens only on click, only for http / https, with `noopener,noreferrer`, and is shown in full. Never auto-accepted, no timeout. The answer goes only to the pending request id (unknown id 404, cross-kind body 400), is validated against the field list (own properties via `Object.hasOwn`, `Object.create(null)` so `__proto__` / `constructor` are plain names; only schema keys kept; 64 KB cap, 413) and a bad answer leaves the request pending. No new route and no new surface beyond the existing permission-answer route
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
| No authentication on 127.0.0.1 | Any local program/user can drive sessions (incl. bypassPermissions), start CLI processes (`/api/warm`), create folders, edit ~/.claude settings, create worktrees and branches in any local repository (`POST /api/sessions` with `worktree: true`) and remove a stored session worktree that has no uncommitted changes (`DELETE /api/sessions/:id?worktree=remove`, or by archiving the session) and check a removed one out again (`POST /api/sessions/:id/unarchive`), run any shell command in any session's folder without bypass mode and without a permission prompt (`POST /api/sessions/:id/shell`, D10; the same right they already had through a bypassPermissions session), overwrite the text of any existing file inside a session's folders except under `.git` and the GUI's own data and config (`PUT /api/sessions/:id/file`, D11; also reachable through a bypassPermissions session), list and read them (`GET /api/sessions/:id/tree`, `.../file`), read text files inside any session's folders (`/api/file-view`) and the uncommitted changes and new files of any session's whole repository (`/api/sessions/:id/diff`; a local program could read them directly anyway) | Same startup token |

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
- Item kinds: user, text, thinking, tool, tool-result, result, command-output, shell (D10: a finished `!` run), divider, notice (`stopped: true` when a
  stop ended the turn), error
- Result item: `{ kind: 'result', isError, subtype, text, durationMs, durationApiMs?, costUsd, turns, usage: { input, output, cacheRead?, cacheWrite? } | null }`; the `?` fields are missing in older saved items
- Session fields beyond settings: `queue` ([{ id, text, images?, files?, at }], persisted), `status`, `costUsd`, `claudeSessionId`, `pinned` (boolean, persisted; set via PATCH, not a CLI setting so no restart; not inherited by forks; ignored for an archived session), `archived` (boolean) and `archivedAt` (ms, null after a restore) (persisted; set only by `POST .../archive` / `.../unarchive`, never by PATCH; not inherited by forks; the queue is kept while archived), `worktree` (`{ path, branch, root, source }` or null, persisted; set only by the server when the session is made, inherited by forks, not settable through PATCH), `shellContext` (D10: `[{ command, stdout, stderr, exitCode }]`, max 10, persisted; set only by the server when a `!` run ends, cleared when a message carries it to the CLI and by `/clear`, not inherited by forks, not settable through PATCH)
- Sidebar grouping: `session-groups.js` (pure: sessions + mode -> groups: pinned first, then by date or by project folder) feeds `sidebar.js`;
  the mode is per browser in localStorage `claude-gui.sidebar-grouping`. Frontend only
- User items: `{ kind: 'user', text, images?: [{ id, mediaType, name }], files?: [{ id, name, size, path }] }`
- SSE event types: session, removed, item, status, delta, runtime, permission, permission-resolved, tasks, shell (D10: `phase` start / out / end of a shell run)
- `tasks` are in the session meta (`/api/state`, `session` events) but not in `data/sessions.json`
- Per-turn changed files: `turn-changes.js` derives a card from `session.items` (the edit tool items from the last user item to the `result`, top level and subagents, minus
  calls with an error tool-result); `thread.js` renders it after result items (history and live); nothing is stored and the card has no `data-item-index`. Frontend only.
  Bash-made changes are invisible to it (the Changes pane and the git panel cover those); its "כל השינויים" button opens the Changes pane
- Per-turn stats: `turn-stats.js` builds the result meta line and tooltip from the result item; `thread.js` passes `{ toolCalls }` (`countToolCalls`, counted back to the last
  user item) to `appendItem` for result items. Tool calls are never stored; missing API time or cache fields fall back (speed from total time, cache 0). Frontend plus three fields in `translateResult`
- Claude's spark: `working-line.js` (used by `thread.js`) sets `data-state` on the working line (starting -> thinking/writing/tool/waiting ->
  done/error/stopped); all motion is CSS in `public/css/animations.css` (off with prefers-reduced-motion)
- Notifications: `events.js` calls `notify.js` on turn end (SSE `status: idle`) and on a new `permission` request; `notify.js` reads the
  per-browser preferences (localStorage) and fires desktop / sound; `page-status.js` owns the tab title count and brand state. An archived session is skipped by `notify.js`, by the unread mark in `events.js` and by the count and brand in `page-status.js`. Frontend only
- Panels: `public/js/panels/registry.js` lists them; each exports `render(body, context)`; the context comes from `actions.js`. Not to be confused with panes (`public/js/panes/`): panels are the settings modal's pages, panes are the side area beside the chat
- Panes: `panes.js` creates the host (`pane-host.js`) and registers each pane; `render(body, session)` runs on every refresh (`app.js` `refresh()` calls `panes.refresh()`), so a pane keeps its own state; the host re-attaches section nodes only when the open set changes.
  A fetching pane re-renders through the `rerender` callback it is given and gets its per-session data from `createSessionFetch` (`session-fetch.js`: no timers). Frontend plus the `git-summary` route (details rail) and the `diff` route (Changes pane)
- Split view: `split-view.js` (`createSplitView`) owns a second pane (`#split-pane`) with its own `createThread` instance, prompt cards and a mini composer
  (send / stop only); its session id and open state are per browser in localStorage (`claude-gui.split-session`, `claude-gui.split-open`). `events.js` builds the list of
  threads showing an event's session (main thread if active + `view.paneThread(id)`); `notify.js` gets `onScreen` (main or pane) for the "away" rule and unread
  marks are set only when the session is on screen nowhere. The same session is never in both panes (swap); an archived session is not offered in the picker and leaves the pane empty. `/btw`, the search bar, the workspace panes and the view-mode controls stay main-only (each pane thread applies its own session's transcript view mode). Frontend only
- Shortcuts: `public/js/shortcuts/` holds one table and the code that reads it. `shortcut-list.js` is the ONE table of shortcuts (keys, Hebrew label, group; a row with `action` + `code` (+ `shift`) is page-wide, a row without is documentation for a key handled where it lives) and `shortcutFor(event)`, which matches Ctrl or Cmd, no Alt, an exact Shift and the physical key (`event.code`, so a Hebrew layout works).
  `bind-shortcuts.js` (`bindShortcuts(run)`) is the one page-wide `keydown` listener: it looks the event up in the table and calls the action (`app.js` passes what each action does; the Ctrl+/ action is the folder's own); `shortcuts-dialog.js` is the Ctrl+/ dialog; `panels/panel-help.js` draws its "קיצורי מקלדת" section from the same table, so the three lists cannot drift apart. The composer, the panes and the dialogs
  bind their own keys. A new page-wide key is a new row plus an action in `app.js`; never test `event.key` for a letter or punctuation shortcut. Ctrl+\ is `panes.closeFocused()` and the split view is Ctrl+Shift+\ (see DECISIONS.md)
- Dropdown placement: `popover.js` `position()` measures a menu's natural width, then opens it from the anchor's start edge when it fits, else from the other edge, kept 8 px inside the window (the topbar's "עוד" button sits at the far end of the RTL bar, which used to push its menu off screen). Every dropdown goes through it
- Warm-up: `warm-up.js` (moved from `app.js`) starts Claude Code while a message is typed and prefetches the catalog before a menu opens
- Session search: `session-search.js` (pure: sessions + query -> hits with snippets) feeds `sidebar.js`; `search-hits.js` shows the bar and
  outlines in the open thread. Every rendered item node in `thread.js` carries `data-item-index` (its index in `session.items`; `events.js`
  passes it for live items), which is how a hit finds its message. Frontend only
