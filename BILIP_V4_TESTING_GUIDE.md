# BILIP v4 Testing Guide

## Overview

This document provides comprehensive testing scenarios for BILIP v4 (joined entities). All tests should pass to ensure backward compatibility (v3) and new v4 join capabilities work correctly.

---

## Test Environment Setup

### Prerequisites
1. MongoDB with test data:
   - Students collection (with rncp_title, school, current_class refs)
   - RNCP Titles collection
   - Schools collection (with school_address subdocs)
   - Classes collection

2. API server running
3. Valid auth token for testing
4. Test user ID for ownership checks

### Test Data Requirements

**Minimum test data needed:**
- 50+ students (active/inactive mix)
- 5+ schools (with addresses, some in Paris, Lyon, etc.)
- 5+ RNCP titles (levels 5, 6, 7)
- 5+ classes (active/inactive)
- Students properly linked to school/rncp_title/class

---

## Testing Categories

1. [Backward Compatibility (v3)](#1-backward-compatibility-v3)
2. [Single Join Tests (v4)](#2-single-join-tests-v4)
3. [Multiple Joins Tests (v4)](#3-multiple-joins-tests-v4)
4. [Join Limit Enforcement](#4-join-limit-enforcement)
5. [Row Cap Enforcement](#5-row-cap-enforcement)
6. [Ownership Guard](#6-ownership-guard)
7. [Export with Joins](#7-export-with-joins)
8. [Edge Cases](#8-edge-cases)

---

## 1. Backward Compatibility (v3)

### Test 1.1: Create Table - Students Only (No Joins)

**Purpose**: Ensure v3 students-only queries still work unchanged.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "create table with active students showing first name, last name, and email",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Behavior**:
- ✅ AI returns `generate_table` envelope
- ✅ Contract uses `students.field` or just `field` notation
- ✅ Backend detects NO joins
- ✅ Uses direct query (StudentModel.find()) - not aggregation
- ✅ Returns table with student data
- ✅ Response time < 200ms

**Validation**:
```javascript
// Check that DetectRequiredJoins returns empty set
// Check query method is direct find (not aggregate)
```

---

### Test 1.2: Modify Table - Add Students Column

**Purpose**: Ensure v3 modify operations work.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "add phone number column",
  "user_id": "{{test_user_id}}",
  "conversation_id": "{{from_test_1.1}}",
  "lang": "en"
}
```

**Expected Behavior**:
- ✅ AI returns `modify_table` envelope
- ✅ add_columns contains tele_phone field
- ✅ Backend uses direct query (no aggregation)
- ✅ Table rebuilt successfully
- ✅ New column appears in response

---

### Test 1.3: Export - Students Only

**Purpose**: Ensure v3 export works.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "export first name, last name, email for active students with comma delimiter",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Behavior**:
- ✅ AI returns `export_table` envelope
- ✅ Columns: ["first_name", "last_name", "email"]
- ✅ Backend uses direct query (not aggregation)
- ✅ CSV generated successfully
- ✅ Email sent

---

## 2. Single Join Tests (v4)

### Test 2.1: Create with School Join

**Purpose**: Test single entity join (school).

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "create table with active students showing name, email, and school city",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected AI Contract**:
```json
{
  "status": "ready",
  "intent": "generate_table",
  "contract": {
    "columns": [
      {"key": "name", "source": {"field": "first_name + ' ' + last_name"}},
      {"key": "email", "source": {"field": "email"}},
      {"key": "school_city", "source": {"field": "school.city"}}
    ],
    "filters": [
      {"key": "students.status", "op": "eq", "value": "active"}
    ]
  }
}
```

**Expected Behavior**:
- ✅ ValidateFieldPath accepts "school.city"
- ✅ DetectRequiredJoins returns {"school"}
- ✅ BuildStudentAggregation creates pipeline with school $lookup
- ✅ School address resolved (city from main address or first address)
- ✅ Aggregation pipeline executed
- ✅ Rows contain school.city values
- ✅ Response time < 500ms

**Validation Query**:
```javascript
// Check pipeline structure
const pipeline = BuildStudentAggregation({columns, filters});
// Should contain:
// - $match for students.status
// - $lookup for schools
// - $project with flat school_city field
```

---

### Test 2.2: Create with RNCP Title Join

**Purpose**: Test RNCP title join.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show active students with their RNCP level and certification year",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Columns**:
- `rncp_title.rncp_level`
- `rncp_title.year_of_certification`

**Expected Behavior**:
- ✅ DetectRequiredJoins returns {"rncp_title"}
- ✅ Pipeline has rncp_titles $lookup
- ✅ Rows show RNCP level (5, 6, 7, etc.)
- ✅ Rows show certification year

---

### Test 2.3: Create with Class Join

**Purpose**: Test class join.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "create table showing students with their current class name and status",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Columns**:
- `class.name`
- `class.status`

**Expected Behavior**:
- ✅ DetectRequiredJoins returns {"class"}
- ✅ Pipeline has classes $lookup
- ✅ Rows show class names
- ✅ Rows show class status

---

### Test 2.4: Filter by Joined Entity

**Purpose**: Test filtering on joined entity field.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show students from Paris",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Filter**:
```json
{"key": "school.city", "op": "eq", "value": "Paris"}
```

**Expected Behavior**:
- ✅ DetectRequiredJoins returns {"school"}
- ✅ Filter validation passes
- ✅ Pipeline has $match AFTER $lookup for school.city
- ✅ Only students from Paris schools returned
- ✅ Row count matches filtered set

---

### Test 2.5: Sort by Joined Field

**Purpose**: Test sorting on joined entity.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show active students sorted by school name ascending",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Sort**:
```json
{"key": "school.short_name", "dir": "asc"}
```

**Expected Behavior**:
- ✅ Sort validation passes
- ✅ Pipeline has $sort stage
- ✅ Rows returned in school name alphabetical order

---

## 3. Multiple Joins Tests (v4)

### Test 3.1: Two Joins (School + RNCP)

**Purpose**: Test 2 joined entities.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "create table with students, their school city, and RNCP level",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Columns**:
- `first_name`
- `school.city`
- `rncp_title.rncp_level`

**Expected Behavior**:
- ✅ DetectRequiredJoins returns {"school", "rncp_title"}
- ✅ Pipeline has 2 $lookup stages
- ✅ Rows show both school and rncp data
- ✅ Join count = 2 (passes < 3 limit)

---

### Test 3.2: Three Joins (Maximum)

**Purpose**: Test maximum 3 joins.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show students with school name, class name, and RNCP code",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Columns**:
- `school.short_name`
- `class.name`
- `rncp_title.rncp_code`

**Expected Behavior**:
- ✅ DetectRequiredJoins returns {"school", "class", "rncp_title"}
- ✅ Pipeline has 3 $lookup stages
- ✅ Join count = 3 (exactly at limit)
- ✅ EnforceJoinLimit passes
- ✅ All 3 entities' data appears in rows

---

### Test 3.3: Multiple Joins with Filters on All

**Purpose**: Test filtering across multiple joined entities.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show active students in Paris with RNCP level 6 from active schools",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Filters**:
```json
[
  {"key": "students.status", "op": "eq", "value": "active"},
  {"key": "school.city", "op": "eq", "value": "Paris"},
  {"key": "school.status", "op": "eq", "value": "active"},
  {"key": "rncp_title.rncp_level", "op": "eq", "value": "6"}
]
```

**Expected Behavior**:
- ✅ 2 joins detected (school, rncp_title)
- ✅ Students filter in first $match
- ✅ Joined entity filters in second $match
- ✅ Result set correctly filtered

---

## 4. Join Limit Enforcement

### Test 4.1: Reject 4+ Joins

**Purpose**: Ensure >3 joins are rejected.

**Simulated AI Contract** (manually inject):
```json
{
  "columns": [
    {"source": {"field": "school.city"}},
    {"source": {"field": "class.name"}},
    {"source": {"field": "rncp_title.rncp_code"}},
    {"source": {"field": "teacher.name"}}
  ]
}
```

**Expected Behavior**:
- ✅ CountJoinsInContract returns 4
- ✅ EnforceJoinLimit throws error
- ✅ Response status 400 or 422
- ✅ Error message: "Maximum 3 joined entities allowed per request. You requested 4: school, class, rncp_title, teacher."

---

### Test 4.2: AI Fails Gracefully

**Purpose**: Test AI recognizes limit and suggests alternatives.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show students with school, class, rncp, and teacher details",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected AI Response**:
```json
{
  "status": "failed",
  "message": "Too many joined entities requested.",
  "explanation": "You can join a maximum of 3 entities per request.",
  "options": [
    "Show students with school, class, and RNCP only",
    "Show students with school and class only"
  ]
}
```

---

## 5. Row Cap Enforcement

### Test 5.1: Query Within 10k Limit

**Purpose**: Ensure queries under 10k rows work.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show active students with school city",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Behavior**:
- ✅ EstimateRowCount called with aggregation pipeline
- ✅ Count < 10,000
- ✅ EnforceRowCap passes
- ✅ Table created successfully

---

### Test 5.2: Reject Query Over 10k Rows

**Purpose**: Ensure >10k queries are rejected.

**Setup**: Remove filters to create broad query.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "show all students",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected AI Response**:
```json
{
  "status": "failed",
  "message": "Query too broad.",
  "explanation": "This query would return approximately 15000 rows, exceeding the 10000 limit.",
  "options": [
    "Filter by status",
    "Filter by school",
    "Filter by enrollment date"
  ]
}
```

---

### Test 5.3: Row Cap with Joins

**Purpose**: Ensure row cap works with aggregation pipelines.

**Request**: Create query with joins that would return >10k rows.

**Expected Behavior**:
- ✅ EstimateRowCount uses countDocuments on pipeline
- ✅ Detects >10k rows
- ✅ EnforceRowCap throws error
- ✅ Error suggests adding filters

---

## 6. Ownership Guard

### Test 6.1: Owner Can Access Table

**Purpose**: Verify owner can retrieve their table.

**Request**:
```http
GET /api/ai-tables/:table_id
Authorization: Bearer {{owner_token}}
```

**Expected Behavior**:
- ✅ Table found
- ✅ created_by matches userId
- ✅ Ownership check passes
- ✅ Status 200
- ✅ Table and rows returned

---

### Test 6.2: Non-Owner Cannot Access Table

**Purpose**: Verify non-owner cannot access table.

**Request**:
```http
GET /api/ai-tables/:table_id
Authorization: Bearer {{different_user_token}}
```

**Expected Behavior**:
- ✅ Table found in DB
- ✅ created_by does NOT match userId
- ✅ Ownership check fails
- ✅ Status 404 (not 403 to prevent enumeration)
- ✅ Error: "Table not found"

---

### Test 6.3: Unauthenticated Request

**Purpose**: Verify unauthenticated requests fail.

**Request**:
```http
GET /api/ai-tables/:table_id
(No Authorization header)
```

**Expected Behavior**:
- ✅ Auth middleware rejects request
- ✅ Status 401
- ✅ Error: "Unauthorized"

---

## 7. Export with Joins

### Test 7.1: Export Single Join

**Purpose**: Test CSV export with joined columns.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "export first name, last name, and school city for active students with comma delimiter",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Export Config**:
```json
{
  "columns": ["first_name", "last_name", "school.city"],
  "filters": [{"key": "students.status", "op": "eq", "value": "active"}],
  "delimiter": "comma"
}
```

**Expected Behavior**:
- ✅ ValidateColumns accepts "school.city"
- ✅ CountJoinsInContract returns 1
- ✅ DetectRequiredJoins in export service returns {"school"}
- ✅ Uses aggregation pipeline
- ✅ CSV generated with school city column
- ✅ CSV header: "first_name,last_name,school.city"
- ✅ CSV rows contain correct data

**CSV Sample**:
```csv
first_name,last_name,school.city
John,Doe,Paris
Jane,Smith,Lyon
```

---

### Test 7.2: Export Multiple Joins

**Purpose**: Test export with 3 entities.

**Request**:
```json
POST /api/bilip/chat
{
  "prompt": "export student name, school city, class name, and RNCP level with semicolon delimiter",
  "user_id": "{{test_user_id}}",
  "lang": "en"
}
```

**Expected Columns**:
```json
["first_name", "last_name", "school.city", "class.name", "rncp_title.rncp_level"]
```

**Expected Behavior**:
- ✅ Validator accepts all columns
- ✅ Join count = 3 (max)
- ✅ Pipeline built with 3 lookups
- ✅ CSV generated
- ✅ Delimiter: semicolon

---

### Test 7.3: Export Join Limit Enforcement

**Purpose**: Reject export with >3 joins.

**Simulated Request** (inject contract):
```json
{
  "columns": ["first_name", "school.city", "class.name", "rncp_title.rncp_code", "teacher.name"]
}
```

**Expected Behavior**:
- ✅ ValidateExportRequest detects 4 joins
- ✅ EnforceJoinLimit throws error
- ✅ Status 400
- ✅ Error message about join limit

---

## 8. Edge Cases

### Test 8.1: Student Without School (Null Join)

**Purpose**: Ensure null joins don't break pipeline.

**Setup**: Student with school = null

**Expected Behavior**:
- ✅ $lookup returns empty array
- ✅ $project handles missing school doc
- ✅ school.city shows null or empty
- ✅ No error thrown
- ✅ Row included in results

---

### Test 8.2: School Without Main Address

**Purpose**: Test address resolution fallback.

**Setup**: School with no is_main_address=true

**Expected Behavior**:
- ✅ Pipeline falls back to first address
- ✅ city and country extracted from first address
- ✅ No error

---

### Test 8.3: School With No Addresses

**Purpose**: Test empty school_address array.

**Setup**: School with school_address = []

**Expected Behavior**:
- ✅ Pipeline handles empty array
- ✅ city and country = null
- ✅ No error

---

### Test 8.4: Computed Column with Join

**Purpose**: Test string concatenation with joined field.

**Contract**:
```json
{
  "columns": [
    {
      "key": "student_location",
      "source": {
        "field": "first_name + ' - ' + school.city"
      }
    }
  ]
}
```

**Expected Behavior**:
- ✅ ValidateComputedExpressionV4 accepts it
- ✅ Pipeline evaluates $concat
- ✅ Output: "John - Paris"

---

### Test 8.5: Mixed v3 and v4 Paths

**Purpose**: Ensure backward compat with mixed notation.

**Contract**:
```json
{
  "columns": [
    {"source": {"field": "first_name"}},
    {"source": {"field": "students.status"}},
    {"source": {"field": "school.city"}}
  ]
}
```

**Expected Behavior**:
- ✅ "first_name" accepted (v3 style)
- ✅ "students.status" accepted (v3 explicit)
- ✅ "school.city" accepted (v4 join)
- ✅ DetectRequiredJoins returns {"school"}
- ✅ Table created successfully

---

## Test Execution Checklist

### Pre-Deployment Tests (Critical)
- [ ] Test 1.1: v3 create works
- [ ] Test 1.2: v3 modify works
- [ ] Test 1.3: v3 export works
- [ ] Test 2.1: School join works
- [ ] Test 2.4: Filter by joined field
- [ ] Test 3.2: 3 joins (maximum)
- [ ] Test 4.1: 4+ joins rejected
- [ ] Test 5.2: >10k rows rejected
- [ ] Test 6.2: Ownership guard blocks non-owner
- [ ] Test 7.1: Export with joins

### Post-Deployment Verification
- [ ] Monitor error logs for 24h
- [ ] Check performance metrics (aggregation latency)
- [ ] Verify no v3 regressions reported
- [ ] Confirm CSV exports work in production

---

## Performance Benchmarks

### Expected Response Times

| Operation | v3 (No Joins) | v4 (1 Join) | v4 (3 Joins) |
|-----------|---------------|-------------|--------------|
| CREATE    | < 200ms       | < 500ms     | < 800ms      |
| MODIFY    | < 150ms       | < 400ms     | < 700ms      |
| EXPORT    | < 2s          | < 4s        | < 6s         |
| GET Table | < 100ms       | N/A         | N/A          |

### Row Count Limits

| Scenario | Limit | Enforcement |
|----------|-------|-------------|
| v3 Query | 10,000 | EstimateRowCount + EnforceRowCap |
| v4 Query | 10,000 | EstimateRowCount (aggregation) + EnforceRowCap |
| Export   | 10,000 | Same as query |

---

## Debugging Tips

### Check if Aggregation is Used
```javascript
// Add console.log in chat.service.js
if (requiredJoins.size > 0) {
  console.log('✅ Using v4 aggregation pipeline');
} else {
  console.log('✅ Using v3 direct query');
}
```

### Inspect Aggregation Pipeline
```javascript
const pipeline = BuildStudentAggregation({columns, filters, sort});
console.log('Pipeline:', JSON.stringify(pipeline, null, 2));
```

### Check Join Detection
```javascript
const requiredJoins = DetectRequiredJoins({columns, filters, sort});
console.log('Detected joins:', Array.from(requiredJoins));
```

### Verify Row Estimation
```javascript
const estimatedCount = await EstimateRowCount(pipeline, true);
console.log('Estimated rows:', estimatedCount);
```

---

## Known Issues & Workarounds

### Issue 1: Slow Aggregation with Large Datasets
**Symptom**: Queries with 3 joins take >2 seconds  
**Workaround**: Ensure indexes on students.rncp_title, students.school, students.current_class  
**Fix**: Add compound indexes

### Issue 2: School Address Resolution Complexity
**Symptom**: School lookups slightly slower  
**Explanation**: Address resolution happens in pipeline (find main address)  
**Status**: Expected behavior, acceptable performance cost

---

## Success Criteria

BILIP v4 is ready for production when:
- ✅ All v3 tests pass (backward compatibility confirmed)
- ✅ All v4 single join tests pass
- ✅ Multiple join tests pass (up to 3)
- ✅ Join limit enforcement works
- ✅ Row cap enforcement works
- ✅ Ownership guard blocks unauthorized access
- ✅ Export with joins generates valid CSV
- ✅ Performance within benchmarks
- ✅ No errors in 24h production monitoring

---

## Contact & Support

**Questions**: Refer to BILIP_V4_IMPLEMENTATION_STATUS.md  
**Code Issues**: Check aggregation.builder.js and path.validator.js  
**Performance Issues**: Monitor MongoDB slow query log
