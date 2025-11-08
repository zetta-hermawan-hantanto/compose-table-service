# PROJECT: AI-Composed Table (BILIP) – Version 1

## 1. Purpose
Enable Zetta-ERP users to create dynamic data tables via conversation with **BILIP**, the in-app AI assistant.  
In **v1**, BILIP can generate tables only from the **students** collection, using a schema catalog to determine allowed fields and filters.  
Goal: demonstrate an end-to-end reasoning chain  
→ user prompt → AI JSON contract → backend validation → DynamicTable + DynamicRowTable creation.

---

## 2. Core Flow
```
User Prompt → GPT (OpenAI)  
    ↓  
BILIP clarifies intent → calls MCP tools  
    ↓  
Returns strict JSON { status:"ready" } contract  
    ↓  
Backend validates against schema_catalog.json  
    ↓  
Backend creates DynamicTable + DynamicRowTable  
    ↓  
Response: table summary + confirmation
```

---

## 3. Entities & Schemas
| Entity | Description |
|---------|-------------|
| **StudentModel** | Base source collection |
| **DynamicTableModel** | Stores composed table definitions (columns, filters, metadata) |
| **DynamicRowTableModel** | Stores materialized row data for each dynamic table |
| **schema.catalog.json** | Defines allowed fields & data types for `students` |

Example catalog path: `/src/shared/catalog/schema.catalog.json`

---

## 4. System Responsibilities

### GPT / BILIP (AI Layer)
- Interpret natural language and identify intent (`generate_table`).
- Use MCP tools to introspect allowed fields.
- Ask clarifying questions until the contract can be finalized.
- Produce strict JSON (no prose) when ready.

### Backend (Orchestrator)
- Validate JSON contract against catalog.
- Ensure unique table name per user.
- Query `StudentModel` using filters.
- Create and populate `DynamicTable` + `DynamicRowTable`.
- Return summary to frontend.

---

## 5. User Interaction (Happy Path)

**Example**
```
User: create a table of students with first name, last name, and email
BILIP: only for active students or all?
User: active only
BILIP: okay, naming it StudentTable
→ builds JSON contract and commits
```

**Final GPT Output**
```json
{
  "status": "ready",
  "intent": "generate_table",
  "table_name": "StudentTable",
  "description": "Active students with basic info",
  "base_entity": "students",
  "columns": [
    {
      "label": "Student Name",
      "key": "student_name",
      "data_type": "string",
      "source": {
        "collection": "students",
        "field": "first_name + ' ' + last_name"
      }
    },
    {
      "label": "Email",
      "key": "email",
      "data_type": "string",
      "source": { "collection": "students", "field": "email" }
    }
  ],
  "filters": [{ "key": "students.status", "op": "eq", "value": "active" }]
}
```

---

## 6. Clarification & Error Handling

| Situation | Expected BILIP / Backend Behavior |
|------------|-----------------------------------|
| Missing filter | Ask user “all students or specific condition?” |
| Too broad dataset | Require at least one filter |
| Ambiguous field name | Call `db.search_fields()` to suggest options |
| Unknown field | Suggest valid fields from catalog |
| Invalid operator | Ask which date/field applies |
| Duplicate table name | Return conflict → ask for new name |
| Too many rows (>5000) | Reject and request narrower filters |
| Incomplete context | Return `{ status:'need_clarification' }` |

---

## 7. Validation Rules (Backend)
- `status` == `ready`
- `intent` == `generate_table`
- `base_entity` == `students`
- **Name:** ≤ 60 chars, `[A-Za-z0-9 _-]`, unique per user  
- **Columns:** unique keys, valid data types (`string|number|boolean|date`), field exists in catalog, computed allowed if all base fields valid  
- **Filters:** field exists, operator in `[eq,in,contains,gte,lte,ne]`, value type matches field  
- Must have ≥ 1 filter; rows ≤ 5000.

---

## 8. Backend Process
1. Receive GPT contract (via MCP commit).  
2. Validate via `ValidateStudentsContract`.  
3. Check name uniqueness.  
4. Insert `DynamicTable`.  
5. Query `StudentModel` with filters.  
6. Build row objects for all columns.  
7. Insert rows into `DynamicRowTable`.  
8. Return summary:
```json
{
  "table_id": "...",
  "name": "StudentTable",
  "total_rows": 128,
  "columns": ["student_name","email"],
  "filters": [{"key":"status","value":"active"}]
}
```

---

## 9. MCP Tools
| Tool | Purpose |
|-------|----------|
| `db.introspect_students()` | Return allowed schema fields |
| `db.search_fields({query})` | Resolve ambiguous field names |
| `ai.commit_plan({contract})` | Commit final validated JSON contract |

> All MCP tools are **metadata-only**.  
> They never query real data; they describe what’s allowed.

---

## 10. AI Output Rules
- Respond in **pure JSON** when ready.
- If clarification needed → `status:"need_clarification"` with `question` field.
- Never mix natural text and JSON in same message.

---

## 11. Implementation Notes (Backend v1)
Follow the **Pendekar Backend Law / WARP.md**:
- Section banners: `// *************** WHY`
- Function flow: Validation → Query → Transformation → Output.
- Descriptive variable names.
- Explicit guards (`&&`), no optional chaining.
- All functions have complete JSDoc.
- Catch: log to `ErrorLogModel` → rethrow `ApolloError`.
- No nested functions; helpers are top-level.

### Key Files
```
/src/mcp/mcp.server.js
/src/mcp/mcp.client.js
/src/ai/bilip.system.prompt.js
/src/validators/contract.validator.js
/src/controllers/compose.controller.js
/src/routes/bilip.routes.js
/src/shared/catalog/schema.catalog.json
```

### Required ENV
```
OPENAI_API_KEY=<key>
BILIP_MODEL=gpt-5-mini-2025-08-07
```

---

## 12. Future Extensions (v2+)
- Multi-collection table generation.
- Export as CSV/XLSX.
- Modify schema (add/remove columns).
- Context memory for ongoing chat.
- Cached large dataset support.

---

## 13. Acceptance Criteria
- BILIP guides user to valid JSON contract autonomously.
- Backend validates, persists, and populates tables correctly.
- Invalid input yields clear, friendly errors.
- Responses always follow contract rules.
- Code follows `WARP.md` and project structure.

---

**End of PROJECT.md**
