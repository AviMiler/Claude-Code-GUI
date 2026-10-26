# Project Map
_Last updated: 2026-10-26_

## File Tree
```
./AGENT_CONTEXT.md  ./ARCHITECTURE.md  ./CHANGELOG.md  ./DEPENDENCIES.md  ./PROJECT_MAP.md
./config.json
./server.js
./dev/config.fake.json  ./dev/fake-claude.cmd  ./dev/fake-claude.js
./lib/api-routes.js  ./lib/api-routes-tools.js  ./lib/catalog-service.js  ./lib/claude-files.js
./lib/cli-args.js  ./lib/cli-capabilities.js  ./lib/cli-commands.js  ./lib/cli-process.js  ./lib/config.js
./lib/event-hub.js  ./lib/event-translator.js  ./lib/failure-messages.js  ./lib/http-utils.js
./lib/session-runtime.js  ./lib/session-service.js  ./lib/session-store.js  ./lib/spawn-utils.js
./lib/static-files.js  ./lib/transcripts.js  ./lib/workspace-info.js
./public/index.html  ./public/icon.svg
./public/css/tokens.css  ./public/css/layout.css  ./public/css/messages.css  ./public/css/composer.css  ./public/css/panels.css
./public/js/app.js  ./public/js/events.js  ./public/js/state.js  ./public/js/api.js  ./public/js/actions.js
./public/js/thread.js  ./public/js/render-items.js  ./public/js/render-tools.js  ./public/js/markdown.js
./public/js/composer.js  ./public/js/composer-menus.js  ./public/js/popover.js  ./public/js/prompt-cards.js
./public/js/sidebar.js  ./public/js/chrome.js  ./public/js/ui.js  ./public/js/risk.js  ./public/js/dom.js  ./public/js/icons.js  ./public/js/modes.js
./public/js/commands-data.js  ./public/js/command-catalog.js  ./public/js/command-runner.js
./public/js/panels/registry.js  ./public/js/panels/panel-host.js  ./public/js/panels/kit.js  ./public/js/panels/file-editor.js
./public/js/panels/panel-model.js  ./public/js/panels/panel-permissions.js  ./public/js/panels/panel-usage.js
./public/js/panels/panel-workspace.js  ./public/js/panels/panel-skills.js  ./public/js/panels/panel-agents.js
./public/js/panels/panel-mcp.js  ./public/js/panels/panel-plugins.js  ./public/js/panels/panel-config.js
./public/js/panels/panel-status.js  ./public/js/panels/panel-help.js
```

## File Descriptions
| File | Description |
|---|---|
| `server.js` | Entry point. HTTP server, request guard, routing to API or static files. |
| `config.json` | Port, `claudePath`, `model`, default folder, `idleMinutes`, extra environment variables. |
| `dev/fake-claude.js` | Fake CLI speaking stream-json + control protocol, for developing without an API key. |
| `dev/fake-claude.cmd`, `dev/config.fake.json` | Shim and config to run the GUI against the fake CLI (port 3738). |
| `lib/config.js` | Loads `config.json` (or `CLAUDE_GUI_CONFIG`) with defaults. |
| `lib/http-utils.js` | JSON helpers, `httpError`, Host/Origin guard. |
| `lib/static-files.js` | Serves `public/` safely. |
| `lib/event-hub.js` | SSE clients and broadcast. |
| `lib/session-store.js` | In-memory sessions with persistence to `data/sessions.json` (or `CLAUDE_GUI_DATA`). |
| `lib/spawn-utils.js` | How to start `claude` (cmd.exe quoting) and run it to completion. |
| `lib/cli-capabilities.js` | Reads `claude --help/--version`: version, flags, permission modes. |
| `lib/cli-args.js` | Flags for a session process, filtered by capabilities. |
| `lib/cli-process.js` | One long-lived stream-json process and its control protocol. |
| `lib/session-runtime.js` | Process per session: start, route events, permission prompts, interrupt, idle shutdown. |
| `lib/event-translator.js` | CLI `stream-json` events -> UI items and streaming deltas. |
| `lib/failure-messages.js` | Hebrew explanation of a failed CLI process. |
| `lib/session-service.js` | Glue: sessions, messages, stop, clear, fork, permissions, settings. |
| `lib/catalog-service.js` | Commands/skills/agents/models catalog and whitelisted control requests (session or probe). |
| `lib/cli-commands.js` | Whitelisted `claude mcp|plugin|doctor|auth ...` subcommands. |
| `lib/claude-files.js` | Read/write settings, CLAUDE.md, agents, skills, commands, output styles by kind. |
| `lib/transcripts.js` | Past CLI conversations of a folder (/resume) and their import. |
| `lib/workspace-info.js` | File search for @-mentions and git status/diff. |
| `lib/api-routes.js` | Route table and session routes. |
| `lib/api-routes-tools.js` | Routes behind the panels (catalog, control, cli, files, transcripts, git). |
| `public/index.html` | Page shell (RTL, Hebrew): sidebar, top bar, thread, composer area. |
| `public/css/tokens.css` | Colors (light/dark), fonts, base elements. |
| `public/css/layout.css` | Sidebar, top bar, welcome page, buttons. |
| `public/css/messages.css` | Messages, thinking, tool rows, diffs, todos, results. |
| `public/css/composer.css` | Composer, chips, popover menus, permission/question/plan cards. |
| `public/css/panels.css` | Settings modal, panel building blocks, dialogs, toasts. |
| `public/js/app.js` | Frontend entry: wiring, refresh, keyboard shortcuts. |
| `public/js/events.js` | Applies SSE events to state and views. |
| `public/js/state.js` | Client state, cached catalog, recent folders. |
| `public/js/api.js` | Fetch wrappers and SSE subscription. |
| `public/js/actions.js` | Session actions and the context given to panels. |
| `public/js/thread.js` | Conversation view: items, live streaming, working line. |
| `public/js/render-items.js` | Items -> DOM; Markdown export. |
| `public/js/render-tools.js` | Tool rows: terminal, diffs, todos, results. |
| `public/js/markdown.js` | Safe Markdown renderer with code copy. |
| `public/js/composer.js` | Message box, chips, send/stop, history, Shift+Tab. |
| `public/js/composer-menus.js` | `/` command menu and `@` mention menu. |
| `public/js/popover.js` | Dropdowns and keyboard-driven list menus. |
| `public/js/prompt-cards.js` | Permission, AskUserQuestion and plan-approval cards. |
| `public/js/sidebar.js` | Session list grouped by date, with search. |
| `public/js/chrome.js` | Top bar and welcome page. |
| `public/js/ui.js` | Toasts, confirm/prompt dialogs, theme. |
| `public/js/risk.js` | Confirmations before significant actions (`guardedApi`, risky modes, account/cloud commands). |
| `public/js/dom.js` | `h()` element helper and small utilities. |
| `public/js/icons.js` | Inline SVG icons. |
| `public/js/modes.js` | Permission modes and effort levels. |
| `public/js/commands-data.js` | Built-in slash commands of 2.1.308, Hebrew text, where each runs. |
| `public/js/command-catalog.js` | Merge with the live CLI catalog, grouping, filtering, parsing. |
| `public/js/command-runner.js` | Executes a slash command (panel, action, CLI, terminal-only). |
| `public/js/panels/registry.js` | List of panels in navigation order. |
| `public/js/panels/panel-host.js` | Settings-style modal with side navigation. |
| `public/js/panels/kit.js` | Panel building blocks (sections, rows, badges, fields, loading). |
| `public/js/panels/file-editor.js` | Inline editor for Claude's own files. |
| `public/js/panels/panel-*.js` | One panel each: model, permissions, usage, workspace (diff/resume), skills, agents, mcp, plugins, config (hooks/memory/settings), status (+appearance), help. |
