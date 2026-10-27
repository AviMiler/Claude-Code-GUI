# Decisions

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
