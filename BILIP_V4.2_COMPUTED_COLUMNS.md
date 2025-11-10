# BILIP V4.2 - Computed Columns Feature ✅

## Overview

**Computed columns** allow you to concatenate multiple fields from base and joined entities into a single output column using string expressions.

**Status**: ✅ Complete and Production Ready  
**Version**: 4.2.0  
**Date**: 2025-11-10

---

## Features

✅ **Multi-field concatenation** - Combine 2+ fields with custom separators  
✅ **Base entity fields** - `first_name + ' ' + last_name`  
✅ **Joined entity fields** - `school.short_name + ' - ' + school.long_name`  
✅ **Mixed fields** - `first_name + ' from ' + school.city`  
✅ **Type-safe validation** - All fields must be string type  
✅ **Automatic join detection** - Joins inferred from field paths  
✅ **Works everywhere** - Generate, Modify, Export  

---

## Syntax

### Format
```
field1 + 'separator' + field2 + 'sep2' + field3 + ...
```

### Rules
- Fields can be base entity (e.g., `first_name`) or joined entity (e.g., `school.name`)
- Separators must be in single quotes (e.g., `' '`, `' - '`, `' from '`)
- All fields must be string type
- Alternating pattern: field, separator, field, separator, ...

---

## Examples

### Example 1: Base Entity Fields
**Expression**:
```javascript
"first_name + ' ' + last_name"
```

**Result**: `"John Doe"`

**MongoDB Output**:
```javascript
{
  $concat: ["$first_name", " ", "$last_name"]
}
```

---

### Example 2: Joined Entity Fields
**Expression**:
```javascript
"school.short_name + ' - ' + school.long_name"
```

**Result**: `"MIT - Massachusetts Institute of Technology"`

**MongoDB Output**:
```javascript
{
  $concat: ["$school.short_name", " - ", "$school.long_name"]
}
```

---

### Example 3: Mixed (Base + Joined)
**Expression**:
```javascript
"first_name + ' from ' + school.city"
```

**Result**: `"John from Boston"`

**MongoDB Output**:
```javascript
{
  $concat: ["$first_name", " from ", "$school.city"]
}
```

---

### Example 4: Complex Multi-Field
**Expression**:
```javascript
"rncp_title.short_name + ' (Level ' + rncp_title.rncp_level + ') - ' + rncp_title.long_name"
```

**Result**: `"Manager (Level 7) - Manager des Organisations"`

**MongoDB Output**:
```javascript
{
  $concat: [
    "$rncp_title.short_name",
    " (Level ",
    "$rncp_title.rncp_level",
    ") - ",
    "$rncp_title.long_name"
  ]
}
```

---

## Usage in API

### 1. Generate Table (Contract Format)

```json
{
  "status": "ready",
  "intent": "generate_table",
  "contract": {
    "table_name": "Students with School Names",
    "columns": [
      {
        "label": "Student Name",
        "key": "first_name + ' ' + last_name",
        "data_type": "string",
        "source": {
          "collection": "students",
          "field": "first_name + ' ' + last_name"
        }
      },
      {
        "label": "Full School Name",
        "key": "school.short_name + ' - ' + school.long_name",
        "data_type": "string",
        "source": {
          "collection": "students",
          "field": "school.short_name + ' - ' + school.long_name"
        }
      }
    ],
    "filters": [
      { "key": "status", "operator": "eq", "value": "active" }
    ]
  }
}
```

**Important**: The `key` field must **exactly match** the `source.field` expression.

---

### 2. Plan Format (Internal)

```json
{
  "entry": "students",
  "columns": [
    {
      "path": "first_name + ' ' + last_name",
      "alias": "student_name"
    },
    {
      "path": "school.short_name + ' - ' + school.long_name",
      "alias": "full_school_name"
    }
  ],
  "filters": [
    { "path": "status", "op": "eq", "value": "active" }
  ]
}
```

---

### 3. Generated MongoDB Pipeline

```javascript
[
  { $match: { status: "active" } },
  { 
    $lookup: {
      from: "schools",
      localField: "school",
      foreignField: "_id",
      as: "school"
    }
  },
  {
    $unwind: {
      path: "$school",
      preserveNullAndEmptyArrays: true
    }
  },
  {
    $project: {
      _id: 0,
      student_name: {
        $concat: ["$first_name", " ", "$last_name"]
      },
      full_school_name: {
        $concat: ["$school.short_name", " - ", "$school.long_name"]
      }
    }
  },
  { $limit: 100 }
]
```

---

## Validation

### What Gets Validated

1. **Expression syntax** - Must follow `field + 'sep' + field` pattern
2. **Field existence** - All fields must exist in catalog
3. **Field types** - All fields must be string type
4. **Join requirements** - Joined fields automatically detected

### Validation Errors

#### Error: "Expression must start with a field name"
**Cause**: Expression starts with a separator  
**Fix**: Start with a field name

#### Error: "Field 'school.name' not found in catalog"
**Cause**: Field path doesn't exist in catalog  
**Fix**: Check field name spelling and entity name

#### Error: "Field 'created_at' must be string type for concatenation"
**Cause**: Trying to concatenate non-string field  
**Fix**: Only use string fields in computed expressions

---

## Implementation Details

### Components

1. **ComputedExpression Utility** (`src/utils/computed.expression.js`)
   - `ParseComputedExpression()` - Parse expression into tokens
   - `ValidateComputedExpression()` - Validate against catalog
   - `BuildMongoExpression()` - Generate MongoDB $concat
   - `GetRequiredJoins()` - Extract join dependencies
   - `IsComputedExpression()` - Check if expression is computed

2. **Contract Validator** (`src/validators/contract.validator.v4.2.js`)
   - Uses ComputedExpression utility for validation
   - Validates column expressions during contract validation

3. **Plan Validator** (`src/validators/plan.validator.js`)
   - Detects computed expressions using `IsComputedExpression()`
   - Validates computed expressions using `ValidateComputedExpression()`
   - Extracts joins from computed expressions for join count validation

4. **Aggregation Builder** (`src/utils/aggregation.builder.v2.js`)
   - Detects computed expressions in $project stage
   - Generates MongoDB $concat operators
   - Handles both base and joined field references

---

## Flow Diagram

```
User Request: "Show first name, last name, and full school name"
  ↓
AI generates contract with computed column:
  { 
    "key": "school.short_name + ' - ' + school.long_name",
    "source": { "field": "school.short_name + ' - ' + school.long_name" }
  }
  ↓
Contract Validator validates expression:
  → ParseComputedExpression("school.short_name + ' - ' + school.long_name")
  → ValidateComputedExpression() checks catalog
  → All fields exist and are string type ✅
  ↓
Convert to Plan:
  { "path": "school.short_name + ' - ' + school.long_name", "alias": "full_school_name" }
  ↓
JoinPlanner detects joins:
  → GetRequiredJoins() finds "school" entity
  → Adds school join to join plan
  ↓
AggregationBuilder builds pipeline:
  → BuildProjectStage() detects computed expression
  → BuildMongoExpression() generates:
    { $concat: ["$school.short_name", " - ", "$school.long_name"] }
  ↓
MongoDB executes pipeline:
  → Returns: "MIT - Massachusetts Institute of Technology"
```

---

## Testing

### Run Demo
```bash
node demo_computed_columns.js
```

### Test Cases
1. ✅ Parse simple expression (base fields)
2. ✅ Parse expression with joined fields
3. ✅ Parse mixed expression (base + joined)
4. ✅ Validate expression against catalog
5. ✅ Complete plan with computed columns
6. ✅ Complex multi-field expression

---

## API Reference

### ComputedExpression.ParseComputedExpression(expression)

Parses a computed expression into tokens.

**Parameters**:
- `expression` (string) - The computed expression

**Returns**:
```javascript
{
  valid: boolean,
  tokens: [
    { type: 'field', value: 'first_name' },
    { type: 'literal', value: ' ' },
    { type: 'field', value: 'last_name' }
  ]
}
```

---

### ComputedExpression.ValidateComputedExpression(expression)

Validates expression against catalog.

**Parameters**:
- `expression` (string) - The computed expression

**Returns**:
```javascript
{
  valid: boolean,
  tokens: [...],
  fields: ['first_name', 'last_name'],
  separators: [' ']
}
```

---

### ComputedExpression.BuildMongoExpression(tokens)

Builds MongoDB $concat expression.

**Parameters**:
- `tokens` (array) - Parsed tokens from ParseComputedExpression

**Returns**:
```javascript
{
  $concat: ["$first_name", " ", "$last_name"]
}
```

---

### ComputedExpression.GetRequiredJoins(fields)

Extracts entity names requiring joins.

**Parameters**:
- `fields` (array) - Array of field paths

**Returns**:
```javascript
["school", "rncp_title"]  // Unique entity names
```

---

### ComputedExpression.IsComputedExpression(fieldDef)

Checks if field definition is a computed expression.

**Parameters**:
- `fieldDef` (string) - Field definition

**Returns**:
```javascript
true  // if contains '+'
false // otherwise
```

---

## Backward Compatibility

✅ **Fully backward compatible** - All existing queries continue to work  
✅ **Optional feature** - Computed columns are opt-in  
✅ **No breaking changes** - Old column definitions work as before  

---

## Limitations

1. **String fields only** - Cannot concatenate numbers, dates, or booleans
2. **No nested expressions** - Cannot use computed expressions inside filters or sort
3. **No functions** - Cannot use MongoDB functions like `$toUpper`, `$substr`
4. **Maximum 3 joins** - Standard join limit applies

---

## Future Enhancements

Potential future features (not yet implemented):

- [ ] Support for date formatting in computed expressions
- [ ] Support for number-to-string conversion
- [ ] Support for conditional concatenation (e.g., null handling)
- [ ] Support for computed expressions in filters
- [ ] Support for MongoDB string functions

---

## Troubleshooting

### Issue: "Expression must be a non-empty string"
**Solution**: Ensure expression is provided and not null/undefined

### Issue: "Invalid token at position X"
**Solution**: Check expression follows field + 'separator' + field pattern

### Issue: "Field 'X' not found in catalog"
**Solution**: Verify field exists in catalog (use correct entity.field notation)

### Issue: "Field 'X' must be string type"
**Solution**: Only use string fields in computed expressions

### Issue: Computed column not appearing in output
**Solution**: Check that column alias is set correctly in plan

---

## Summary

Computed columns provide powerful field concatenation capabilities:

✅ **Concatenate base fields**: `first_name + ' ' + last_name`  
✅ **Concatenate joined fields**: `school.short_name + ' - ' + school.long_name`  
✅ **Mix base + joined**: `first_name + ' from ' + school.city`  
✅ **Type-safe**: Validated against catalog  
✅ **Automatic joins**: System detects and executes required joins  
✅ **Works everywhere**: Generate, Modify, Export  

The feature is production-ready and fully integrated with the v4.2 catalog-driven engine!

---

**Version**: 4.2.0  
**Date**: 2025-11-10  
**Status**: ✅ Complete
