# BILIP v4.2 Architecture Guide

## Table of Contents
1. [Overview](#overview)
2. [Catalog Structure](#catalog-structure)
3. [Plan Format](#plan-format)
4. [Core Engine](#core-engine)
5. [Pipeline Generation](#pipeline-generation)
6. [Service Integration](#service-integration)
7. [Extension Guide](#extension-guide)
8. [API Reference](#api-reference)
9. [Best Practices](#best-practices)

---

## Overview

BILIP v4.2 is a **catalog-driven, fully dynamic AI Data Composer** that transforms natural language requests into optimized MongoDB aggregation pipelines.

### Key Principles

1. **Single Source of Truth**: The catalog (`schema.catalog.json`) defines all entities, fields, and relations
2. **Type-Safe Validation**: Operations are validated against field-specific `allowed_ops`
3. **Automatic Join Detection**: System infers joins from field paths (e.g., `school.city`)
4. **Optimized Execution**: Filters are separated (PreMatch/PostMatch) for performance
5. **Extensible by Design**: Add new entities by updating catalog only

### Architecture Layers

```
┌─────────────────────────────────────────┐
│         LLM / Natural Language          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Plan (JSON Contract)            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Validation Layer (Type-Safe)       │
│  • PlanValidator                        │
│  • CatalogService                       │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Planning Layer (Join Detection)    │
│  • JoinPlanner                          │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│    Execution Layer (Pipeline Builder)   │
│  • AggregationBuilder v2                │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       MongoDB Aggregation Pipeline      │
└─────────────────────────────────────────┘
```

---

## Catalog Structure

### Overview

The catalog (`src/shared/catalog/schema.catalog.json`) is a JSON file that describes:
- **Entities**: Collections (students, school, rncp_title, class)
- **Fields**: With types, allowed operations, and enums
- **Relations**: How entities connect (1:1, 1:many)
- **Constraints**: Global limits (max joins, row cap)

### Catalog Schema

```json
{
  "version": "4.2.0",
  "version_date": "2025-11-10",
  "description": "BILIP v4.2 Catalog",
  "default_entry": "students",
  "entities": [ /* entity definitions */ ],
  "relations": [ /* relation definitions */ ],
  "constraints": { /* global limits */ }
}
```

### Entity Definition

```json
{
  "name": "students",
  "collection": "students",
  "title": "Students",
  "description": "Core student profile records",
  "primary_key": "_id",
  "is_entry": true,
  "index_hints": ["school_1", "status_1"],
  "fields": [
    {
      "name": "status",
      "type": "string",
      "enum": ["active", "pending", "deleted"],
      "allowed_ops": ["eq", "ne", "in"]
    }
  ]
}
```

### Field Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | ✅ | Field name in database |
| `type` | string | ✅ | Data type (string, number, boolean, date, objectId) |
| `allowed_ops` | array | ✅ | Allowed filter operations |
| `enum` | array | ❌ | Allowed values for enum fields |
| `ref` | string | ❌ | Referenced entity for ObjectId fields |
| `computed` | string | ❌ | Description for computed fields |

### Allowed Operations

| Operation | MongoDB | Use Case |
|-----------|---------|----------|
| `eq` | `value` | Exact match |
| `ne` | `{$ne: value}` | Not equal |
| `in` | `{$in: [values]}` | Match any in list |
| `contains` | `{$regex: value, $options: 'i'}` | Case-insensitive substring |
| `gte` | `{$gte: value}` | Greater than or equal |
| `lte` | `{$lte: value}` | Less than or equal |
| `gt` | `{$gt: value}` | Greater than |
| `lt` | `{$lt: value}` | Less than |

### Relation Definition

```json
{
  "from": "students.school",
  "to": "school._id",
  "type": "one_to_one",
  "alias": "school",
  "collection": "schools",
  "foreign_field": "_id",
  "local_field": "school",
  "preserve_nulls": true,
  "pipeline_extensions": [ /* optional $addFields stages */ ]
}
```

### Constraints

```json
{
  "max_columns_per_table": 30,
  "max_filters_per_request": 10,
  "max_joins_per_request": 3,
  "max_row_cap": 10000
}
```

---

## Plan Format

### Plan Schema

A plan is a JSON object that describes what data to retrieve:

```json
{
  "entry": "students",
  "columns": [
    {
      "path": "first_name",
      "alias": "first_name"
    },
    {
      "path": "school.city",
      "alias": "school_city"
    }
  ],
  "filters": [
    {
      "path": "status",
      "op": "eq",
      "value": "active"
    },
    {
      "path": "school.country",
      "op": "eq",
      "value": "France"
    }
  ],
  "sort": [
    {
      "path": "last_name",
      "dir": "asc"
    }
  ],
  "limit": 1000,
  "metadata": {
    "intent": "generate_table",
    "explanation": "Active students in France"
  }
}
```

### Plan Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `entry` | string | ❌ | Entry entity (defaults to catalog default) |
| `columns` | array | ✅ | Columns to include |
| `filters` | array | ❌ | Filter conditions |
| `sort` | array/object | ❌ | Sort configuration |
| `limit` | number | ❌ | Row limit (capped at max_row_cap) |
| `metadata` | object | ❌ | Optional metadata for logging |

### Column Specification

```json
{
  "path": "school.city",    // Field path (entity.field or just field)
  "alias": "school_city"    // Output field name
}
```

### Filter Specification

```json
{
  "path": "school.country", // Field path
  "op": "eq",               // Operation (must be in allowed_ops)
  "value": "France"         // Filter value
}
```

### Sort Specification

```json
{
  "path": "last_name",      // Field path
  "dir": "asc"              // Direction: "asc" or "desc"
}
```

---

## Core Engine

### Component Overview

#### 1. CatalogService
**Purpose**: Centralized catalog query API  
**File**: `src/services/catalog.service.js`

```javascript
const CatalogService = require('./services/catalog.service');

// Load catalog (cached)
const catalog = CatalogService.LoadCatalog();

// Get entity
const entity = CatalogService.GetEntity('students');

// Validate field path
const isValid = CatalogService.ValidateFieldPath('school.city');

// Get allowed operations
const ops = CatalogService.GetAllowedOps('status');
// Returns: ['eq', 'ne', 'in']
```

#### 2. PlanValidator
**Purpose**: Validate plans against catalog  
**File**: `src/validators/plan.validator.js`

```javascript
const PlanValidator = require('./validators/plan.validator');

const validation = PlanValidator.ValidatePlan(plan);

if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
  // errors: [
  //   "Operation gte not allowed for field status",
  //   "Column path not found: invalid.field"
  // ]
}
```

#### 3. JoinPlanner
**Purpose**: Detect and plan joins from field paths  
**File**: `src/services/join.planner.js`

```javascript
const JoinPlanner = require('./services/join.planner');

const joinPlan = JoinPlanner.PlanJoins(plan);

// Result:
// {
//   joins: [
//     {
//       alias: 'school',
//       collection: 'schools',
//       localField: 'school',
//       foreignField: '_id',
//       preserveNulls: true
//     }
//   ],
//   joinCount: 1,
//   requiredAliases: ['school']
// }
```

#### 4. AggregationBuilder v2
**Purpose**: Generate MongoDB aggregation pipeline  
**File**: `src/utils/aggregation.builder.v2.js`

```javascript
const AggregationBuilder = require('./utils/aggregation.builder.v2');

const pipeline = AggregationBuilder.BuildPipeline(plan, joinPlan);

// Result: Array of MongoDB stages
// [
//   {$match: {status: 'active'}},
//   {$lookup: {from: 'schools', ...}},
//   {$unwind: {path: '$school', ...}},
//   {$match: {'school.country': 'France'}},
//   {$project: {first_name: '$first_name', ...}},
//   {$limit: 1000}
// ]
```

---

## Pipeline Generation

### Stage Sequence

Pipelines are built in strict order:

1. **PreMatch** - Filter base entity before joins
2. **Lookups** - Join related entities
3. **Unwind** - Flatten joined arrays
4. **PostMatch** - Filter on joined entity fields
5. **Project** - Select columns with aliases
6. **Sort** - Order results
7. **Limit** - Cap row count

### Filter Separation

Filters are automatically separated for optimization:

**Base Filters** (PreMatch):
- Filters on entry entity fields
- Applied BEFORE joins
- Reduces documents early

**Joined Filters** (PostMatch):
- Filters on joined entity fields
- Applied AFTER joins
- Filters on joined data

Example:
```javascript
// Plan filters:
[
  {path: 'status', op: 'eq', value: 'active'},          // Base
  {path: 'school.country', op: 'eq', value: 'France'}   // Joined
]

// Separated:
// PreMatch: {status: 'active'}
// PostMatch: {'school.country': 'France'}
```

### Pipeline Optimization

- **Index Hints**: Use `index_hints` from catalog
- **Early Filtering**: PreMatch reduces pipeline input
- **Selective Joins**: Only joins referenced entities
- **1:1 Safety**: `preserveNullAndEmptyArrays: true`

---

## Service Integration

### Generate Table Service

**File**: `src/services/chat.service.js`

```javascript
const PlanValidator = require('../validators/plan.validator');
const JoinPlanner = require('../services/join.planner');
const AggregationBuilder = require('../utils/aggregation.builder.v2');
const StudentModel = require('../models/student.model');
const DynamicTableModel = require('../models/dynamic_table.model');

async function HandleGenerateTable(llmPlan, userId) {
  // Step 1: Validate plan
  const validation = PlanValidator.ValidatePlan(llmPlan);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }

  // Step 2: Plan joins
  const joinPlan = JoinPlanner.PlanJoins(llmPlan);

  // Step 3: Build pipeline
  const pipeline = AggregationBuilder.BuildPipeline(llmPlan, joinPlan);

  // Step 4: Execute
  const rows = await StudentModel.aggregate(pipeline);

  // Step 5: Store table + metadata
  const table = await DynamicTableModel.create({
    name: llmPlan.table_name || 'Untitled Table',
    description: llmPlan.metadata?.explanation || '',
    columns: llmPlan.columns,
    filters: llmPlan.filters,
    sort: llmPlan.sort,
    created_by: userId,
    status: 'active',
    plan_metadata: {
      plan: llmPlan,
      pipeline: pipeline,
      join_plan: joinPlan
    }
  });

  // Step 6: Store rows
  const rowDocs = rows.map(row => ({
    dynamic_table_id: table._id,
    data: row,
    status: 'active'
  }));
  
  await DynamicRowTableModel.insertMany(rowDocs);

  return {
    table_id: table._id,
    row_count: rows.length,
    join_count: joinPlan.joinCount
  };
}
```

### Modify Table Service

```javascript
async function HandleModifyTable(tableId, changes, userId) {
  // Step 1: Load existing table
  const table = await DynamicTableModel.findById(tableId);
  if (!table || table.created_by.toString() !== userId.toString()) {
    throw new Error('Table not found');
  }

  // Step 2: Load stored plan
  const existingPlan = table.plan_metadata?.plan || {
    entry: 'students',
    columns: table.columns,
    filters: table.filters,
    sort: table.sort
  };

  // Step 3: Apply changes
  const updatedPlan = ApplyChangesToPlan(existingPlan, changes);

  // Step 4: Validate updated plan
  const validation = PlanValidator.ValidatePlan(updatedPlan);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }

  // Step 5: Plan joins
  const joinPlan = JoinPlanner.PlanJoins(updatedPlan);

  // Step 6: Build pipeline
  const pipeline = AggregationBuilder.BuildPipeline(updatedPlan, joinPlan);

  // Step 7: Execute
  const rows = await StudentModel.aggregate(pipeline);

  // Step 8: Update table
  await DynamicTableModel.updateOne(
    { _id: tableId },
    {
      columns: updatedPlan.columns,
      filters: updatedPlan.filters,
      sort: updatedPlan.sort,
      plan_metadata: {
        plan: updatedPlan,
        pipeline: pipeline,
        join_plan: joinPlan
      }
    }
  );

  // Step 9: Replace rows
  await DynamicRowTableModel.deleteMany({ dynamic_table_id: tableId });
  await DynamicRowTableModel.insertMany(
    rows.map(row => ({
      dynamic_table_id: tableId,
      data: row,
      status: 'active'
    }))
  );

  return { row_count: rows.length };
}
```

### Export Service

```javascript
async function HandleExportTable(exportPlan, userEmail) {
  // Step 1: Validate plan
  const validation = PlanValidator.ValidatePlan(exportPlan);
  if (!validation.isValid) {
    throw new Error(validation.errors.join('; '));
  }

  // Step 2: Plan joins
  const joinPlan = JoinPlanner.PlanJoins(exportPlan);

  // Step 3: Build pipeline
  const pipeline = AggregationBuilder.BuildPipeline(exportPlan, joinPlan);

  // Step 4: Stream cursor (memory efficient)
  const cursor = StudentModel.aggregate(pipeline).cursor();

  // Step 5: Generate CSV
  const csvPath = await GenerateCSV(cursor, exportPlan.columns);

  // Step 6: Send email with signed URL
  await SendEmailWithAttachment(userEmail, csvPath);

  return { success: true };
}
```

---

## Extension Guide

### Adding a New Entity

Follow these steps to add a new entity (e.g., `teacher`):

#### Step 1: Update Catalog

Add entity to `src/shared/catalog/schema.catalog.json`:

```json
{
  "name": "teacher",
  "collection": "teachers",
  "title": "Teacher",
  "description": "Teaching staff records",
  "primary_key": "_id",
  "is_entry": false,
  "index_hints": ["status_1"],
  "fields": [
    {
      "name": "first_name",
      "type": "string",
      "allowed_ops": ["eq", "ne", "in", "contains"]
    },
    {
      "name": "email",
      "type": "string",
      "allowed_ops": ["eq", "ne", "in", "contains"]
    }
  ]
}
```

#### Step 2: Add Relation

```json
{
  "from": "students.teacher",
  "to": "teacher._id",
  "type": "one_to_one",
  "alias": "teacher",
  "collection": "teachers",
  "foreign_field": "_id",
  "local_field": "teacher",
  "preserve_nulls": true
}
```

#### Step 3: Update MCP (Optional)

If using MCP, update the catalog response to include the new entity fields.

#### Step 4: Test

```javascript
const plan = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'student_name' },
    { path: 'teacher.first_name', alias: 'teacher_name' }
  ],
  filters: [
    { path: 'status', op: 'eq', value: 'active' }
  ],
  limit: 100
};

// Validation will pass
// Join will be detected automatically
// Pipeline will include teacher $lookup
```

**That's it!** No code changes needed.

---

## API Reference

### CatalogService API

```javascript
// Load catalog (cached)
LoadCatalog(): object

// Entity queries
GetEntity(entityName: string): object|null
GetField(entityName: string, fieldName: string): object|null
GetRelation(alias: string): object|null

// Path operations
ResolveFieldPath(fieldPath: string): {entityName, fieldName}
ValidateFieldPath(fieldPath: string): boolean

// Field metadata
GetAllowedOps(fieldPath: string): string[]
GetFieldType(fieldPath: string): string

// Configuration
GetConstraints(): object
GetDefaultEntry(): string
ListEntities(): string[]
IsEntryEntity(entityName: string): boolean

// Cache management
ResetCache(): void
```

### PlanValidator API

```javascript
// Main validation
ValidatePlan(plan: object): {isValid, errors, warnings}

// Component validation
ValidateEntry(entry: string): {isValid, errors}
ValidateColumns(columns: array): {isValid, errors, warnings}
ValidateFilters(filters: array): {isValid, errors}
ValidateSort(sort: array|object): {isValid, errors}
ValidateConstraints(plan: object): {isValid, errors}

// Utilities
CountJoinsInPlan(plan: object): number
```

### JoinPlanner API

```javascript
// Main planning
PlanJoins(plan: object): {joins, joinCount, requiredAliases}

// Component operations
ExtractAllPaths(plan: object): string[]
DetectRequiredJoins(paths: string[]): Set<string>
BuildJoinMetadata(alias: string): object
SeparateFilters(filters: array, joinedAliases: Set): {baseFilters, joinedFilters}

// Utilities
GetJoinedEntities(plan: object): string[]
ValidateJoinConfiguration(plan: object): {isValid, errors}
```

### AggregationBuilder API

```javascript
// Main builder
BuildPipeline(plan: object, joinPlan: object): array

// Stage builders
BuildPreMatchStage(filters: array): object|null
BuildLookupStages(joins: array): array
BuildUnwindStages(joins: array): array
BuildPostMatchStage(filters: array): object|null
BuildProjectStage(columns: array, joins: array): object|null
BuildSortStage(sort: array|object): object|null
BuildLimitStage(limit: number): object

// Utilities
BuildFieldPath(path: string): string
BuildFilterCondition(op: string, value: any): any
ExplainPipeline(pipeline: array): string
```

---

## Best Practices

### 1. Always Validate Before Building

```javascript
// ✅ Good
const validation = PlanValidator.ValidatePlan(plan);
if (!validation.isValid) {
  return { error: validation.errors };
}
const joinPlan = JoinPlanner.PlanJoins(plan);

// ❌ Bad
const joinPlan = JoinPlanner.PlanJoins(plan); // May fail without validation
```

### 2. Store Plan Metadata

```javascript
// ✅ Good - Store plan for modify operations
await DynamicTableModel.create({
  name: 'Table',
  plan_metadata: {
    plan: llmPlan,
    pipeline: pipeline,
    join_plan: joinPlan
  }
});

// ❌ Bad - No plan stored, modify operations become difficult
await DynamicTableModel.create({
  name: 'Table',
  columns: llmPlan.columns
});
```

### 3. Use Explain for Debugging

```javascript
const pipeline = AggregationBuilder.BuildPipeline(plan, joinPlan);
console.log(AggregationBuilder.ExplainPipeline(pipeline));
// Stage 1: Match (1 filter(s))
// Stage 2: Lookup schools as school
// Stage 3: Unwind $school
// Stage 4: Project (3 field(s))
// Stage 5: Limit 100 rows
```

### 4. Handle Errors Gracefully

```javascript
try {
  const validation = PlanValidator.ValidatePlan(plan);
  if (!validation.isValid) {
    return { status: 'failed', errors: validation.errors };
  }
  
  const joinPlan = JoinPlanner.PlanJoins(plan);
  const pipeline = AggregationBuilder.BuildPipeline(plan, joinPlan);
  
  const results = await StudentModel.aggregate(pipeline);
  return { status: 'success', results };
  
} catch (error) {
  await ErrorLogModel.create({
    path: 'services/table.service.js',
    function_name: 'HandleGenerateTable',
    error: error.stack
  });
  return { status: 'error', message: error.message };
}
```

### 5. Reset Cache in Tests

```javascript
// In test setup/teardown
afterEach(() => {
  CatalogService.ResetCache();
});
```

---

## Conclusion

BILIP v4.2 provides a **complete, catalog-driven framework** for building dynamic, type-safe table generation systems. By following this architecture guide, you can:

- Build new features without modifying core code
- Add entities by updating catalog only
- Maintain type safety throughout the stack
- Generate optimized MongoDB pipelines automatically
- Scale horizontally as data grows

For questions or contributions, refer to:
- `BILIP_V4.2_CORE_COMPLETE.md` - Implementation status
- `BILIP_V4.2_STATUS.md` - Full roadmap
- `demo_v4.2_engine.js` - Working examples

---

**Version**: 4.2.0  
**Last Updated**: 2025-11-10  
**Status**: Production Ready
