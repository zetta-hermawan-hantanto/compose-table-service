# BILIP v3 Export Testing Guide

## Overview
This document outlines comprehensive testing scenarios for BILIP v3 Export-from-Chat functionality. All tests should be executed against the `/api/bilip/chat` endpoint with BILIP_V2_ENABLED=true.

---

## Prerequisites

### Environment Variables
```bash
BILIP_V2_ENABLED=true
OPENAI_API_KEY=sk-...
BILIP_MODEL=gpt-4o-mini
AMAZON_S3_BUCKET_NAME=your-bucket
AMAZON_S3_ACCESS_KEY=...
AMAZON_S3_SECRET_KEY=...
AMAZON_S3_REGION=us-east-1
```

### Test User Setup
Create a test user in the database with valid email address for receiving export emails:
```javascript
{
  "_id": ObjectId("..."),
  "email": "test@example.com",
  "first_name": "Test",
  "last_name": "User",
  "civility": "MR"
}
```

### Sample Students Data
Ensure test database has students with various statuses for filtering:
- At least 10 students with `status: "active"`
- At least 5 students with `status: "pending"`
- Students with complete profile data (first_name, last_name, email, etc.)

---

## Test Scenarios

### Test 1: Happy Path - Export with All Parameters

**Description**: Export active students with specified columns, filters, and delimiter.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export first_name, last_name, and email for active students with semicolon delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Response**:
```json
{
  "status": "ready",
  "intent": "export_table",
  "conversation_id": "...",
  "messages": [
    {
      "role": "assistant",
      "message": "Done. I've sent the file to your email."
    }
  ],
  "result": {
    "summary": "Exported N rows"
  }
}
```

**Validation Steps**:
1. ✅ Response status is `ready`
2. ✅ Intent is `export_table`
3. ✅ Message does NOT contain download URL
4. ✅ Email arrives at test user's inbox within 1 minute
5. ✅ Email contains presigned S3 URL
6. ✅ Download CSV from email link
7. ✅ CSV has semicolon delimiter
8. ✅ CSV header matches: `first_name;last_name;email`
9. ✅ All rows have `status=active` (verify against DB)
10. ✅ ExportHistory record created with status=success

**Database Verification**:
```javascript
db.export_histories.findOne({ user_id: ObjectId("...") }).sort({ created_at: -1 })
// Should have:
// - status: "success"
// - columns: ["first_name", "last_name", "email"]
// - delimiter: "semicolon"
// - row_count: N (matches CSV)
// - file_key: "table-export-students-YYYYMMDD-HHmmss.csv"
```

---

### Test 2: Export-Only (No Prior Table)

**Description**: Export without creating or modifying any DynamicTable. This tests ad-hoc export flow.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export email and status for all students with comma delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Behavior**:
- No writes to `dynamic_tables` collection
- No writes to `dynamic_row_tables` collection
- Direct query to `students` collection
- CSV generated and uploaded to S3
- Email sent successfully

**Validation Steps**:
1. ✅ Count DynamicTable records before and after (should be same)
2. ✅ Count DynamicRowTable records before and after (should be same)
3. ✅ Export completes successfully
4. ✅ CSV downloaded from email link
5. ✅ CSV has comma delimiter

---

### Test 3: Export with French Language

**Description**: Test localized success message in French.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "exporter first_name, last_name, email pour les étudiants actifs avec virgule",
    "lang": "fr",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Response**:
```json
{
  "status": "ready",
  "intent": "export_table",
  "messages": [
    {
      "role": "assistant",
      "message": "C'est fait. J'ai envoyé le fichier à votre e-mail."
    }
  ]
}
```

**Validation Steps**:
1. ✅ Success message in French
2. ✅ Email template uses French version
3. ✅ ExportHistory has `lang: "fr"`

---

### Test 4: Unknown Columns - Clarification

**Description**: AI should ask for clarification when columns don't exist in catalog.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export full_name and phone for active students comma delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Response**:
```json
{
  "status": "need_clarification",
  "conversation_id": "...",
  "messages": [
    {
      "role": "assistant",
      "message": "I can't find these columns: full_name, phone. Valid options include: first_name, last_name, tele_phone, email, status. Which would you like?"
    }
  ]
}
```

**Validation Steps**:
1. ✅ Status is `need_clarification`
2. ✅ Message lists unknown columns
3. ✅ Message suggests valid alternatives
4. ✅ No ExportHistory record created

---

### Test 5: Invalid Delimiter - Clarification

**Description**: AI should ask user to choose valid delimiter when invalid one provided.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export first_name, last_name with pipe delimiter for active students",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Response**:
```json
{
  "status": "need_clarification",
  "messages": [
    {
      "role": "assistant",
      "message": "I only support comma, semicolon, or tab. Which one should I use?"
    }
  ]
}
```

**Validation Steps**:
1. ✅ Status is `need_clarification`
2. ✅ Message lists three valid delimiters
3. ✅ No export attempted

---

### Test 6: Missing Columns - Clarification

**Description**: When columns are not specified, AI should ask which columns to export.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export students with status active",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Response**:
```json
{
  "status": "need_clarification",
  "messages": [
    {
      "role": "assistant",
      "message": "Which columns do you want to export? For example: first_name, last_name, email."
    }
  ]
}
```

**Validation Steps**:
1. ✅ Status is `need_clarification`
2. ✅ Message asks for columns with examples

---

### Test 7: Zero Rows Export

**Description**: Export with filters that match zero students.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export first_name, last_name, email for students with status invalid_status comma delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Expected Behavior**:
- Export completes successfully
- CSV contains header row only
- Email sent with valid link
- ExportHistory shows row_count: 0

**Validation Steps**:
1. ✅ Export succeeds with status `ready`
2. ✅ CSV downloaded has only header row
3. ✅ ExportHistory has `row_count: 0`
4. ✅ Email delivered successfully

---

### Test 8: Tab Delimiter

**Description**: Test tab delimiter export.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export first_name, last_name, email for active students with tab delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Validation Steps**:
1. ✅ Download CSV from email
2. ✅ Open in text editor and verify tabs (not spaces)
3. ✅ Cells are separated by `\t` character
4. ✅ ExportHistory has `delimiter: "tab"`

---

### Test 9: CSV Injection Safety

**Description**: Test that CSV injection protection works for dangerous characters.

**Setup**: Insert a test student with:
```javascript
{
  "first_name": "=SUM(A1:A10)",
  "last_name": "@IMPORTXML",
  "email": "+cmd|'/c calc'!A1"
}
```

**Request**: Export this student's data

**Validation Steps**:
1. ✅ Download CSV
2. ✅ Dangerous cells are prefixed with single quote `'`
3. ✅ Excel/LibreOffice does not execute formulas
4. ✅ Example: `'=SUM(A1:A10)` not `=SUM(A1:A10)`

---

### Test 10: Date Formatting

**Description**: Test moment UTC ISO formatting for dates.

**Setup**: Ensure students have `createdAt` and `updatedAt` values

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export first_name, email, createdAt for active students comma delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Validation Steps**:
1. ✅ Download CSV
2. ✅ Date values in ISO 8601 format: `2025-11-09T12:34:56.789Z`
3. ✅ Timezone is UTC (ends with Z)

---

### Test 11: Null Value Handling

**Description**: Test that null/undefined fields export as empty strings.

**Setup**: Student with missing optional fields (e.g., no `professional_email`)

**Request**: Export including `professional_email` column

**Validation Steps**:
1. ✅ Download CSV
2. ✅ Empty fields render as `""` (empty cell)
3. ✅ No literal `null` or `undefined` text

---

### Test 12: Large Dataset Streaming

**Description**: Test memory efficiency with large result set (but under 5000 rows).

**Setup**: Ensure database has ~1000+ students

**Request**: Export all students without restrictive filters

**Validation Steps**:
1. ✅ Export completes without memory errors
2. ✅ CSV contains all expected rows
3. ✅ Monitor server memory during export (should stay reasonable)

---

### Test 13: Runtime Failure - S3 Error (Simulated)

**Description**: Simulate S3 upload failure to test error handling.

**Setup**: Temporarily set invalid S3 credentials or bucket name

**Expected Response**:
```json
{
  "status": "failed",
  "messages": [
    {
      "role": "assistant",
      "message": "Sorry, I couldn't generate the file this time. Please try again in a moment."
    }
  ],
  "explanation": "Sorry, I couldn't generate the file this time. Please try again in a moment.",
  "options": ["Try again in a moment"]
}
```

**Validation Steps**:
1. ✅ Status is `failed`
2. ✅ Human-readable error message (no technical details)
3. ✅ ExportHistory record with status=failed
4. ✅ error_message field populated
5. ✅ ErrorLogModel has entry for this failure

---

### Test 14: Multiple Filters

**Description**: Export with multiple filter conditions.

**Request**:
```bash
curl -X POST http://localhost:3000/api/bilip/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "export first_name, last_name, email, status for students where status is active and sex is M with comma delimiter",
    "lang": "en",
    "user_id": "USER_OBJECT_ID"
  }'
```

**Validation Steps**:
1. ✅ Export succeeds
2. ✅ All rows match both filters (status=active AND sex=M)
3. ✅ ExportHistory has multiple filter objects

---

### Test 15: Quote Escaping

**Description**: Test proper quote escaping in CSV.

**Setup**: Insert student with name: `O"Connor`

**Request**: Export students including this name

**Validation Steps**:
1. ✅ Download CSV
2. ✅ Quote is doubled: `"O""Connor"`
3. ✅ Cell properly quoted when opened in Excel

---

## Acceptance Criteria Checklist

- [ ] Test 1: Happy path completes successfully
- [ ] Test 2: Export-only flow works without table writes
- [ ] Test 3: French language support working
- [ ] Test 4: Unknown columns trigger clarification
- [ ] Test 5: Invalid delimiter triggers clarification
- [ ] Test 6: Missing columns trigger clarification
- [ ] Test 7: Zero rows export completes
- [ ] Test 8: Tab delimiter works correctly
- [ ] Test 9: CSV injection safety active
- [ ] Test 10: Date formatting correct (ISO UTC)
- [ ] Test 11: Null values export as empty strings
- [ ] Test 12: Large datasets complete without OOM
- [ ] Test 13: Runtime failures handled gracefully
- [ ] Test 14: Multiple filters work correctly
- [ ] Test 15: Quote escaping works

---

## Rollback Testing

### Test 16: Feature Flag Disabled

**Setup**: Set `BILIP_V2_ENABLED=false`

**Request**: Send export prompt to `/api/bilip/chat`

**Expected**: Route should not exist (404)

---

## Performance Benchmarks

| Scenario | Rows | Expected Time | Memory Usage |
|----------|------|---------------|--------------|
| Small export | <100 | <2s | <50MB |
| Medium export | 500-1000 | <5s | <100MB |
| Large export | 2000-5000 | <15s | <200MB |

---

## Error Log Inspection

After each test, verify ErrorLogModel for:
- Safe parameter logging (no CSV content)
- Proper function_name attribution
- Complete stack traces for failures

```javascript
db.error_logs.find({ name_function: "ProcessExportTurn" }).sort({ created_at: -1 }).limit(5)
```

---

## Sign-Off

✅ **All 15 core tests passed**  
✅ **No regressions in v1 or v2 create/modify flows**  
✅ **Performance within acceptable limits**  
✅ **Error handling meets human-readable standards**  

**Tested by**: _____________________  
**Date**: _____________________  
**Environment**: Staging / Production  
**BILIP Version**: v3 (Export)
