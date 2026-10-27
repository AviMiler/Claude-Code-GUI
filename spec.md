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
- When: "away" (default: tab hidden or unfocused, or another session is on screen) or "always".
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
