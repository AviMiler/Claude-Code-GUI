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
