# Compose Table Service – v1 (Students Only)

## Overview

The **Compose Table Service** is an AI-driven backend service that enables users to generate dynamic tables from natural language requests. Version 1 (v1) is scoped exclusively to the **students** entity, allowing users to create custom filtered views of student data without writing queries manually.

The service uses:
- **OpenAI GPT** for natural language understanding and contract generation
- **MCP (Model Context Protocol)** for AI agent tool access (metadata-only, in-process)
- **MongoDB** for data storage (students, dynamic tables, and row data)
- **Express.js** for RESTful API endpoints

## Architecture

### High-Level Flow

1. **User Request**: User sends natural language request to `/api/bilip/compose`
2. **MCP Initialization**: System creates in-process MCP server and client
3. **AI Agent Orchestration**: OpenAI GPT uses MCP tools to introspect catalog and build contract
4. **Contract Validation**: Backend validates AI-generated contract against business rules
5. **Query Execution**: System builds MongoDB filter and queries students collection
6. **Row Transformation**: Student documents are transformed into table rows
7. **Persistence**: Dynamic table definition and rows are saved to database
8. **Response**: API returns table metadata and row count

### Component Architecture

```
┌─────────────────┐
│   User Request  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  POST /api/bilip/compose    │
│  (compose.controller.js)    │
└────────┬────────────────────┘
         │
         ├──► MCP Server (mcp.server.js)
         │    └─ db_introspect_students()
         │    └─ db_search_fields()
         │    └─ ai_commit_plan()
         │
         ├──► MCP Client (mcp.client.js)
         │    └─ callTool()
         │    └─ getLastContract()
         │
         ├──► OpenAI API
         │    └─ Chat Completions with Function Calling
         │
         ├──► Contract Validator (contract.validator.js)
         │    └─ ValidateStudentsContract()
         │
         ├──► MongoDB Query
         │    └─ StudentModel.find()
         │
         └──► Database Persistence
              └─ DynamicTableModel.create()
              └─ DynamicRowTableModel.insertMany()
```

## API Endpoints

### 1. POST `/api/bilip/compose`

Generate a dynamic table from natural language request.

**Request Body:**
```json
{
  "user_id": "507f1f77bcf86cd799439011",
  "message": "Show me active students from School A who haven't submitted job descriptions"
}
```

**Response (200 OK):**
```json
{
  "table_id": "507f191e810c19729de860ea",
  "name": "Active Students Missing Job Desc",
  "description": "Students who are active and missing job descriptions",
  "total_rows": 42,
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
      "source": {
        "collection": "students",
        "field": "email"
      }
    }
  ],
  "filters": [
    {
      "key": "students.status",
      "op": "eq",
      "value": "active"
    },
    {
      "key": "students.school",
      "op": "eq",
      "value": "School A"
    }
  ]
}
```

**Error Response (500):**
```json
{
  "error": "Result too large for demo; please add more filters. Current result: 6234 rows."
}
```

### 2. GET `/api/ai-tables/:id`

Retrieve a previously generated table with preview rows.

**Response (200 OK):**
```json
{
  "table": {
    "id": "507f191e810c19729de860ea",
    "name": "Active Students Missing Job Desc",
    "description": "Students who are active and missing job descriptions",
    "columns": [...],
    "filters": [...],
    "status": "active",
    "created_at": "2025-11-08T00:00:00.000Z"
  },
  "rows": [
    {
      "id": "507f191e810c19729de860eb",
      "data": {
        "student_name": "John DOE",
        "email": "john.doe@example.com"
      },
      "created_at": "2025-11-08T00:00:00.000Z"
    }
  ],
  "total_rows_preview": 42
}
```

## Contract Schema

The AI agent must commit a contract with this exact structure:

```json
{
  "status": "ready",
  "intent": "generate_table",
  "table_name": "Active Students Missing Job Desc",
  "description": "Students who are active and missing job descriptions",
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
    }
  ],
  "filters": [
    {
      "key": "students.status",
      "op": "eq",
      "value": "active"
    }
  ]
}
```

## Validation Rules

The backend enforces the following validation rules:

### Contract-Level
- `status` must be `"ready"`
- `intent` must be `"generate_table"`
- `base_entity` must be `"students"` (v1 scope)

### Table Name
- Maximum 60 characters
- Only alphanumeric characters, spaces, dashes, and underscores: `[A-Za-z0-9 _-]`
- Must be unique per user (per `created_by`)

### Columns
- At least one column required
- Each column must have: `label`, `key`, `data_type`, `source`
- `data_type` must be one of: `string`, `number`, `boolean`, `date`
- `source.collection` must be `"students"`
- `source.field` must either:
  - Exist in catalog as a direct field, OR
  - Be a computed expression: `field1 + ' ' + field2` (both fields must exist and be strings)
- All column `key` values must be unique

### Filters
- **At least one filter is REQUIRED**
- Each filter must have: `key`, `op`, `value`
- `key` must start with `"students."` and reference an existing catalog field
- `op` must be one of: `eq`, `ne`, `in`, `contains`, `gte`, `lte`
- `value` type must match the catalog field type
- Special case: `in` operator requires array value

### Row Limits
- Maximum 5000 rows returned
- If query exceeds 5000, request is rejected with error message

## MCP Tools (Metadata-Only)

### 1. `db_introspect_students()`

Returns metadata about the students entity.

**Parameters:** None

**Returns:**
```json
{
  "base_entity": "students",
  "fields": [
    {
      "key": "first_name",
      "label": "first_name",
      "data_type": "string"
    },
    {
      "key": "email",
      "label": "email",
      "data_type": "string"
    }
  ]
}
```

### 2. `db_search_fields({ query: "email" })`

Search for fields matching a keyword.

**Parameters:**
- `query` (string, required): Search term

**Returns:**
```json
{
  "query": "email",
  "matches": [
    {
      "key": "email",
      "label": "email",
      "data_type": "string"
    },
    {
      "key": "professional_email",
      "label": "professional_email",
      "data_type": "string"
    }
  ]
}
```

### 3. `ai_commit_plan({ contract: {...} })`

Commit the final contract when AI is confident.

**Parameters:**
- `contract` (object, required): Complete contract object

**Returns:**
```json
{
  "success": true,
  "message": "Contract committed to context"
}
```

## File Structure

```
/src
  /ai
    bilip.system.prompt.js       # System prompt for OpenAI GPT agent
  /config
    database.js                  # MongoDB connection configuration
  /controllers
    compose.controller.js        # Main orchestration logic
  /mcp
    mcp.server.js                # In-process MCP server with metadata tools
    mcp.client.js                # MCP client for tool invocation
  /models
    dynamic_table.model.js       # Table definition schema
    dynamic_row_table.model.js   # Row data schema
    error_log.model.js           # Error logging schema
    student.model.js             # Student entity schema
  /routes
    bilip.routes.js              # API route definitions
  /shared
    /catalog
      schema.catalog.json        # Single source of truth for entity fields
  /validators
    contract.validator.js        # Contract validation logic
  app.js                         # Express application setup
  server.js                      # Server entry point
```

## Environment Variables

Required environment variables:

```bash
# MongoDB
MONGODB_URI=mongodb://localhost:27017/compose_table_db

# OpenAI
OPENAI_API_KEY=sk-...

# Model Selection (optional, defaults to gpt-4o-mini)
BILIP_MODEL=gpt-4o-mini
```

## Code Conventions (WARP.md)

This project strictly follows the **Pendekar Backend Law** (WARP.md):

### File Structure Banners
- `// *************** IMPORT CORE ***************`
- `// *************** IMPORT LIBRARY ***************`
- `// *************** IMPORT MODULE ***************`
- `// *************** IMPORT HELPER FUNCTION ***************`
- `// *************** IMPORT VALIDATOR ***************`
- `// *************** HELPER FUNCTION ***************`
- `// *************** VALIDATOR ***************`
- `// *************** QUERY ***************`
- `// *************** MUTATION ***************`
- `// *************** EXPORT MODULE ***************`

### Inline Comments
Every logical block inside functions uses:
```javascript
// *************** Explain what or why this block does
```

### Function Flow
All functions follow: **Validation → Query → Transformation → Output**

### Naming Conventions
- Functions: `PascalCase` (e.g., `ValidateStudentsContract`)
- Variables: `camelCase` (e.g., `studentData`)
- Schema Fields: `snake_case` (e.g., `created_at`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `MAX_ROWS`)

### Error Handling
Every function has `try/catch`. On error:
1. Log to `ErrorLogModel` with path, parameters, function name, and stack trace
2. Throw `Error` with clear message

### No Nested Functions
All helper functions are top-level, never defined inside other functions.

### JSDoc Required
Every exported function has full JSDoc explaining purpose, rationale, params, returns, and errors.

## Database Models

### DynamicTable
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  status: 'active' | 'deleted',
  columns: [{
    label: String,
    key: String,
    data_type: 'string' | 'number' | 'boolean' | 'date',
    source: {
      collection: String,
      field: String
    }
  }],
  filters: [{
    key: String,
    op: String,
    value: Mixed
  }],
  filterable: Boolean,
  sortable: Boolean,
  created_by: ObjectId,
  created_at: Date,
  updated_at: Date
}
```

### DynamicRowTable
```javascript
{
  _id: ObjectId,
  dynamic_table_id: ObjectId,
  status: 'active' | 'deleted',
  data: {
    [column_key]: Mixed
  },
  created_at: Date,
  updated_at: Date
}
```

## Edge Cases Handled

### 1. Missing User ID or Message
**Error:** `"Missing user_id"` or `"Missing message"`

### 2. AI Agent Doesn't Commit Contract
**Error:** `"AI agent did not commit a contract. Please provide more details or clarify your request."`

### 3. No Filters Provided
**Error:** `"Please add at least one filter"`

### 4. Duplicate Table Name
**Error:** `"Table name already exists. Choose a different name."`

### 5. Result Set Too Large
**Error:** `"Result too large for demo; please add more filters. Current result: 6234 rows."`

### 6. Unknown Field in Contract
**Error:** `"Column 0 source.field xyz not found in catalog"`

### 7. Invalid Computed Expression
**Error:** `"Column 0 computed expression invalid: Field first_name must be string type for concatenation"`

### 8. Invalid Operator
**Error:** `"Filter 0 operator regex not allowed in v1"`

### 9. Type Mismatch
**Error:** `"Filter 1 value validation failed: Value must be number type"`

## Testing Manually

### Example Request 1: Basic Filter
```bash
curl -X POST http://localhost:3000/api/bilip/compose \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "message": "Show me all active students"
  }'
```

### Example Request 2: Multiple Filters with Computed Column
```bash
curl -X POST http://localhost:3000/api/bilip/compose \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "message": "List students from School A with status active, show their full name and email"
  }'
```

### Example Request 3: Retrieve Table
```bash
curl http://localhost:3000/api/ai-tables/507f191e810c19729de860ea
```

## Future Enhancements (v2+)

Potential future scope expansions:
- Support for additional entities (teachers, classes, schools)
- Join operations across multiple entities
- Aggregation functions (count, sum, average)
- Sorting and pagination
- Export to CSV/Excel
- Scheduled table regeneration
- Collaborative table sharing

## Development Notes

- **No Tests**: Per project requirements, no test files are included
- **No Optional Chaining**: All guards use explicit `if (!value)` checks
- **Explicit Error Logging**: Every error is logged to `ErrorLogModel` before rethrowing
- **Named Returns**: All functions return via named variables, not inline objects
- **Request-Scoped Context**: MCP client maintains separate context per request
- **Catalog as Source of Truth**: All field validation references `schema.catalog.json`

## Troubleshooting

### Issue: "OPENAI_API_KEY environment variable not configured"
**Solution:** Set the `OPENAI_API_KEY` in your `.env` file

### Issue: "Students entity not found in catalog"
**Solution:** Verify `src/shared/catalog/schema.catalog.json` contains students entity

### Issue: AI agent timeout or max iterations reached
**Solution:** Simplify the user message or add more specific details

### Issue: MongoDB connection error
**Solution:** Verify `MONGODB_URI` is correct and MongoDB server is running

## License

Internal project. All rights reserved.

## Contributors

- Backend Team following Pendekar Backend Law (WARP.md)
- AI Implementation: GPT-driven contract generation
- Architecture: Microservice pattern with in-process MCP

---

**Version:** 1.0.0  
**Last Updated:** 2025-11-08  
**Status:** Production Ready (Students-Only Scope)
