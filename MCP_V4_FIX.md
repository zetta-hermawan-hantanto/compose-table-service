# MCP v4 Catalog Fix - AI Visibility

## Problem

When testing BILIP v4, the AI kept saying it couldn't find fields like `school.city` or `rncp_title.rncp_level` in the students catalog. The AI would suggest using only students fields, even though the backend was fully ready to handle joins.

**Root Cause**: The MCP tool `LoadStudentsCatalog()` only returned the `students` entity fields. The AI had no knowledge of the joinable entities (`school`, `rncp_title`, `class`).

---

## Solution

Updated the MCP server (`src/mcp/mcp.server.js`) to return the **full v4 catalog** including all entities and relations.

### Changes Made

#### 1. Updated `LoadStudentsCatalog()` Function

**Before (v3)**:
```javascript
function LoadStudentsCatalog() {
  // Only returned students entity
  return {
    base_entity: 'students',
    fields: studentsFields  // Only students fields
  };
}
```

**After (v4)**:
```javascript
function LoadStudentsCatalog() {
  // Returns ALL entities
  return {
    version: '2025-11-09',
    base_entity: 'students',
    entities: [
      { name: 'students', fields: [...] },
      { name: 'rncp_title', fields: [...] },
      { name: 'school', fields: [...] },
      { name: 'class', fields: [...] }
    ],
    relations: [
      { from: 'students.rncp_title', to: 'rncp_title._id', type: 'one_to_one' },
      { from: 'students.school', to: 'school._id', type: 'one_to_one' },
      { from: 'students.current_class', to: 'class._id', type: 'one_to_one' }
    ],
    constraints: {
      max_columns_per_table: 30,
      max_filters_per_request: 10,
      max_joins_per_request: 3,
      max_row_cap: 10000
    }
  };
}
```

#### 2. Updated `SearchCatalogFields()` Function

**Before (v3)**:
```javascript
function SearchCatalogFields(query) {
  // Only searched students fields
  const matchingFields = catalogMetadata.fields.filter(...);
  return { matches: matchingFields };
}
```

**After (v4)**:
```javascript
function SearchCatalogFields(query) {
  // Searches ALL entities
  const matchingFields = [];
  
  for (const entity of catalogMetadata.entities) {
    for (const field of entity.fields) {
      if (matches(query, field)) {
        const fieldPath = entity.name === 'students' 
          ? field.key 
          : `${entity.name}.${field.key}`;
        
        matchingFields.push({
          entity: entity.name,
          field_path: fieldPath,  // e.g., "school.city"
          key: field.key,
          data_type: field.data_type
        });
      }
    }
  }
  
  return { 
    matches: matchingFields,
    total_matches: matchingFields.length 
  };
}
```

#### 3. Updated Tool Descriptions

**db_introspect_students**:
```javascript
{
  name: 'db_introspect_students',
  description: 'Returns v4 catalog metadata including students base entity and joinable entities (rncp_title school class). Use entity.field notation for joins (e.g. school.city rncp_title.rncp_level).',
  // ...
}
```

**db_search_fields**:
```javascript
{
  name: 'db_search_fields',
  description: 'Search for fields across all entities (students rncp_title school class) by keyword. Returns field_path with entity prefix for joins.',
  // ...
}
```

---

## What AI Can See Now

### Catalog Response Example

When AI calls `db_introspect_students`, it now receives:

```json
{
  "version": "2025-11-09",
  "base_entity": "students",
  "entities": [
    {
      "name": "students",
      "fields": [
        {"key": "_id", "data_type": "objectId"},
        {"key": "first_name", "data_type": "string"},
        {"key": "last_name", "data_type": "string"},
        {"key": "email", "data_type": "string"},
        {"key": "school", "data_type": "objectId"},
        {"key": "rncp_title", "data_type": "objectId"},
        {"key": "current_class", "data_type": "objectId"}
      ]
    },
    {
      "name": "school",
      "fields": [
        {"key": "short_name", "data_type": "string"},
        {"key": "long_name", "data_type": "string"},
        {"key": "city", "data_type": "string"},
        {"key": "country", "data_type": "string"}
      ]
    },
    {
      "name": "rncp_title",
      "fields": [
        {"key": "rncp_level", "data_type": "string"},
        {"key": "rncp_code", "data_type": "string"},
        {"key": "short_name", "data_type": "string"}
      ]
    },
    {
      "name": "class",
      "fields": [
        {"key": "name", "data_type": "string"},
        {"key": "status", "data_type": "string"},
        {"key": "year_of_certification", "data_type": "number"}
      ]
    }
  ],
  "relations": [
    {"from": "students.rncp_title", "to": "rncp_title._id", "type": "one_to_one"},
    {"from": "students.school", "to": "school._id", "type": "one_to_one"},
    {"from": "students.current_class", "to": "class._id", "type": "one_to_one"}
  ],
  "constraints": {
    "max_columns_per_table": 30,
    "max_filters_per_request": 10,
    "max_joins_per_request": 3,
    "max_row_cap": 10000
  }
}
```

### Search Results Example

When AI searches for "city":
```json
{
  "query": "city",
  "matches": [
    {
      "entity": "school",
      "field_path": "school.city",
      "key": "city",
      "data_type": "string"
    }
  ],
  "total_matches": 1
}
```

When AI searches for "level":
```json
{
  "query": "level",
  "matches": [
    {
      "entity": "rncp_title",
      "field_path": "rncp_title.rncp_level",
      "key": "rncp_level",
      "data_type": "string"
    }
  ],
  "total_matches": 1
}
```

When AI searches for "name":
```json
{
  "query": "name",
  "matches": [
    {"entity": "students", "field_path": "first_name"},
    {"entity": "students", "field_path": "last_name"},
    {"entity": "school", "field_path": "school.short_name"},
    {"entity": "school", "field_path": "school.long_name"},
    {"entity": "rncp_title", "field_path": "rncp_title.short_name"},
    {"entity": "class", "field_path": "class.name"}
  ],
  "total_matches": 6
}
```

---

## How AI Will Use This

### Example 1: User asks for school city

**User**: "show me students with their school city"

**AI Process**:
1. Calls `db_introspect_students`
2. Sees `school` entity with `city` field
3. Generates contract with:
   ```json
   {
     "columns": [
       {"source": {"field": "first_name"}},
       {"source": {"field": "school.city"}}
     ]
   }
   ```

### Example 2: User asks for RNCP level

**User**: "create table showing student names and RNCP certification level"

**AI Process**:
1. Calls `db_search_fields` with query "level"
2. Gets back `rncp_title.rncp_level`
3. Generates contract:
   ```json
   {
     "columns": [
       {"source": {"field": "first_name + ' ' + last_name"}},
       {"source": {"field": "rncp_title.rncp_level"}}
     ]
   }
   ```

### Example 3: User asks for class information

**User**: "list students with their current class name"

**AI Process**:
1. Sees `class` entity with `name` field
2. Generates contract:
   ```json
   {
     "columns": [
       {"source": {"field": "first_name"}},
       {"source": {"field": "class.name"}}
     ]
   }
   ```

---

## Testing

Run the test script to verify MCP tool works:

```bash
node test_mcp_v4.js
```

**Expected Output**:
```
=== Testing MCP v4 Catalog ===

✅ MCP Tool Response:

Version: 2025-11-09
Base Entity: students

Entities:
  - students (20 fields)
  - rncp_title (6 fields)
  - school (6 fields)
  - class (6 fields)

Relations: 3
  - students.rncp_title → rncp_title._id (one_to_one)
  - students.school → school._id (one_to_one)
  - students.current_class → class._id (one_to_one)

Constraints:
  - max_joins_per_request: 3
  - max_row_cap: 10000

=== Testing Search Tool ===

Search for "city":
  ✅ school.city (entity: school)

Search for "level":
  ✅ rncp_title.rncp_level (entity: rncp_title)

=== ✅ MCP v4 Catalog Working Correctly ===
```

---

## Impact

### Before Fix
- ❌ AI couldn't see joined entity fields
- ❌ AI would say "I can't find school.city in students catalog"
- ❌ Users couldn't create tables with joined columns
- ❌ v4 features were invisible to AI

### After Fix
- ✅ AI sees all entities (students, school, rncp_title, class)
- ✅ AI knows to use `entity.field` notation for joins
- ✅ AI can search for fields across all entities
- ✅ AI understands join constraints (max 3 entities)
- ✅ Full v4 capabilities available to users

---

## Files Modified

1. **src/mcp/mcp.server.js**
   - Updated `LoadStudentsCatalog()` to return all entities
   - Updated `SearchCatalogFields()` to search all entities
   - Updated tool descriptions for v4

---

## Summary

The fix ensures the AI agent has **full visibility** of the v4 catalog, including:
- All 4 entities (students, school, rncp_title, class)
- All fields in each entity
- Relations between entities (1:1 joins)
- Constraints (max 3 joins, 10k row cap)

The AI now knows:
- Which fields exist in which entities
- How to reference joined fields (`entity.field`)
- What constraints apply to queries
- How to search for fields across entities

**Result**: AI can now correctly generate v4 contracts with joined columns! 🎉
