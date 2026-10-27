# Decisions

## [2026-10-27] The pane area belongs to the main session only and is hidden by a room rule
**Decision:** The workspace panes and the session details rail are shown for the main (active) session only. The area appears only when the workspace row has at least 560 px for the chat plus the column's width; otherwise it is hidden, the saved choice is kept, and the toggle only shows a toast. There is no special case for the split view: it narrows the main region, so the same rule hides the area. Open panes and the width are global per browser, not per session.
**Alternatives considered:** (1) Panes for both the main and the split session. (2) Opening a pane closes the split view (or the reverse). (3) Per-session open panes. (4) A viewport media query instead of measuring the row.
**Why:** Desktop panes belong to the focused session, and `/btw` and the search bar are already main-only, so the user's mental model stays consistent. At the split view's 1000 px minimum the main region is about 360 px, so the chat would be squeezed under both a rail and a split pane; a rule on the real row width covers this and every other narrow case (collapsed or open sidebar, any window size) with one check and no coupling between the two features. Keeping the saved choice (and not changing it on a toggle without room) means a narrow window never loses the user's layout. The cost: on a very wide window the area can sit next to the split pane, which was judged acceptable. Ctrl+\ was left untouched on purpose (a pending question for D4, see AGENT_CONTEXT.md).

## [2026-10-27] The rail's change totals come from a small `git-summary` route, not from `/api/git`
**Decision:** `GET /api/sessions/:id/git-summary` (lib/git/changes.js `gitSummary`) returns `{ isRepo, branch, files, untracked, added, removed }` from `git status --branch` plus `git diff --numstat` (staged + unstaged). It takes the folder from the session on the server and has no `cwd` parameter. The git runner and its safety flags moved to lib/git/run.js so both git views share them.
**Alternatives considered:** (1) Reuse `/api/git` and count `+`/`-` lines of the returned diff in the browser. (2) Add the summary to `lib/workspace-info.js`. (3) Count what Claude's edit tools wrote (as the per-turn card does) instead of asking git. (4) Count the lines of untracked files.
**Why:** `/api/git` returns up to 300000 characters of diff and cuts it, so counts from it would be wrong for big changes and heavy to fetch on every turn; numstat gives exact totals in a few bytes. `workspace-info.js` was already at the size budget and git is a separate topic (one folder per feature), and moving the runner keeps the safety flags in one file. Asking git covers Bash-made changes that the edit-tool view misses, at the price that the card shows the folder's uncommitted changes, including ones not made in this session (said in its tooltip and the spec). Untracked files are counted as files, not lines, because reading every new file would be unbounded work for a card that refreshes on each turn.

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
