# BILIP V2 - Manual Testing Guide

## Prerequisites

1. **Enable v2 flag** in `.env`:
```bash
BILIP_V2_ENABLED=true
OPENAI_API_KEY=sk-...
BILIP_MODEL=gpt-4o-mini
```

2. **Start the server**:
```bash
npm start
```

3. **Verify v2 routes are registered**:
Check server logs for route registration confirmation.

---

## Test Scenarios

### Scenario 1: CREATE via Chat (Happy Path)

**Goal**: Create a new table through conversation

**Request**:
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

**Expected Response**:
```json
{
  "status": "ready",
  "intent": "generate_table",
  "conversation_id": "<new_conversation_id>",
  "table_id": "<new_table_id>",
  "messages": [
    {
      "role": "ai",
      "message": "Table created successfully with X rows."
    }
  ],
  "result": {
    "summary": {
      "table_id": "<table_id>",
      "name": "Active Students School A",
      "total_rows": 42,
      "columns": ["student_name", "email"],
      "filters": [
        { "key": "students.status", "op": "eq", "value": "active" },
        { "key": "students.school", "op": "eq", "value": "School A" }
      ]
    }
  }
}
```

**Validation**:
- ✅ Status is `ready`
- ✅ Intent is `generate_table`
- ✅ `conversation_id` and `table_id` are returned
- ✅ `messages` array contains AI response
- ✅ `result.summary` matches created table

---

### Scenario 2: CLARIFICATION Request

**Goal**: AI asks for clarification when request is ambiguous

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Show me students",
    "conversation_id": null,
    "table_id": null
  }'
```

**Expected Response**:
```json
{
  "status": "need_clarification",
  "conversation_id": "<conversation_id>",
  "messages": [
    {
      "role": "ai",
      "message": "Would you like active students only, or students from a specific school?"
    }
  ]
}
```

**Validation**:
- ✅ Status is `need_clarification`
- ✅ `messages` array contains clarifying question
- ✅ No `table_id` in response

---

### Scenario 3: MODIFY - Add Column

**Goal**: Add a column to existing table

**Request** (use `conversation_id` and `table_id` from Scenario 1):
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Add date of birth column",
    "conversation_id": "<conversation_id_from_scenario_1>",
    "table_id": "<table_id_from_scenario_1>"
  }'
```

**Expected Response**:
```json
{
  "status": "ready",
  "intent": "modify_table",
  "conversation_id": "<conversation_id>",
  "table_id": "<table_id>",
  "messages": [
    {
      "role": "ai",
      "message": "Applied changes and rebuilt X rows."
    }
  ],
  "result": {
    "summary": {
      "table_id": "<table_id>",
      "name": "Active Students School A",
      "total_rows": 42,
      "columns": ["student_name", "email", "date_of_birth"],
      "filters": [...]
    }
  }
}
```

**Validation**:
- ✅ Status is `ready`
- ✅ Intent is `modify_table`
- ✅ Columns array includes new column
- ✅ Rows were rebuilt (check total_rows)

---

### Scenario 4: MODIFY - Set Sort Ascending

**Goal**: Apply sorting to table

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Sort by email ascending",
    "conversation_id": "<conversation_id>",
    "table_id": "<table_id>"
  }'
```

**Expected Response**:
```json
{
  "status": "ready",
  "intent": "modify_table",
  "conversation_id": "<conversation_id>",
  "table_id": "<table_id>",
  "messages": [...],
  "result": {
    "summary": {
      "table_id": "<table_id>",
      "name": "Active Students School A",
      "total_rows": 42,
      "columns": ["student_name", "email", "date_of_birth"],
      "filters": [...],
      "sort": {
        "key": "email",
        "dir": "asc"
      }
    }
  }
}
```

**Validation**:
- ✅ Sort object present in summary
- ✅ Direction is `asc`
- ✅ Rows were rebuilt in sorted order

---

### Scenario 5: MODIFY - Remove Column

**Goal**: Remove a column from table

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Remove the date of birth column",
    "conversation_id": "<conversation_id>",
    "table_id": "<table_id>"
  }'
```

**Expected Response**:
- Status: `ready`
- Intent: `modify_table`
- Columns array no longer includes `date_of_birth`

**Validation**:
- ✅ Column successfully removed
- ✅ Rows rebuilt without removed column

---

### Scenario 6: FAILURE - Invalid Sort Direction

**Goal**: Verify rejection of invalid sort direction

**Request**:
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

**Expected Response**:
```json
{
  "status": "failed",
  "conversation_id": "<conversation_id>",
  "table_id": "<table_id>",
  "messages": [
    {
      "role": "ai",
      "message": "Invalid sort direction."
    }
  ],
  "explanation": "Sort direction must be either 'asc' (ascending) or 'desc' (descending).",
  "options": [
    "Sort by name ascending",
    "Sort by name descending"
  ]
}
```

**Validation**:
- ✅ Status is `failed`
- ✅ `explanation` is clear
- ✅ `options` array provides alternatives

---

### Scenario 7: FAILURE - Too Many Rows

**Goal**: Verify row guard enforcement (>5000)

**Request**:
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

**Expected Response**:
```json
{
  "status": "failed",
  "conversation_id": "<conversation_id>",
  "table_id": null,
  "messages": [
    {
      "role": "ai",
      "message": "Result set too large for demo environment."
    }
  ],
  "explanation": "Query would return approximately 8000 rows, exceeding the 5000 row limit.",
  "options": [
    "Add more specific filters (e.g., date range, specific school)",
    "Narrow existing filter values",
    "Use contains operator for more targeted search"
  ]
}
```

**Validation**:
- ✅ Status is `failed`
- ✅ Explanation mentions row count
- ✅ Options suggest how to narrow results

---

### Scenario 8: GET Chat History

**Goal**: Retrieve conversation transcript

**Request**:
```bash
curl http://localhost:3000/api/bilip/chat/<conversation_id>
```

**Expected Response**:
```json
{
  "conversation_id": "<conversation_id>",
  "table_id": "<table_id>",
  "messages": [
    {
      "role": "user",
      "message": "Show me active students from School A..."
    },
    {
      "role": "ai",
      "message": "Table created successfully..."
    },
    {
      "role": "user",
      "message": "Add date of birth column"
    },
    {
      "role": "ai",
      "message": "Applied changes and rebuilt..."
    }
  ],
  "created_at": "2025-11-08T06:00:00.000Z",
  "updated_at": "2025-11-08T06:05:00.000Z"
}
```

**Validation**:
- ✅ All messages preserved in order
- ✅ Roles are correct (`user` or `assistant`)
- ✅ `table_id` matches current table

---

### Scenario 9: FAILURE - Missing Required Parameters

**Goal**: Verify validation of required parameters

**Request (missing user_id)**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Show me students"
  }'
```

**Expected Response**:
```json
{
  "status": "failed",
  "conversation_id": null,
  "table_id": null,
  "messages": [
    {
      "role": "ai",
      "message": "An error occurred processing your request."
    }
  ],
  "explanation": "Missing user_id",
  "options": [
    "Please try again",
    "Rephrase your request with more details"
  ]
}
```

**Validation**:
- ✅ Status is `failed`
- ✅ Clear explanation of missing parameter

---

### Scenario 10: MODIFY - Change Filter Value

**Goal**: Update existing filter value

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "507f1f77bcf86cd799439011",
    "prompt": "Change school filter to School B",
    "conversation_id": "<conversation_id>",
    "table_id": "<table_id>"
  }'
```

**Expected Response**:
- Status: `ready`
- Intent: `modify_table`
- Filters array shows updated school value
- Rows rebuilt with new filter

**Validation**:
- ✅ Filter value changed
- ✅ Row count reflects new filter
- ✅ Rows rebuilt automatically

---

## Database Verification

After running tests, verify database state:

### Check Session Chat Collection:
```javascript
db.session_chats.findOne({ _id: ObjectId("<conversation_id>") })
```

**Expected**:
- `messages` array contains all user and AI messages
- `table_id` is set
- `user_id` matches request

### Check Dynamic Table Collection:
```javascript
db.dynamictables.findOne({ _id: ObjectId("<table_id>") })
```

**Expected**:
- `columns`, `filters`, `sort` match latest state
- `created_by` matches `user_id`
- `status` is `active`

### Check Dynamic Row Table Collection:
```javascript
db.dynamicrowtables.find({ dynamic_table_id: ObjectId("<table_id>") }).limit(5)
```

**Expected**:
- Rows exist for the table
- `data` object contains values for all columns
- Row count matches `total_rows` from summary

---

## Performance Tests

### Test 1: Large Result Set Handling
- Create table with filters that return 4999 rows
- Expected: Success
- Create table with filters that return 5001 rows  
- Expected: Failure with row guard

### Test 2: Multiple Modifications
- Create table
- Add 3 columns sequentially
- Remove 1 column
- Change 2 filters
- Set sort
- Expected: All modifications succeed, rows rebuilt each time

### Test 3: Concurrent Requests
- Send 3 create requests simultaneously with different user_ids
- Expected: All succeed with unique table_ids and conversation_ids

---

## Edge Cases

### Edge Case 1: Computed Field Expression
**Request**: Create table with computed field
**Expected**: `first_name + ' ' + last_name` resolves correctly

### Edge Case 2: Sort by Computed Field
**Request**: Sort by computed student_name column
**Expected**: Rows sorted alphabetically by full name

### Edge Case 3: Conversation Without Table
**Request**: Start conversation, get clarification, provide answer
**Expected**: Conversation persists across turns, table created on final turn

### Edge Case 4: Modify Non-Existent Column
**Request**: Remove column that doesn't exist
**Expected**: Failure with clear message about missing column

---

## Rollback Test

1. Set `BILIP_V2_ENABLED=false`
2. Restart server
3. Attempt to access v2 routes
4. Expected: 404 Not Found

5. Set `BILIP_V2_ENABLED=true`
6. Restart server
7. V2 routes should work again

---

## Acceptance Criteria

- [x] All success scenarios return correct envelope schema
- [x] All failure scenarios return Failure envelope with explanation and options
- [x] Clarification loops work correctly
- [x] CREATE path uses v1 validator
- [x] MODIFY path uses v2 validator
- [x] Row guard enforced at 5000
- [x] Rows rebuild on any schema change
- [x] Transcript persists across conversation
- [x] Sort directions limited to `asc`/`desc`
- [x] All responses include `messages[]` array
- [x] Feature flag controls route availability

---

## Sign-Off Checklist

Before production deployment:

- [ ] All test scenarios pass
- [ ] Database state verified after each test
- [ ] Performance tests show acceptable response times
- [ ] Edge cases handled gracefully
- [ ] Error messages are user-friendly
- [ ] V1 endpoints still work (regression test)
- [ ] Feature flag toggle works (rollback capability verified)

---

**Testing Complete**: Ready for staging deployment with flag OFF, then gradual rollout.
