# BILIP V2 - Implementation Guide (Graceful Upgrade)

## Status: IN PROGRESS

### ✅ Completed Phases

1. **Phase I** - Model Update
   - ✅ Added optional `sort: { key: String, dir: String enum:['asc','desc'] }` to `dynamic_table.model.js`

2. **Phase H** - System Prompt
   - ✅ Created `src/ai/bilip_v2.system.prompt.js` with strict envelope schemas
   - ✅ Supports CREATE and MODIFY intents
   - ✅ Enforces Clarification, Failure, Success envelopes

3. **Phase E** - MCP Extension
   - ✅ Extended `src/mcp/mcp.server.js` with `tables_get_schema({ table_id })` tool
   - ✅ Returns `{ table_id, name, columns[], filters[], sort? }` metadata only

### 🔨 Remaining Phases (Priority Order)

---

## Phase A: Feature Flag & Routes

### A1: Environment Flag Check

**File**: `src/utils/feature.flags.js` (NEW)

```javascript
// *************** IMPORT CORE ***************
// *************** Why centralized feature flag management for v2 rollout
// *************** Enables gradual deployment and A/B testing without code changes

function IsBilipV2Enabled() {
  // *************** Read environment variable with default false
  const flagValue = process.env.BILIP_V2_ENABLED;

  if (!flagValue) {
    return false;
  }

  // *************** Parse boolean from string
  const isEnabled = flagValue.toLowerCase() === 'true' || flagValue === '1';

  return isEnabled;
}

module.exports = { IsBilipV2Enabled };
```

### A2: Conditional Route Registration

**File**: `src/routes/bilip.routes.js` (MODIFY - ADD TO BOTTOM)

```javascript
// *************** IMPORT UTILITIES ***************
const { IsBilipV2Enabled } = require('../utils/feature.flags');

// *************** Register v2 routes conditionally
if (IsBilipV2Enabled()) {
  const { HandleChatTurn, GetChatHistory } = require('../controllers/chat.controller');
  
  router.post('/bilip/chat', HandleChatTurn);
  router.get('/bilip/chat/:conversation_id', GetChatHistory);
}
```

**CRITICAL**: Keep v1 routes unchanged. Add v2 routes AFTER existing routes.

---

## Phase C2: Modify Validator

**File**: `src/validators/modify.validator.js` (NEW)

**Purpose**: Validate modify intent contracts from AI agent

**Key Functions**:
- `ValidateModifyContract(changes, existingTable, catalog)`
- Check `sort.dir` in `{asc, desc}`
- Validate `sort.key` exists in catalog or is existing column source
- Validate `add_columns` keys don't conflict
- Validate `remove_columns` exist in current table
- Return normalized changes object

**Pattern**: Follow WARP validation flow; explicit guards; log errors to `ErrorLogModel`

---

## Phase D: Utilities

### D1: Query Builders

**File**: `src/utils/query.builders.js` (NEW)

**Functions**:
1. `BuildMongoFilter(filters)` - Reuse v1 logic from compose.controller.js
2. `BuildProjection(columns)` - Map columns to `{ field1: 1, field2: 1 }`
3. `BuildSort(sortConfig)` - Map `{ key, dir }` to `{ field: 1 | -1 }`

### D2: Row Estimator

**File**: `src/utils/row.estimator.js` (NEW)

```javascript
async function EstimateRowCount(filters, StudentModel) {
  // *************** Build mongo filter
  const BuildMongoFilter = require('./query.builders').BuildMongoFilter;
  const mongoFilter = BuildMongoFilter(filters);

  // *************** Count documents
  const count = await StudentModel.countDocuments(mongoFilter);

  return count;
}
```

### D3: AI Reasoner

**File**: `src/utils/ai.reasoner.js` (NEW)

**Function**: `CallAIWithEnvelope({ messages, mcpClient, systemPrompt })`

**Responsibilities**:
- Configure OpenAI with v2 system prompt
- Provide MCP tools via function calling
- Handle tool call loop (max 10 iterations)
- Return parsed envelope object
- Validate envelope schema before returning

**Pattern**: Similar to v1 compose.controller.js OpenAI flow

---

## Phase B: Controllers & Services

###  B1: Chat Controller

**File**: `src/controllers/chat.controller.js` (NEW)

**Functions**:
1. `HandleChatTurn(req, res)`
2. `GetChatHistory(req, res)`

**HandleChatTurn Flow** (WARP: Validation → Query → Transformation → Output):

```javascript
async function HandleChatTurn(req, res) {
  try {
    // *************** Validate required fields
    if (!req || !req.body) {
      throw new Error('Request body is required');
    }

    if (!req.body.prompt) {
      throw new Error('Missing prompt');
    }

    if (!req.body.user_id) {
      throw new Error('Missing user_id');
    }

    const { prompt, conversation_id, table_id, user_id } = req.body;

    // *************** Load or create session
    let session;
    if (conversation_id) {
      session = await SessionChatModel.findById(conversation_id);
      if (!session) {
        throw new Error('Conversation not found');
      }
    } else {
      session = await SessionChatModel.create({
        user_id: user_id,
        table_id: table_id || null,
        messages: [],
      });
    }

    // *************** Append user message to session
    session.messages.push({
      sender: 'user',
      content: prompt,
    });
    await session.save();

    // *************** Call ChatService to process turn
    const { ProcessChatTurn } = require('../services/chat.service');
    const serviceResult = await ProcessChatTurn({
      prompt: prompt,
      session: session,
      user_id: user_id,
    });

    // *************** Append AI message to session
    const aiMessage = serviceResult.messages[serviceResult.messages.length - 1];
    session.messages.push({
      role: 'assistant',
      content: aiMessage.message,
    });

    // *************** Update table_id if created
    if (serviceResult.table_id && !session.table_id) {
      session.table_id = serviceResult.table_id;
    }

    await session.save();

    // *************** Construct output envelope
    const outputEnvelope = {
      ...serviceResult,
      conversation_id: String(session._id),
    };

    return res.status(200).json(outputEnvelope);
  } catch (error) {
    // *************** Log error and return Failure envelope
    await ErrorLogModel.create({
      path: 'controllers/chat.controller.js',
      parameter_input: JSON.stringify({ body: req && req.body }),
      function_name: 'HandleChatTurn',
      error: String(error.stack),
    });

    // *************** Return Failure envelope
    const failureEnvelope = {
      status: 'failed',
      conversation_id: req.body.conversation_id || null,
      table_id: req.body.table_id || null,
      messages: [{ role: 'assistant', message: 'An error occurred processing your request.' }],
      explanation: error.message,
      options: ['Please try again', 'Rephrase your request'],
    };

    return res.status(500).json(failureEnvelope);
  }
}
```

### B2: Chat Service

**File**: `src/services/chat.service.js` (NEW)

**Main Function**: `ProcessChatTurn({ prompt, session, user_id })`

**Flow**:

1. **Load Context**:
   - If `session.table_id` exists → call MCP `tables_get_schema(table_id)`

2. **Call AI**:
   - Use `ai.reasoner.js` with v2 system prompt
   - Provide MCP tools: `db_introspect_students`, `db_search_fields`, `tables_get_schema`

3. **Branch by Status**:
   - `need_clarification` → Return Clarification envelope
   - `failed` → Return Failure envelope
   - `ready` → Proceed based on `intent`

4. **Handle generate_table** (CREATE):
   - Load catalog
   - Call `ValidateStudentsContract(envelope.contract, catalog, user_id)` (v1 validator)
   - Create `DynamicTable` (include `sort` if present)
   - Build query: filter + projection + sort
   - Query `StudentModel.find().select().sort().lean()`
   - Transform rows with `ResolveStudentValue` (reuse v1 helper)
   - Insert `DynamicRowTable` rows
   - Return Success — Create envelope

5. **Handle modify_table** (MODIFY):
   - Call `ValidateModifyContract(envelope.changes, existingTable, catalog)`
   - Load `DynamicTable` by `session.table_id`
   - Apply changes:
     - `add_columns` → append to `columns`
     - `remove_columns` → filter out from `columns`
     - `add_filters` → append to `filters`
     - `remove_filters` → filter out from `filters`
     - `update_filters` → replace matching filter
     - `sort` → set `table.sort`
     - `table_name` → set `table.name`
   - Save updated table
   - Call `RebuildTableRows(table)` (see Phase F)
   - Return Success — Modify envelope

6. **Error Handling**:
   - Catch all errors
   - Log to `ErrorLogModel`
   - Return Failure envelope with explanation and options

---

## Phase F: Row Rebuild Logic

**File**: Integrated into `chat.service.js`

**Function**: `RebuildTableRows(table)`

```javascript
async function RebuildTableRows(table) {
  // *************** Delete existing rows
  await DynamicRowTableModel.deleteMany({
    dynamic_table_id: table._id,
  });

  // *************** Build query components
  const mongoFilter = BuildMongoFilter(table.filters);
  const projection = BuildProjection(table.columns);
  const sortConfig = BuildSort(table.sort);

  // *************** Query students with filter projection and sort
  const studentDocs = await StudentModel
    .find(mongoFilter)
    .select(projection)
    .sort(sortConfig)
    .lean();

  // *************** Transform rows
  const rowsToInsert = studentDocs.map((doc) => {
    const rowData = {};
    for (const column of table.columns) {
      const value = ResolveStudentValue(doc, column);
      rowData[column.key] = value;
    }
    return {
      dynamic_table_id: table._id,
      data: rowData,
      status: 'active',
    };
  });

  // *************** Insert new rows
  if (rowsToInsert.length > 0) {
    await DynamicRowTableModel.insertMany(rowsToInsert);
  }

  return rowsToInsert.length;
}
```

**CRITICAL**: Rebuild triggers on ANY change to columns, filters, or sort.

---

## Phase G: Error Protocol (Already Integrated)

**Pattern**:
```javascript
try {
  // logic
} catch (error) {
  await ErrorLogModel.create({
    path: '<file_path>',
    parameter_input: JSON.stringify({ /* params */ }),
    function_name: '<function_name>',
    error: String(error.stack),
  });

  // Return Failure envelope
  return {
    status: 'failed',
    conversation_id: conversationId,
    table_id: tableId,
    messages: [{ role: 'assistant', message: 'Error occurred' }],
    explanation: error.message,
    options: ['Option 1', 'Option 2'],
  };
}
```

**Apply to**: All controllers and services

---

## Phase C1: Verification

**Action**: Verify `contract.validator.js` remains untouched.

**Command**:
```bash
git diff src/validators/contract.validator.js
```

Expected: No changes.

---

## Phase J: Manual Testing

### Test Scenarios

#### 1. CREATE via Chat (Happy Path)
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Show me active students from School A with their names and emails",
    "conversation_id": null,
    "table_id": null
  }'
```

**Expected**: Status `ready`, intent `generate_table`, returns `table_id`

#### 2. MODIFY - Add Column
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Add date of birth column",
    "conversation_id": "<conversation_id_from_step_1>",
    "table_id": "<table_id_from_step_1>"
  }'
```

**Expected**: Status `ready`, intent `modify_table`, rows rebuilt

#### 3. MODIFY - Set Sort
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Sort by email descending",
    "conversation_id": "<conversation_id>",
    "table_id": "<table_id>"
  }'
```

**Expected**: Status `ready`, `sort: { key: "email", dir: "desc" }`

#### 4. FAILURE - Invalid Sort Direction
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Sort by name backwards",
    "conversation_id": "<conversation_id>",
    "table_id": "<table_id>"
  }'
```

**Expected**: Status `failed`, explanation, options `["asc", "desc"]`

#### 5. FAILURE - Too Many Rows
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Show all students",
    "conversation_id": null,
    "table_id": null
  }'
```

**Expected**: Status `failed`, explanation about >5000 rows, options to add filters

#### 6. GET Chat History
```bash
curl http://localhost:3000/api/bilip/chat/<conversation_id>
```

**Expected**: Returns `{ conversation_id, messages[], table_id }`

---

## Environment Variables

Add to `.env`:

```bash
# BILIP v2 Feature Flag (default: false)
BILIP_V2_ENABLED=true

# Existing vars remain unchanged
OPENAI_API_KEY=sk-...
BILIP_MODEL=gpt-4o-mini
```

---

## Acceptance Checklist

- [ ] `BILIP_V2_ENABLED` flag defaults to false
- [ ] v1 routes (`/api/bilip/compose`, `/api/ai-tables/:id`) work unchanged
- [ ] v2 routes (`/api/bilip/chat`, `/api/bilip/chat/:conversation_id`) only active when flag is true
- [ ] Session creation on first turn; transcript persists
- [ ] CREATE uses v1 validator; requires ≥1 filter
- [ ] MODIFY validates sort dir (asc/desc)
- [ ] Row guard enforced (>5000 → Failure with options)
- [ ] Schema/filter/sort change triggers row rebuild
- [ ] All code follows WARP conventions
- [ ] Error protocol: log + Failure envelope with explanation/options
- [ ] All responses include `messages[]` array

---

## Rollout Strategy

1. **Deploy with flag OFF**
2. **Run manual tests in staging**
3. **Shadow 10% traffic** (`/compose` → `/chat` comparison)
4. **Enable flag in production** after sign-off
5. **Monitor error rates** and envelope quality
6. **Gradually increase** v2 adoption

---

## Code Review Checklist

- [ ] No changes to v1 files (verified with git diff)
- [ ] All new functions have JSDoc
- [ ] All functions follow Validation → Query → Transformation → Output
- [ ] No optional chaining; explicit guards everywhere
- [ ] Named return variables (no inline returns)
- [ ] Try/catch + ErrorLogModel logging in all controllers/services
- [ ] Envelopes match exact schemas from PRD
- [ ] Sort only allows `asc`/`desc`
- [ ] MCP tools are metadata-only

---

**Status**: Ready for implementation completion  
**Next Steps**: Implement Phases A, C2, D, B in order  
**Estimated Effort**: 8-12 hours for senior backend engineer

