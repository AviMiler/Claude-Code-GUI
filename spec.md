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
