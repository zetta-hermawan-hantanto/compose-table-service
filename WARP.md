# Pendekar Backend Law

> **Purpose:** This document defines the unified backend development standard for Team Pendekar during Zettathon 2025. All backend code, whether human-written or AI-generated, must strictly comply with these laws. No exceptions.

---

## 1. Core Principles

1. **Readability > Cleverness** — Code must read like a story, clear even for junior developers.
2. **Validation-First** — Always validate inputs before any database or logic execution.
3. **No Nested Functions** — Each helper must be top-level, never defined inside another function.
4. **Fail Early** — Throw errors immediately when validation fails.
5. **Descriptive Naming** — Every variable, function, and file must explain its purpose clearly.
6. **Error Logging Discipline** — Every caught error must be logged into `ErrorLogModel` with path, params, and stack trace.
7. **Consistency is Law** — All agents and developers follow the same structure, naming, and comment patterns.

---

## 2. File Structure and Sectioning

Every backend file must follow the exact section order below. Each header must use full capital stars for visibility. These headers are used **only** for file-level structure (imports, module sections, and exports), **not inside function logic.**

| Section Header | Description |
|----------------|--------------|
| `// *************** IMPORT CORE ***************` | Node core modules or environment configs. |
| `// *************** IMPORT LIBRARY ***************` | Third-party dependencies (e.g., express, mongoose). |
| `// *************** IMPORT MODULE ***************` | Internal module imports (queries, mutations, etc.). |
| `// *************** IMPORT UTILITIES ***************` | Reusable global utility functions. |
| `// *************** IMPORT HELPER FUNCTION ***************` | Module-specific helper logic. |
| `// *************** IMPORT VALIDATOR ***************` | Validation functions for this module. |
| `// *************** QUERY ***************` | Query functions (data retrieval only). |
| `// *************** MUTATION ***************` | Mutation functions (data changes). |
| `// *************** LOADER ***************` | Data loaders for caching/batching. |
| `// *************** EXPORT MODULE ***************` | Module export definitions. |

---

## 3. Comment and Documentation Rules

### 3.1 Banner Comments for File Segmentation
These are used **only** at the top level of a file (imports, exports, structure). They are not used inside function bodies.

### 3.2 Inline Process Comments Inside Functions
When writing logic inside functions, each logical block must be preceded by a comment line explaining **what** or **why** that block exists. The format remains consistent:

```js
// *************** <describe what or why above this code>
```

Example:

```js
async function GetStudentDetails(student_id) {
  try {
    // *************** Validate parameter student_id
    if (!student_id) throw new ApolloError('Missing student_id');

    // *************** Retrieve the student by id
    const student = await StudentModel.findById(student_id);

    if (!student) throw new ApolloError('Student not found');

    // *************** Construct the data to align with output format
    const formattedData = {
      full_name: `${student.first_name} ${student.last_name}`,
    };

    return formattedData;
  } catch (error) {
    await ErrorLogModel.create({
      path: 'services/StudentService.js',
      parameter_input: JSON.stringify({ student_id }),
      function_name: 'GetStudentDetails',
      error: String(error.stack),
    });
    throw new ApolloError(error.message);
  }
}
```

### 3.3 Function Documentation (JSDoc Required)
Each function must include full JSDoc explaining purpose, rationale, params, return type, and error handling.

```js
/**
 * CreateUser handles user registration logic.
 * @param {object} params - Includes name, email, and password.
 * @returns {object} - Created user document.
 * @throws {ApolloError} - If validation fails or DB error occurs.
 */
```

### 3.4 Schema Comments
Inside model/schema files, each field must have a one-line comment **without stars**.

```js
const StudentSchema = new Schema({
  // Student first name
  first_name: String,
  // Student last name
  last_name: String,
});
```

---

## 4. Naming Conventions

| Context | Style | Example |
|----------|--------|---------|
| **Queries / Mutations / Utilities / Helpers** | PascalCase | `GetStudentDetails`, `UpdateProfile`, `FormatDate` |
| **Variables** | camelCase | `studentData`, `enrollmentCount` |
| **Schema Fields** | snake_case | `created_at`, `student_name` |
| **Typedefs / GraphQL Types** | snake_case | `student_program_type` |
| **Constants / Jobs** | SCREAMING_SNAKE_CASE | `SEND_READMISSION_REMINDER` |

---

## 5. Validation Rules

1. All functions must begin with validation.
2. Guards must be explicit using `if (!param)` patterns — **no optional chaining**.
3. Use meaningful validation messages with context.
4. Fail early, stop execution immediately on invalid inputs.

---

## 6. Error Handling Protocol

Every function (except pure validators) must have try/catch. Upon catching, log the error then rethrow.

```js
try {
  // Logic flow
} catch (error) {
  await ErrorLogModel.create({
    path: 'controllers/UserController.js',
    parameter_input: JSON.stringify({ user_id }),
    function_name: 'GetUserDetails',
    error: String(error.stack),
  });
  throw new ApolloError(error.message);
}
```

---

## 7. Function Writing Flow

All functions must follow the linear structure below:

1. **Validation** — Input checks.
2. **Query** — Retrieve required data.
3. **Transformation** — Apply logic or manipulation.
4. **Output** — Construct named variable and return it.

---

## 8. AI Agent Development Rules

When AI (MCP or other agents) generates code:

1. Must follow **this WARP.md** strictly — same sectioning, naming, and comment style.
2. Must use **banner headers only for file-level structure**.
3. Must use **inline process comments** (`// *************** <comment>`) for in-function logic.
4. Must **never** create nested functions or anonymous one-liners.
5. Must generate **JSDoc** and clear comments for every function.
6. Must follow **validation → query → transformation → output** flow.
7. Must include **explicit error handling** and logging.
8. Must avoid shortcuts, optional chaining, or inline return objects.
9. Must write clean, readable logic with meaningful variable names.

---

## 9. Code Ownership and Review

- Every commit must respect this convention. Violations are rejected.
- PR reviewers (human or AI) must check for section headers, validation, and error logs.
- AI-generated code is subject to the same scrutiny as human code.

---

## 10. Summary

This **Pendekar Backend Law** defines how every backend line should be written, documented, validated, and reviewed. It ensures that all human and AI agents produce uniform, scalable, and maintainable code under one standard — the WARP Protocol.

> Obey the structure. Respect the banner. Write code that reads like a story.

---

## 11. Project-Specific Information

This project is an **Express.js REST API** service with MongoDB. For architecture, commands, and technical details, see **PROJECT.md**.

### Quick Commands
```bash
# Development
npm run dev

# Production
npm start
```

### Key Technologies
- Express.js v5 (CommonJS)
- MongoDB + Mongoose
- Joi validation
- Nodemon for development

