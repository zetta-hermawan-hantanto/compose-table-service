# BILIP v4.2 Field Path Rules - Quick Reference

## Critical Rules for AI Contract Generation

### ✅ **CORRECT Field Naming**

#### Student Base Fields (NO prefix)
```json
{
  "columns": [
    { "key": "first_name", "source": { "field": "first_name" } },
    { "key": "last_name", "source": { "field": "last_name" } },
    { "key": "email", "source": { "field": "email" } },
    { "key": "status", "source": { "field": "status" } }
  ],
  "filters": [
    { "key": "status", "operator": "eq", "value": "active" },
    { "key": "email", "operator": "contains", "value": "@example.com" }
  ]
}
```

#### Joined Entity Fields (WITH entity.field notation)
```json
{
  "columns": [
    { "key": "school.name", "source": { "field": "school.name" } },
    { "key": "school.city", "source": { "field": "school.city" } },
    { "key": "school.country", "source": { "field": "school.country" } },
    { "key": "rncp_title.title", "source": { "field": "rncp_title.title" } },
    { "key": "rncp_title.rncp_level", "source": { "field": "rncp_title.rncp_level" } },
    { "key": "class.name", "source": { "field": "class.name" } }
  ],
  "filters": [
    { "key": "school.country", "operator": "eq", "value": "France" },
    { "key": "rncp_title.rncp_level", "operator": "eq", "value": "5" },
    { "key": "class.status", "operator": "eq", "value": "active" }
  ]
}
```

---

### ❌ **WRONG Field Naming (Common Mistakes)**

#### Mistake 1: Using snake_case instead of dot notation
```json
// ❌ WRONG
{ "key": "school_name", "source": { "field": "school_name" } }
{ "key": "school_city", "source": { "field": "school_city" } }
{ "key": "rncp_level", "source": { "field": "rncp_level" } }

// ✅ CORRECT
{ "key": "school.name", "source": { "field": "school.name" } }
{ "key": "school.city", "source": { "field": "school.city" } }
{ "key": "rncp_title.rncp_level", "source": { "field": "rncp_title.rncp_level" } }
```

#### Mistake 2: Adding "students." prefix to base fields
```json
// ❌ WRONG - filters
{ "key": "students.status", "operator": "eq", "value": "active" }
{ "key": "students.first_name", "operator": "contains", "value": "John" }

// ✅ CORRECT - filters
{ "key": "status", "operator": "eq", "value": "active" }
{ "key": "first_name", "operator": "contains", "value": "John" }
```

#### Mistake 3: Using "op" instead of "operator" in contract
```json
// ❌ WRONG - will cause "operator undefined" error
{ "key": "status", "op": "eq", "value": "active" }

// ✅ CORRECT - contract uses "operator"
{ "key": "status", "operator": "eq", "value": "active" }
```

#### Mistake 4: Key doesn't match source.field
```json
// ❌ WRONG - key and source.field mismatch
{ "key": "school_name", "source": { "field": "school.name" } }

// ✅ CORRECT - key matches source.field
{ "key": "school.name", "source": { "field": "school.name" } }
```

---

## Complete Example: Students with School Info

### User Request
"Create me a table showing first name, last name, email, and school name for students with status deleted in France"

### ✅ CORRECT Contract
```json
{
  "status": "ready",
  "intent": "generate_table",
  "message": "Creating table with deleted students from France",
  "contract": {
    "table_name": "Deleted Students France",
    "description": "Students with deleted status from French schools",
    "base_entity": "students",
    "columns": [
      {
        "label": "First Name",
        "key": "first_name",
        "data_type": "string",
        "source": { "collection": "students", "field": "first_name" }
      },
      {
        "label": "Last Name",
        "key": "last_name",
        "data_type": "string",
        "source": { "collection": "students", "field": "last_name" }
      },
      {
        "label": "Email",
        "key": "email",
        "data_type": "string",
        "source": { "collection": "students", "field": "email" }
      },
      {
        "label": "School Name",
        "key": "school.name",
        "data_type": "string",
        "source": { "collection": "students", "field": "school.name" }
      }
    ],
    "filters": [
      { "key": "status", "operator": "eq", "value": "deleted" },
      { "key": "school.country", "operator": "eq", "value": "France" }
    ],
    "sort": [
      { "key": "last_name", "direction": "asc" }
    ]
  }
}
```

### ❌ WRONG Contract (Common Mistakes)
```json
{
  "contract": {
    "columns": [
      { "key": "first_name", "source": { "field": "first_name" } },
      { "key": "school_name", "source": { "field": "school_name" } }  // ❌ WRONG: should be "school.name"
    ],
    "filters": [
      { "key": "students.status", "op": "eq", "value": "deleted" },  // ❌ WRONG: should be "status" and "operator"
      { "key": "school.country", "op": "eq", "value": "France" }     // ❌ WRONG: should be "operator"
    ]
  }
}
```

---

## Validation Errors Reference

### Error: "Column path not found in catalog: school_name"
**Cause**: Using `school_name` instead of `school.name`  
**Fix**: Change all column keys to use dot notation: `school.name`, `school.city`, etc.

### Error: "Filter at index 0 missing operation"
**Cause**: Using `"op"` instead of `"operator"` in contract filters  
**Fix**: Change `"op": "eq"` to `"operator": "eq"` in all filters

### Error: "Column path not found in catalog: students.status"
**Cause**: Adding `students.` prefix to base entity fields  
**Fix**: Remove `students.` prefix - use just `status`, `first_name`, `email`, etc.

---

## Entity Field Reference

### Students Entity (base fields - no prefix)
- `first_name`, `last_name`, `email`, `tele_phone`
- `status` (enum: active, pending, deleted)
- `date_of_birth`, `rncp_title` (ObjectId), `school` (ObjectId), `current_class` (ObjectId)

### School Entity (joined - use `school.` prefix)
- `school.short_name`, `school.long_name`, `school.name`
- `school.status`, `school.school_siret`
- `school.city`, `school.country`

### RNCP Title Entity (joined - use `rncp_title.` prefix)
- `rncp_title.short_name`, `rncp_title.long_name`, `rncp_title.title`
- `rncp_title.rncp_code`, `rncp_title.rncp_level`
- `rncp_title.status`, `rncp_title.year_of_certification`

### Class Entity (joined - use `class.` prefix)
- `class.name`, `class.status`
- `class.year_of_certification`, `class.type_evaluation`
- `class.evaluation_step`, `class.class_active`

---

## Key Takeaways

1. **Student fields**: Simple names (`first_name`, `status`, `email`)
2. **Joined fields**: Dot notation (`school.name`, `rncp_title.rncp_level`, `class.name`)
3. **Column key = source.field**: Always match exactly
4. **Filters use "operator"**: Not "op" in the contract
5. **No "students." prefix**: Never use `students.status` in filters or columns

---

## Testing Your Contract

Run this mental checklist:
- [ ] All student base fields have NO prefix (✅ `status` not ❌ `students.status`)
- [ ] All joined fields use dot notation (✅ `school.name` not ❌ `school_name`)
- [ ] All column keys match their source.field exactly
- [ ] All filters use `"operator"` not `"op"`
- [ ] No filters on non-existent fields (check catalog first)

---

**Last Updated**: 2025-11-10  
**Version**: 4.2.0
