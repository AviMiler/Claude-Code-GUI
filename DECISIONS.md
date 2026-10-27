# Decisions

## [2026-10-27] The file viewer reads the file's current text through a session-scoped route
**Decision:** `GET /api/file-view?sessionId=&path=` (lib/file-view.js) returns the file as it is now. The allowed roots (session folder, `addDirs`, uploads) are taken from the session on the server, compared as real paths, and any `cwd` parameter is ignored.
**Alternatives considered:** (1) Show the content recorded in the tool item (Read result, Edit strings) with no new route. (2) A route taking `cwd=` or any absolute path. (3) A general "read any file" route.
**Why:** The recorded tool content is partial (Edit holds only the changed strings, Read results may be cut) and cannot show surrounding lines or highlight a line range. A request-supplied `cwd` or free path would make the folder check meaningless and turn the route into an arbitrary-file reader, which the no-auth, cross-site-GET issues make worse. Session-scoped roots limit it to the places Claude already works in without asking. The cost is that the view can differ from what the tool saw if the file changed since; marks are then simply omitted.

## [2026-10-27] Prompt templates are stored on the server, not in localStorage
**Decision:** Templates live in `data/templates.json` (lib/templates.js) behind `GET /api/templates`, `PUT/DELETE /api/templates/:id`; the browser generates the id and PUT upserts.
**Alternatives considered:** Per-browser localStorage (like the notification and sidebar-grouping preferences).
**Why:** Templates are user content worth keeping, not a display preference. The server file survives a browser reset or cleared site data and every tab sees the same list. The cost is a new route set and a data file, kept small by limits (name 80, text 20000, 200 templates) and an atomic write like the session store.

## [2026-10-27] /btw gets its own route, not the generic control whitelist
**Decision:** `POST /api/sessions/:id/side-question` (lib/side-questions.js) sends the `side_question` control request with a 10 minute timeout.
**Alternatives considered:** Add `side_question` to `WRITE_SUBTYPES` in lib/catalog-service.js and use the generic `/control` route.
**Why:** The generic control routes are documented as costing no tokens and have short default timeouts; `side_question` calls the model and the local model can be slow. A separate route keeps that guarantee true and allows input limits (question 4000 characters, history 20).

## [2026-10-27] Session search runs in the browser, no server index
**Decision:** Full-text search scans `session.items` in the browser (public/js/session-search.js), newest 3000 items per session, count capped at 99.
**Alternatives considered:** A server-side search endpoint or index over `data/sessions.json`.
**Why:** `/api/state` and SSE already give the browser every item, so no new route, no index to keep in sync with live streaming, and results stay current as items arrive. The cost is a scan per query, bounded by the cap and a 150 ms debounce.

## [2026-10-27] The split-view pane has a mini composer, and extras stay main-only
**Decision:** The second pane has a live thread, its approval cards and a compact composer (text, send, stop). Attachments, slash menus, `@`, chips and `/btw` stay in the main composer; a swap button makes the pane's session the main one.
**Alternatives considered:** A read-only second pane; a full second composer with every feature.
**Why:** The use case (one session plans, another executes) needs sending to both, so read-only is not enough. A full second composer would duplicate menus, attachments and commands that are wired to the single active session, for little gain; one-click swap covers them.
