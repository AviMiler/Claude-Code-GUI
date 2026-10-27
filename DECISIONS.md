# Decisions

## [2026-10-27] /btw gets its own route, not the generic control whitelist
**Decision:** `POST /api/sessions/:id/side-question` (lib/side-questions.js) sends the `side_question` control request with a 10 minute timeout.
**Alternatives considered:** Add `side_question` to `WRITE_SUBTYPES` in lib/catalog-service.js and use the generic `/control` route.
**Why:** The generic control routes are documented as costing no tokens and have short default timeouts; `side_question` calls the model and the local model can be slow. A separate route keeps that guarantee true and allows input limits (question 4000 characters, history 20).
