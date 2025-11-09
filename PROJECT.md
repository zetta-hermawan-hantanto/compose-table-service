# Compose Table Service – BILIP v3

BILIP (“Build It Like I Prompt”) is our chat-first assistant for composing derived student tables and exporting CSV snapshots straight from natural-language conversations. The service that powers it lives in this repository and currently runs the third iteration of the experience: **v1 single-shot compose**, **v2 stateful chat (create + modify)**, and **v3 export-from-chat**. Everything described below reflects the actual code in `src/` as of today so there is no drift between the docs and the implementation.

---

## 1. Purpose & Feature Set (Truth Source)

- **Table generation** – POST `/api/bilip/chat` can return a `status: ready, intent: generate_table` envelope, after which `ProcessChatTurn` stores the DynamicTable definition plus its DynamicRowTable rows.
- **Table modification** – The same endpoint issues modify envelopes that edit the saved schema (columns, filters, sort, metadata) and rebuild rows in MongoDB.
- **CSV export** – Requests with `intent: export_table` go through the synchronous export pipeline (`ProcessExportTurn` → CSV builder → S3 upload → SES email) without creating tables.
- **Transcript + retrieval APIs** – GET `/api/bilip/chat/:conversation_id` replays the transcript stored in `session_chat`, while GET `/api/ai-tables` and `/api/ai-tables/:id` serve table metadata plus a 100-row preview for the UI.
- **Operational guardrails** – Auth is enforced globally through `AuthMiddleware`, AI calls are routed via `CallAIWithEnvelope`, and every failure path writes into `error_log` for traceability.

Non-goals of this service remain unchanged: there is no UI rendering, no student ingestion, no asynchronous workers, and no background CSV streaming. All data that BILIP touches already exists in MongoDB (`students`, `dynamic_table`, `dynamic_row_table`, etc.).

---

## 2. Responsibilities & Explicit Non-Goals

| Responsibility | Owning Code | Notes |
| --- | --- | --- |
| Enforce auth, body parsing, routing | `src/app.js`, `src/middleware/auth.middleware.js`, `src/routes/bilip.routes.js` | Every `/api` route runs behind JWT auth and inherits the same error logging behavior. |
| Orchestrate chat turns | `src/controllers/chat.controller.js` + `src/services/chat.service.js` | Handles create/modify/export intents, session persistence, and envelope normalization. |
| Ad-hoc exports | `src/services/export.service.js` and supporting utils | No DynamicTable writes. CSV is generated in-memory, uploaded to S3, and emailed. |
| Table retrieval | `src/controllers/compose.controller.js` | `/api/ai-tables` (user scoped) + `/api/ai-tables/:id` (direct lookup). |
| Validation layer | `src/validators/*.js` | Contract, modify, and export validators use the shared catalog metadata. |
| Metadata tools | `src/mcp/*.js`, `src/ai/bilip_v2.system.prompt.js` | Implements MCP tools consumed by OpenAI so the AI never sees raw data. |
| Observability | `src/models/error_log.model.js` | Every controller/service catch writes enough context to trace issues. |

**Not handled here**
- Student lifecycle, catalog generation, or any upstream ETL processes.
- Background jobs or queueing (all routes are synchronous and will block the request thread).
- Frontend rendering—the UI consumes JSON envelopes exclusively.
- Automatic feature-flag gating. `BILIP_V2_ENABLED` exists in `.env` but is **not referenced anywhere** in code today; deployments should not rely on that flag until it is wired in.

---

## 3. Runtime Architecture & Request Lifecycles

1. **Server setup** (`src/server.js`)
   - Loads `.env`, calls `ConnectDB` (`src/config/database.js`) to connect mongoose to `process.env.MONGODB_URI`, and starts Express on `PORT` (default 3000).
2. **Express app** (`src/app.js`)
   - Global middleware: `cors` limited to `http://localhost:4200`, JSON + URL-encoded parsers, `/health` route, JWT `AuthMiddleware`, 404 handler.
3. **Request flow** (`/api/bilip/chat`)
   - Auth middleware injects `req.userId` from `JWT_SECRET`-signed token.
   - `HandleChatTurn` validates the payload (`prompt`, optional `conversation_id`, `table_id`, `lang`), creates or loads a `session_chat` document, appends the user message, and calls `ProcessChatTurn`.
   - `ProcessChatTurn` builds an MCP server/client, sends messages + system prompt to OpenAI via `CallAIWithEnvelope`, and then branches on `intent`:
     - `need_clarification` and `failed` are returned verbatim.
     - `generate_table` → validates contract, queries `students`, inserts table + rows, adds assistant transcript entry, returns summary (no row-limit enforcement is coded yet even though `EstimateRowCount` runs).
     - `modify_table` → validates changes, mutates the DynamicTable document, calls `RebuildTableRows` (full delete + reinsert) and returns the updated summary.
     - `export_table` → calls `ProcessExportTurn` (validation → Mongo query → CSV → S3 → email → ExportHistory record).
   - The controller appends the assistant message from the envelope and saves the session before returning HTTP 200. Errors fall back to `GetErrorMessage` (localized EN/FR) and respond with HTTP 500 plus a `status: failed` envelope.
4. **Other routes**
   - `GET /api/bilip/chat/:conversation_id` reads the session document, formats `{ role, message }`, and returns metadata (`table_id`, `created_at`, etc.).
   - `GET /api/ai-tables` fetches all active tables created by the authenticated user.
   - `GET /api/ai-tables/:id` fetches a specific table and up to 100 preview rows. (This endpoint does **not** currently restrict by `created_by`—callers must ensure they only request their own IDs.)

Reference sequence (happy path create):
```
Client Prompt
  → POST /api/bilip/chat (Auth required)
    → chat.controller.js::HandleChatTurn
      → services/chat.service.js::ProcessChatTurn
        → utils/ai.reasoner.js::CallAIWithEnvelope
          ↔ OpenAI (model = process.env.BILIP_MODEL or gpt-4o-mini)
          ↔ MCP tools (db_introspect_students, db_search_fields, ai_commit_plan, tables_get_schema)
        → validators + Mongo writes
    ← JSON envelope (status ready, intent generate_table, summary)
```

---

## 4. Directory & Module Map (what lives where)

- `src/app.js`, `src/server.js` – Express bootstrap, CORS, health check, global middleware, graceful shutdown.
- `src/routes/bilip.routes.js` – Declares `/api/ai-tables`, `/api/ai-tables/:id`, `/api/bilip/chat`, `/api/bilip/chat/:conversation_id`.
- `src/middleware/auth.middleware.js` – JWT validation and `req.userId` injection with centralized logging on failure.
- `src/controllers/compose.controller.js` – Read-only table endpoints.
- `src/controllers/chat.controller.js` – Stateless entrypoint for chat turns + transcript retrieval.
- `src/services/chat.service.js` – Core orchestrator that coordinates AI, validators, Mongo queries, and envelope shaping.
- `src/services/export.service.js` – Encapsulates the CSV export lifecycle and handles ExportHistory writes.
- `src/services/amazon.service.js` – SES transport wrapper; only sends emails when `NODE_ENV === 'production'`, otherwise `sendMail` is effectively a no-op.
- `src/utils/*` – Supporting logic:
  - `ai.reasoner.js` OpenAI + MCP invocation loop (10 iteration max).
  - `query.builders.js`, `row.estimator.js` for Mongo filters/projections/sorts and (unused) row counts.
  - `csv.builder.js`, `s3.uploader.js`, `email.js`, `export.messages.js` for the export flow.
- `src/mcp/*` – Lightweight in-process MCP server/client exposing metadata-only tools backed by `shared/catalog/schema.catalog.json`.
- `src/ai/bilip_v2.system.prompt.js` – Source of truth for envelopes, guardrails, and examples (already describing v3 scope even though the filename says v2).
- `src/models/*` – Mongoose schemas for students, tables, rows, chats, users, mail, export history, and error logs.
- `src/shared/templates/export/EN.html` & `FR.html` – HTML templates used by `SendExportEmail`.
- `BILIP_V3_IMPLEMENTATION_SUMMARY.md` & `BILIP_V3_EXPORT_TESTING_GUIDE.md` – Operational documentation for the export feature. Keep them alongside this file for onboarding and QA.

---

## 5. API Surface and Expected Behavior

| Route | Method | Auth? | Handler | Returns |
| --- | --- | --- | --- | --- |
| `/health` | GET | No | `app.js` inline | `{ status, timestamp, service }` for liveness probes. |
| `/api/ai-tables` | GET | Yes | `compose.controller.js::GetAllAiTables` | All `dynamic_table` docs with `status: 'active'` created by `req.userId`. |
| `/api/ai-tables/:id` | GET | Yes | `compose.controller.js::GetAiTableById` | Table metadata + up to 100 `dynamic_row_table` rows (no ownership check). |
| `/api/bilip/chat` | POST | Yes | `chat.controller.js::HandleChatTurn` | One of the five envelopes (clarification, failed, ready+create, ready+modify, ready+export). |
| `/api/bilip/chat/:conversation_id` | GET | Yes | `chat.controller.js::GetChatHistory` | Session transcript (`messages`, `table_id`, timestamps). |

### `/api/bilip/chat` payload
```jsonc
{
  "prompt": "Add students admitted this week",
  "conversation_id": null,         // omit on first turn
  "table_id": null,                // optional hint for modify
  "lang": "en"                     // accepts "en" or "fr"
}
```
Responses always include `conversation_id`. Controller-level errors go through `GetErrorMessage`, while deep service errors bubble up with a generic `"An unexpected error occurred."` assistant message plus the thrown `.message` in `explanation` for debugging.

---

## 6. Session, AI, and MCP Workflow Details

1. **Session persistence** – `session_chat` stores `{ role: 'user' | 'assistant', content }` arrays. Controller appends the user prompt before calling the service; the service appends the final assistant message before responding.
2. **System prompt + tools** – `GetBilipV2SystemPrompt()` defines the allowable envelopes, validation rules, and examples. Even though the file says “v2”, the prompt text clearly states “VERSION SCOPE: V3 - Students Only (Create + Modify + Export).”
3. **MCP tools** – Implemented in-process (`src/mcp/mcp.server.js`):
   - `db_introspect_students()` – Loads catalog metadata from `shared/catalog/schema.catalog.json`.
   - `db_search_fields({ query })` – Case-insensitive search over catalog fields.
   - `ai_commit_plan({ contract })` – Stores the contract in request context (for completeness, even though controllers never read the context today).
   - `tables_get_schema({ table_id })` – Reads the existing DynamicTable definition for modify intents.
4. **OpenAI integration** – `CallAIWithEnvelope` uses `OpenAI.chat.completions.create` with `tools` set to the MCP definitions. Tool calls are executed locally and fed back into the conversation for up to 10 iterations. The final assistant response must be JSON; parsing failures throw immediately.
5. **Language handling** – Only `en` and `fr` are recognized. `HandleChatTurn` defaults to English and passes the language code down so export emails and error copy can localize properly.

---

## 7. Data Models in Play

| Model | File | Purpose |
| --- | --- | --- |
| `dynamic_table` | `src/models/dynamic_table.model.js` | Stores schema metadata (name, description, columns, filters, optional sort, creator, session reference). |
| `dynamic_row_table` | `src/models/dynamic_row_table.model.js` | Holds denormalized row data for each table. Rebuilt on every modify. |
| `session_chat` | `src/models/session_chat.model.js` | Persists full transcripts per conversation, including the associated `table_id` once known. |
| `students` | `src/models/student.model.js` | The source of truth entity that tables and exports query. The schema is large; contracts reference fields via `students.<field_name>`. |
| `export_history` | `src/models/export.history.model.js` | Audit log for exports (columns, filters, delimiter, row_count, presigned URL metadata, lang, status). Failures also write here with `status: 'failed'`. |
| `mail` | `src/models/mail.model.js` | Stores a copy of the email body when `SendExportEmail` runs so that downstream systems can surface it. |
| `user` | `src/models/user.model.js` | Provides email/name/civility when building export notifications. |
| `error_log` | `src/models/error_log.model.js` | Simple `{ function_name, parameter_input, error, path }` schema that every catch clause writes to. |

All schemas use Mongoose timestamps (customized keys where needed) and rely on the Mongo connection established in `ConnectDB`. There is no soft-delete for rows/tables beyond setting `status: 'deleted'` manually (not implemented in code yet).

---

## 8. Validation & Guardrails (implemented facts)

- **Contract validator (`ValidateStudentsContract`)**
  - Requires `base_entity === 'students'`.
  - Table name must match `/^[A-Za-z0-9 _-]+$/` and be ≤ 60 chars. The code does not check for duplicates in Mongo—two tables can share the same name today.
  - Columns must have unique `key` values and reference valid catalog fields or computed expressions of the form `field1 + ' ' + field2` (string concatenation only).
  - Filters must start with `students.` and use operators in `{ eq, ne, in, contains, gte, lte }` with type-aware validation.
  - Sort (optional) must include both `key` and `dir`; direction must be `asc` or `desc`.

- **Modify validator (`ValidateModifyContract`)**
  - Validates structure of `add_columns`, `remove_columns`, `add_filters`, `remove_filters`, `update_filters`, and `sort` before mutating the table.
  - Enforces no duplicate column keys when adding and ensures referenced columns/filters exist before removing.
  - Validates sort keys against the catalog or existing columns.

- **Export validator (`ValidateExportRequest`)**
  - Columns array is required; unknown columns trigger a clarification response listing valid examples from the catalog.
  - Filters are optional but must target known fields and supported operators.
  - Delimiter must be exactly `"comma"`, `"semicolon"`, or `"tab"`; invalid values trigger clarification.
  - Language-specific human text comes from `utils/export.messages.js`.

- **Row count guard** – `EstimateRowCount` exists and runs during create flows, but the result is **not used** to block large datasets yet. Keep this in mind: extremely broad filters will attempt to materialize every matching student record.

- **Error handling** – Every controller/service catch block logs to `error_log` with serialized parameters. Chat errors return structured envelopes; export errors additionally write a `failed` export history entry.

---

## 9. Export Pipeline (CSV + Email)

1. **Validation** – `ValidateExportRequest` ensures we know the columns, delimiter, and filters (if any). Missing or invalid inputs respond with clarification/failure envelopes instead of running queries.
2. **Query execution** – `ProcessExportTurn` builds a Mongo filter via `BuildMongoFilter`, projects only the requested columns, and executes `.find().select().lean()` on `StudentModel`. There is no row cap built in—size is controlled by filters alone.
3. **CSV generation** – `BuildCsvFromRows` writes headers and rows, escaping dangerous characters (`=`, `+`, `-`, `@`) and quoting cells when needed. Dates are emitted as UTC ISO strings via `moment`.
4. **S3 upload** – `UploadCsvToS3` sanitizes the filename (`table-{slug}-{yyyyMMdd-HHmmss}.csv`), pushes the buffer to the bucket referenced in `.env`, and generates a presigned GET URL that expires in 72 hours.
5. **Email notification** – `SendExportEmail` fetches the requesting user (`UserModel`), chooses the EN/FR template (`src/shared/templates/export/*.html`), compiles placeholders (civility, first name, link), and passes the HTML to `sendMail`. Because `amazon.service.js` only actually sends mail when `NODE_ENV === 'production'`, remember that local/staging runs will skip the transport but still log records in `mail`.
6. **History + envelope** – Successful exports create an `export_history` row and return a `status: ready, intent: export_table` envelope with a human-friendly `messages[0].message` (no URL). Failures log, attempt to persist a `failed` history row, and respond with `status: failed` plus actionable guidance.

---

## 10. Environment, Dependencies & External Services

| Variable | Required? | Used By | Notes |
| --- | --- | --- | --- |
| `PORT` | Optional (default 3000) | `src/server.js` | Port for Express. |
| `NODE_ENV` | Yes | Server + `sendMail` | Controls logging and whether SES actually sends emails. |
| `MONGODB_URI` | Yes | `ConnectDB` | Mongo connection string for all models. |
| `OPENAI_API_KEY` | Yes | `CallAIWithEnvelope` | Needed for every chat turn; without it, service throws. |
| `BILIP_MODEL` | Optional | `CallAIWithEnvelope` | Defaults to `gpt-4o-mini` if unset, despite `.env` referencing `gpt-5-2025-08-07`. |
| `JWT_SECRET` | Yes | `AuthMiddleware` | Verifies bearer tokens and sets `req.userId`. |
| `AMAZON_S3_*` (`REGION`, `BUCKET_NAME`, `ACCESS_KEY`, `SECRET_KEY`) | Yes for export | `s3.uploader.js`, `amazon.service.js` | Shared creds for both S3 and SES clients. |
| `EMAIL_FROM`, `SYSTEM_SENDER_ID` | Yes | `SendExportEmail` | Used for SES envelope + mail persistence. |
| `BILIP_V2_ENABLED` | No effect yet | N/A | Present in `.env` but unused in code. |

Key dependencies (`package.json`):
- Runtime: `express@5`, `mongoose@8`, `cors`, `dotenv`, `jsonwebtoken`, `openai@6`, `@modelcontextprotocol/sdk`, AWS SDK v3 packages, `moment`, `joi` (currently unused), `nodemailer`.
- Dev: `nodemon` for `npm run dev` hot reload.
- Codebase uses CommonJS modules (`"type": "commonjs"`).

---

## 11. Observability, Logging & Failure Modes

- **ErrorLog model** – Every controller/service uses `ErrorLogModel.create(...)` in catch blocks with `path`, `function_name`, and serialized inputs. These entries are the only persistent audit of failures; set up a TTL or cleanup job if the collection grows too large.
- **Mail + Export history** – Successful email sends create a `mail` document and an `export_history` row. Even runtime failures log a `failed` export history entry for troubleshooting.
- **Console logging** – Minimal (server startup + Mongo connection messages). Business logic prefers DB logging instead of stdout.
- **Graceful shutdown** – `src/server.js` listens for `SIGTERM` and shuts down the HTTP server before exiting, but it does not close the Mongo connection explicitly.
- **Known gaps** – No centralized metrics, tracing, or request IDs. No retry logic around OpenAI, S3, or SES—single failure means the user gets a failure envelope.

---

## 12. Testing & Operational Playbooks

1. **Local setup**
   - `npm install`
   - Provide a running MongoDB with the expected collections (`students`, etc.). Ensure at least one `user` document exists so exports can resolve email addresses.
   - Set all required environment variables (`.env` sample is checked in for reference—never reuse those secrets in production).
   - `npm run dev` to boot the API with nodemon.

2. **Manual verifications**
   - Follow `BILIP_V3_EXPORT_TESTING_GUIDE.md` for exhaustive export scenarios (clarifications, delimiters, language toggles, large-but-manageable filters).
   - Use the same file for smoke testing `status: ready` create/modify flows and ensuring the transcript grows turn by turn.

3. **Observing data changes**
   - `dynamic_table` receives a new document for every successful create call.
   - `dynamic_row_table` is truncated + repopulated on every modify turn.
   - `session_chat` grows with every turn (including assistant summaries).
   - `export_history` + `mail` capture every export attempt.

4. **Rollback plan**
   - There is no code-level feature flag. To mitigate issues, redeploy a previous image or disable client entry-points. If a flag is required, add logic in `src/routes/bilip.routes.js` and/or `HandleChatTurn` to short-circuit `export_table` intents.

5. **Maintenance tips**
   - Catalog updates: edit `shared/catalog/schema.catalog.json`; MCP tools read it synchronously on every invocation, so changes are picked up at runtime.
   - AI tuning: update `src/ai/bilip_v2.system.prompt.js`. The service loads the prompt for each request so edits do not require a restart.
   - S3 bucket hygiene: exports expire after 72 hours, but the objects remain until the bucket lifecycle policy purges them. Configure lifecycle rules outside this repo.

With this document, every engineer should be able to trace a request end-to-end, understand the data mutations involved, and know exactly where to plug in additional logging, validation, or feature work without guessing. This is the canonical description of BILIP v3 inside the compose-table-service repo.
