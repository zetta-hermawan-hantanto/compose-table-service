// *************** IMPORT MODULE ***************
const CatalogService = require('../services/catalog.service');

/**
 * Computed Expression Utility
 * 
 * Supports parsing and validating computed expressions for field concatenation.
 * Handles both base entity fields and joined entity fields.
 * 
 * Examples:
 * - "first_name + ' ' + last_name" (base fields)
 * - "school.short_name + ' - ' + school.long_name" (joined fields)
 * - "first_name + ' from ' + school.city" (mixed)
 */

/**
 * ParseComputedExpression parses a computed expression into tokens.
 * Supports: field1 + 'separator' + field2 + 'sep2' + field3 ...
 * @param {string} expression - The computed expression string.
 * @returns {object} - Parsed result with tokens array.
 */
function ParseComputedExpression(expression) {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: 'Expression must be a non-empty string' };
  }

  // *************** Regex to match field names and string literals
  // Matches: fieldName or entity.fieldName or 'string literal'
  const tokenPattern = /([\w.]+)|'([^']*)'/g;
  const tokens = [];
  let match;

  // Extract all tokens
  while ((match = tokenPattern.exec(expression)) !== null) {
    if (match[1]) {
      // Field name (could be base or joined: first_name or school.name)
      tokens.push({ type: 'field', value: match[1] });
    } else if (match[2] !== undefined) {
      // String literal (separator)
      tokens.push({ type: 'literal', value: match[2] });
    }
  }

  // *************** Validate token pattern: must be field + literal + field + literal + ...
  if (tokens.length === 0) {
    return { valid: false, error: 'Expression contains no valid tokens' };
  }

  // Check pattern: should start and end with field
  if (tokens[0].type !== 'field') {
    return { valid: false, error: 'Expression must start with a field name' };
  }

  if (tokens[tokens.length - 1].type !== 'field') {
    return { valid: false, error: 'Expression must end with a field name' };
  }

  // Check alternating pattern (field, literal, field, literal, ...)
  for (let i = 0; i < tokens.length; i++) {
    const expectedType = i % 2 === 0 ? 'field' : 'literal';
    if (tokens[i].type !== expectedType) {
      return { 
        valid: false, 
        error: `Invalid token at position ${i}: expected ${expectedType}, got ${tokens[i].type}` 
      };
    }
  }

  return { valid: true, tokens: tokens };
}

/**
 * ValidateComputedExpression validates a computed expression.
 * Checks that all field paths exist in catalog and are string type.
 * Supports both base and joined entity fields.
 * @param {string} expression - The computed expression.
 * @returns {object} - Validation result with fields array if valid.
 */
function ValidateComputedExpression(expression) {
  // *************** Parse expression into tokens
  const parseResult = ParseComputedExpression(expression);
  if (!parseResult.valid) {
    return { valid: false, error: parseResult.error };
  }

  const tokens = parseResult.tokens;
  const fields = tokens.filter(t => t.type === 'field').map(t => t.value);

  // *************** Validate each field exists in catalog
  for (let i = 0; i < fields.length; i++) {
    const fieldPath = fields[i];

    // Check field exists using CatalogService
    const fieldValid = CatalogService.ValidateFieldPath(fieldPath);
    if (!fieldValid) {
      return { 
        valid: false, 
        error: `Field '${fieldPath}' not found in catalog` 
      };
    }

    // Check field is string type
    const fieldType = CatalogService.GetFieldType(fieldPath);
    if (fieldType !== 'string') {
      return { 
        valid: false, 
        error: `Field '${fieldPath}' must be string type for concatenation (found: ${fieldType})` 
      };
    }
  }

  // *************** Return valid result with metadata
  return { 
    valid: true, 
    tokens: tokens,
    fields: fields,
    separators: tokens.filter(t => t.type === 'literal').map(t => t.value)
  };
}

/**
 * BuildMongoExpression builds MongoDB $concat expression from parsed tokens.
 * Converts: "first_name + ' ' + last_name" 
 * Into: { $concat: ["$first_name", " ", "$last_name"] }
 * Handles joined fields: "school.short_name" → "$school.short_name"
 * @param {Array} tokens - Parsed tokens from ParseComputedExpression.
 * @returns {object} - MongoDB aggregation expression.
 */
function BuildMongoExpression(tokens) {
  if (!tokens || tokens.length === 0) {
    return null;
  }

  // *************** Build $concat array
  const concatArray = tokens.map(token => {
    if (token.type === 'field') {
      // Field reference: add $ prefix
      return `$${token.value}`;
    } else {
      // String literal: use as-is
      return token.value;
    }
  });

  // *************** Construct MongoDB expression
  return {
    $concat: concatArray
  };
}

/**
 * GetRequiredJoins extracts entity names from joined field paths in expression.
 * Example: "school.short_name + ' - ' + school.long_name" → ["school"]
 * @param {Array} fields - Array of field paths from validated expression.
 * @returns {Array<string>} - Unique entity names requiring joins.
 */
function GetRequiredJoins(fields) {
  const joins = new Set();

  for (let i = 0; i < fields.length; i++) {
    const fieldPath = fields[i];
    
    // Check if it's a joined field (contains dot)
    if (fieldPath.includes('.')) {
      const entityName = fieldPath.split('.')[0];
      joins.add(entityName);
    }
  }

  return Array.from(joins);
}

/**
 * IsComputedExpression checks if a field definition is a computed expression.
 * @param {string} fieldDef - Field definition string.
 * @returns {boolean} - True if contains concatenation (+).
 */
function IsComputedExpression(fieldDef) {
  return typeof fieldDef === 'string' && fieldDef.includes('+');
}

/**
 * NormalizeExpression normalizes whitespace in expression for consistent parsing.
 * @param {string} expression - Raw expression string.
 * @returns {string} - Normalized expression.
 */
function NormalizeExpression(expression) {
  if (!expression) return expression;
  
  // Normalize whitespace around + operators
  return expression.trim().replace(/\s*\+\s*/g, ' + ');
}

// *************** EXPORT MODULE ***************
module.exports = {
  ParseComputedExpression,
  ValidateComputedExpression,
  BuildMongoExpression,
  GetRequiredJoins,
  IsComputedExpression,
  NormalizeExpression,
};
