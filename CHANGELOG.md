# Changelog

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
