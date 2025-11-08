# Compose Table Service – BILIP v1 & v2

## Executive Summary
BILIP is the chat-first AI that composes DynamicTable definitions and DynamicRowTable rows for the students catalog using natural-language prompts. v1 delivers the students-only, one-shot `/api/bilip/compose` flow that validates AI contracts, materializes rows, and returns an immediate preview. **v2 Delta:** introduces stateful SessionChat conversations that span create and modify intents, add optional sorting, enforce envelopes, and persist transcripts plus summaries for the frontend. Backward compatibility remains guaranteed because the legacy endpoints, validators, and Mongo models stay untouched while v2 capabilities ride behind the `BILIP_V2_ENABLED` feature flag.

## Scope & Non-Goals
### In Scope (v2)
- Conversational SessionChat lifecycles that store every turn and reuse conversation_id across requests.
- Create + modify flows that share catalog validation, reuse v1 contract rules, and materialize DynamicRowTable rows.
- Filters with catalog-backed keys, optional sorting asc/desc, and row guard enforcement prior to heavy queries.
- Structured envelopes (clarification, success-create, success-modify, failure) that include summaries, explanations, and options.
- messages[] transcript management so the frontend can mirror the full conversation context per turn.
- Row rebuild policy covering all column/filter/sort edits to keep DynamicRowTable data in sync.

### Non-Goals
- Exports (CSV/Excel or background jobs) remain out-of-scope.
- Multi-collection joins or schema cloning/history for DynamicTable definitions.
- PII masking or advanced governance on student documents beyond existing catalog constraints.
- Background workers for large exports or asynchronous rebuild pipelines.

## System Architecture
- **Frontend:** Chat UI + My Tables view consume envelopes, render messages[], and refresh tables via `result.summary`.
- **AI Layer:** BILIP runs on `gpt-5-mini-2025-08-07`, receives the strict system prompt, and calls MCP metadata-only tools.
- **Backend:** Express routes feed middleware, validators, chat/compose controllers, services, and query/row utilities following WARP (Validation → Query → Transformation → Output).
- **Database:** MongoDB stores DynamicTable definitions, DynamicRowTable rows, SessionChat transcripts, and ErrorLog entries for observability.
**v2 Delta:** introduces ChatService orchestration, MCP `tables_get_schema`, SessionChat persistence, and row estimator utilities layered on top of the existing compose stack.

## Feature Flags
- `BILIP_V2_ENABLED` gates registration of `/api/bilip/chat` and `/api/bilip/chat/:conversation_id` plus their controller/service wiring.
- Default off in prod; on in staging; instant rollback by flipping false.
- When the flag is false the system exposes only v1 endpoints, ensuring we can ship the v2 stack without risking existing traffic.

## Data Models
### DynamicTable
DynamicTable: name, description, status, columns[], filters[], optional sort { key, dir }, created_by, timestamps, indexes. Each record defines the canonical table contract (labels, column keys, filter DSL, and optional `sort`) plus ownership metadata; indexes focus on `{ created_by, name }` uniqueness and status filters for faster list queries.

### DynamicRowTable
DynamicRowTable: table_id, data[], status, timestamps; indexed by table_id and created_at. Every row document stores the denormalized student data for a DynamicTable, ties back via `dynamic_table_id`, and is regenerated whenever definitions change.

### SessionChat
SessionChat: user_id, table_id?, messages[{sender,content,timestamp}], timestamps; created on first chat turn; FE sends conversation_id: null to start. The model keeps chronological `{ role: 'user'|'assistant', content }` entries, remembers the table_id once one is produced, and powers transcript reads.

### ErrorLog
ErrorLog: { path, parameter_input, function_name, error } used by try/catch everywhere. Controllers, services, and validators persist failure context here before rethrowing so ops can trace feature-flagged rollouts.

## MCP Tools (Metadata Only)
- **db_introspect_students()** – returns `{ base_entity: 'students', fields[] }` straight from `schema.catalog.json` so BILIP knows the valid sources.
- **db_search_fields({ query })** – fuzzy matches catalog labels/keys to disambiguate prompt terms before drafting contracts.
- **tables_get_schema({ table_id })** – loads `{ table_id, name, columns[], filters[], sort? }` for modify intents so AI reasons about concrete changes.
Rule: No data reads via MCP; metadata only.

## Endpoints
### v2 (Flagged)
| Method | Path | Purpose | Request Highlights | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/bilip/chat` | Chat turn handler for create/modify. | Body: `{ prompt, conversation_id|null, table_id|null, user_id }`. | Returns one of the envelopes below (clarification, success-create, success-modify, failure). |
| GET | `/api/bilip/chat/:conversation_id` | Fetch SessionChat transcript. | Path param `conversation_id`; optional query uses auth context to scope to owner. | `{ conversation_id, table_id|null, messages[], created_at, updated_at }`. |
`BILIP_V2_ENABLED` must be true for these routes to mount; the POST endpoint both orchestrates AI + MCP + validators and returns the envelope, while the GET endpoint is a pure read on SessionChat.

### v1 (Unchanged)
| Method | Path | Purpose | Request Highlights | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/bilip/compose` | v1 one-shot DynamicTable creation. | Body: `{ user_id, message }`; AI contract committed via MCP before hitting backend validator. | `{ table_id, name, description, total_rows, columns[], filters[] }` plus any validation errors surfaced as HTTP 4xx/5xx. |
| GET | `/api/ai-tables/:id` | Fetch table metadata + preview rows. | Path param `id` referencing `DynamicTable._id`. | `{ table, rows[], total_rows_preview }` for demo rendering; unchanged between v1 and v2. |
**v2 Delta:** the new chat endpoints do not replace `/api/bilip/compose`; FE chooses the experience by checking the flag and surfacing either the conversational UI or legacy composer.

## AI Response Envelopes
Every chat API response includes a messages[] transcript.

### Clarification
Used when AI needs more input before committing changes.
```json
{
  "status": "need_clarification",
  "conversation_id": "64f...",
  "messages": [{ "role": "ai", "message": "Which cohort should I filter?" }]
}
```

### Success — Create
Returned after a validated generate_table intent, materialized rows, and SessionChat update.
```json
{
  "status": "ready",
  "intent": "generate_table",
  "conversation_id": "64f...",
  "table_id": "65a...",
  "messages": [{ "role": "ai", "message": "Table created with 128 rows." }],
  "result": { "summary": {
    "table_id": "65a...",
    "name": "Active Seniors",
    "total_rows": 128,
    "columns": ["student_name", "email"],
    "filters": [{ "key": "students.status", "op": "eq", "value": "active" }],
    "sort": { "key": "students.email", "dir": "asc" }
  }}
}
```

### Success — Modify
Returned after applying modify_table changes, deleting rows, and rebuilding.
```json
{
  "status": "ready",
  "intent": "modify_table",
  "conversation_id": "64f...",
  "table_id": "65a...",
  "messages": [{ "role": "ai", "message": "Applied changes and rebuilt 130 rows." }],
  "result": { "summary": { "table_id": "65a...", "name": "Active Seniors", "total_rows": 130, "columns": ["student_name", "email", "campus"], "filters": [ ... ], "sort": { "key": "students.email", "dir": "desc" } }}
}
```

### Failure
Used for validation issues, guards, or unexpected runtime problems.
```json
{
  "status": "failed",
  "conversation_id": "64f...",
  "table_id": "65a...",
  "messages": [{ "role": "ai", "message": "I cannot process that request." }],
  "explanation": "Sort direction must be asc or desc.",
  "options": ["Use asc", "Use desc"]
}
```

## Chat & Modify Flows
**Create Flow:** (1) User sends `prompt` with `conversation_id=null` and no `table_id`. (2) Chat controller opens SessionChat, appends the user message, and AI may issue clarification until it has table name, columns, and ≥1 filter. (3) Contract.validator enforces v1 rules, row estimation runs, and on success the service creates DynamicTable + DynamicRowTable rows, updates the session `table_id`, and returns Success — Create with summary.

**Modify Flow:** (1) User sends `prompt` with existing `conversation_id` and `table_id`. (2) Chat service loads the table schema through MCP `tables_get_schema`, validates `changes` via modify.validator, and applies adds/removes/updates on columns, filters, name, description, and sort. (3) Any change to columns, filters, or sort triggers delete-and-rebuild of DynamicRowTable rows. (4) Success — Modify summarizes the new configuration and row count.

**Transcript Handling:** Both controller methods append `{ role: 'user' | 'assistant', content }` to SessionChat and every envelope echoes the current `messages[]`, so FE can always render the turn history. Row guard checks occur before DB writes on create and after modifications propose new filters; clarifications return quickly to keep conversations tight.

## Validation & Guardrails
- Operators: eq, ne, in, contains, gte, lte.
- At least one filter is required to create a table.
- Sorting supports only asc or desc.
- Reject if estimated rows > 5000; return failure envelope with explanation and options to narrow.
- Create path reuses `ValidateStudentsContract`; modify path forces arrays for `columns`/`filters` payloads when present and ensures sort.dir ∈ {asc, desc} plus sort.key exists in catalog or current columns.
- Filters must start with `students.` and align with the catalog data types; `contains` maps to case-insensitive regex, `in` expects arrays.
- Row guard runs via `EstimateRowCount` before row inserts; modify validator also checks computed column conflicts and impossible updates.

## Error Protocol
- Controllers, services, and validators wrap logic in try/catch blocks; each catch logs `{ path, parameter_input, function_name, error }` into ErrorLog before responding.
- Failure responses always use the Failure envelope with `messages[]`, human-readable `explanation`, and actionable `options` so FE shows precise guidance.
- Unexpected exceptions (e.g., AI timeout, Mongo error) return HTTP 500 plus the structured envelope to keep clients resilient while ops reviews ErrorLog entries.

## Frontend Integration Notes
- Start a session by calling `POST /api/bilip/chat` with `conversation_id: null`; persist the returned `conversation_id` for subsequent turns.
- Provide `table_id` on modify prompts so MCP can fetch schema and validators know which DynamicTable to mutate.
- Render the latest `messages[]` transcript after every response, keeping assistant/user turns visible; `options[]` map directly to quick replies.
- On `status=need_clarification`, prompt the user for the requested data; on `status=failed`, surface the explanation and suggested options before allowing another turn.
- After any `status=ready`, sync the relevant table view using `result.summary` (name, columns[], filters[], optional sort, total_rows) and refresh any My Tables listing if needed.

## Testing & Verification
- **Smoke:** `/api/bilip/compose` v1 path still creates tables; `/api/bilip/chat` create and modify flows work end-to-end when the flag is on.
- **Failure:** invalid sort direction, unknown fields, missing prompt/user_id, and the >5000 row guard all return structured Failure envelopes with options.
- **Transcript:** `GET /api/bilip/chat/:conversation_id` returns the full messages[] history, table_id linkage, and timestamps for UI playback.
- **Row Rebuild:** modifying columns/filters/sort deletes + rebuilds rows, and the returned `total_rows` matches Mongo counts.
- **Clarification:** AI can pause for more info without writing data; ensure FE loops user input back with the same conversation_id.

## Backward Compatibility
v1 routes (`/api/bilip/compose`, `/api/ai-tables/:id`), validators, catalog contracts, and DynamicRowTable materialization logic remain intact; `BILIP_V2_ENABLED=false` keeps production behavior identical to pre-v2 deployments while the new chat stack coexists safely.

## Changelog
- Added `/api/bilip/chat` with conversational envelopes for create + modify intents.
- Added `/api/bilip/chat/:conversation_id` transcript retrieval backed by SessionChat.
- Added modify operations (add/remove/update columns and filters, rename tables) plus optional sorting asc/desc.
- Added delete-and-rebuild row workflow tied to schema/filter/sort changes and enforced row guard.
- Added MCP `tables_get_schema`, AIReasoner utilities, and persisted messages[] transcripts across every response.
