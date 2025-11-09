// *************** IMPORT CORE ***************
const fs = require('fs');
const path = require('path');

// *************** LOAD CATALOG ***************
const catalogPath = path.join(__dirname, '../shared/catalog/schema.catalog.json');
const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

/**
 * ParseFieldPath extracts entity and field from dot notation path.
 * Handles both students.field and entity.field formats.
 * Returns structured path components for validation and query building.
 * @param {string} fieldPath - Field path in entity.field format.
 * @returns {object} - Object with entity and field properties.
 */
function ParseFieldPath(fieldPath) {
  // *************** Validate fieldPath parameter
  if (!fieldPath) {
    return { entity: null, field: null, isValid: false };
  }

  if (typeof fieldPath !== 'string') {
    return { entity: null, field: null, isValid: false };
  }

  // *************** Check if path contains dot separator
  if (!fieldPath.includes('.')) {
    // *************** Legacy format without entity prefix
    return { entity: 'students', field: fieldPath, isValid: true };
  }

  // *************** Split path into components
  const parts = fieldPath.split('.');

  if (parts.length !== 2) {
    return { entity: null, field: null, isValid: false };
  }

  const entity = parts[0];
  const field = parts[1];

  return { entity, field, isValid: true };
}

/**
 * ValidateEntityExists checks if entity name is defined in v4 catalog.
 * Validates against students rncp_title school and class entities.
 * Returns validation result with error message if invalid.
 * @param {string} entityName - Entity name to validate.
 * @returns {object} - Object with isValid flag and optional error message.
 */
function ValidateEntityExists(entityName) {
  // *************** Validate entityName parameter
  if (!entityName) {
    return { isValid: false, error: 'Entity name is required' };
  }

  // *************** Find entity in catalog
  const entity = catalogData.entities.find((e) => e.name === entityName);

  if (!entity) {
    const validEntities = catalogData.entities.map((e) => e.name).join(', ');
    return {
      isValid: false,
      error: `Entity ${entityName} not found. Valid entities: ${validEntities}`,
    };
  }

  return { isValid: true };
}

/**
 * ValidateFieldInEntity checks if field exists in specified entity.
 * Validates field name against entity's allowed fields list from catalog.
 * Returns validation result with suggestions if field not found.
 * @param {string} entityName - Entity name containing the field.
 * @param {string} fieldName - Field name to validate.
 * @returns {object} - Object with isValid flag and optional error or suggestions.
 */
function ValidateFieldInEntity(entityName, fieldName) {
  // *************** Find entity in catalog
  const entity = catalogData.entities.find((e) => e.name === entityName);

  if (!entity) {
    return { isValid: false, error: `Entity ${entityName} not found` };
  }

  // *************** Check if field exists in entity
  const field = entity.fields.find((f) => f.name === fieldName);

  if (!field) {
    // *************** Generate suggestions from available fields
    const suggestions = entity.fields.slice(0, 5).map((f) => f.name);
    return {
      isValid: false,
      error: `Field ${fieldName} not found in ${entityName}`,
      suggestions: suggestions,
    };
  }

  return { isValid: true, fieldDefinition: field };
}

/**
 * ValidateFieldPath validates complete field path against v4 catalog.
 * Checks entity existence field existence and returns field metadata.
 * Works with both students-only paths and joined entity paths.
 * @param {string} fieldPath - Complete field path in entity.field format.
 * @returns {object} - Validation result with field definition if valid.
 */
function ValidateFieldPath(fieldPath) {
  // *************** Parse path into components
  const parsed = ParseFieldPath(fieldPath);

  if (!parsed.isValid) {
    return {
      isValid: false,
      error: `Invalid field path format: ${fieldPath}. Use entity.field notation.`,
    };
  }

  // *************** Validate entity exists
  const entityValidation = ValidateEntityExists(parsed.entity);
  if (!entityValidation.isValid) {
    return entityValidation;
  }

  // *************** Validate field exists in entity
  const fieldValidation = ValidateFieldInEntity(parsed.entity, parsed.field);
  if (!fieldValidation.isValid) {
    return fieldValidation;
  }

  // *************** Return successful validation with metadata
  return {
    isValid: true,
    entity: parsed.entity,
    field: parsed.field,
    fieldDefinition: fieldValidation.fieldDefinition,
  };
}

/**
 * CountJoinsInContract analyzes contract to count distinct joined entities.
 * Scans columns filters and sort to detect entity references beyond students.
 * Enforces max_joins_per_request constraint from v4 catalog.
 * @param {object} contract - Contract with columns filters and sort.
 * @returns {object} - Object with joinCount and joinedEntities set.
 */
function CountJoinsInContract(contract) {
  // *************** Initialize set for tracking unique joins
  const joinedEntities = new Set();

  // *************** Check columns for joined entities
  if (contract.columns && Array.isArray(contract.columns)) {
    for (let i = 0; i < contract.columns.length; i++) {
      const column = contract.columns[i];
      const sourcePath = column.source && column.source.field;

      if (sourcePath && typeof sourcePath === 'string') {
        // *************** Handle computed expressions
        if (sourcePath.includes('+')) {
          // *************** Extract paths from computed expression
          const pathPattern = /(\w+\.\w+)/g;
          const matches = sourcePath.match(pathPattern);
          if (matches) {
            for (let j = 0; j < matches.length; j++) {
              const parsed = ParseFieldPath(matches[j]);
              if (parsed.entity && parsed.entity !== 'students') {
                joinedEntities.add(parsed.entity);
              }
            }
          }
        } else {
          const parsed = ParseFieldPath(sourcePath);
          if (parsed.entity && parsed.entity !== 'students') {
            joinedEntities.add(parsed.entity);
          }
        }
      }
    }
  }

  // *************** Check filters for joined entities
  if (contract.filters && Array.isArray(contract.filters)) {
    for (let i = 0; i < contract.filters.length; i++) {
      const filter = contract.filters[i];
      if (filter.key) {
        const parsed = ParseFieldPath(filter.key);
        if (parsed.entity && parsed.entity !== 'students') {
          joinedEntities.add(parsed.entity);
        }
      }
    }
  }

  // *************** Check sort for joined entities
  if (contract.sort && contract.sort.key) {
    const parsed = ParseFieldPath(contract.sort.key);
    if (parsed.entity && parsed.entity !== 'students') {
      joinedEntities.add(parsed.entity);
    }
  }

  return {
    joinCount: joinedEntities.size,
    joinedEntities: Array.from(joinedEntities),
  };
}

/**
 * EnforceJoinLimit validates join count against v4 constraint.
 * Returns error if join count exceeds max_joins_per_request limit.
 * Provides actionable error message with current and max counts.
 * @param {number} joinCount - Number of distinct joins in contract.
 * @returns {object} - Validation result with isValid flag and error message.
 */
function EnforceJoinLimit(joinCount) {
  // *************** Get max joins constraint from catalog
  const maxJoins = catalogData.constraints.max_joins_per_request || 3;

  // *************** Check if join count exceeds limit
  if (joinCount > maxJoins) {
    return {
      isValid: false,
      error: `Too many joins. You requested ${joinCount} joins but the maximum is ${maxJoins}. Please simplify your query.`,
    };
  }

  return { isValid: true };
}

/**
 * ValidateComputedExpressionV4 validates computed expression with v4 joined paths.
 * Supports string concatenation with paths from multiple entities.
 * Validates all referenced paths exist in catalog.
 * @param {string} expression - Computed expression to validate.
 * @returns {object} - Validation result with isValid and optional error.
 */
function ValidateComputedExpressionV4(expression) {
  // *************** Validate expression parameter
  if (!expression) {
    return { isValid: false, error: 'Expression is required' };
  }

  // *************** Check for concatenation pattern
  const concatPattern = /^(.+?)\s*\+\s*'([^']*)'\s*\+\s*(.+)$/;
  const matchResult = expression.match(concatPattern);

  if (!matchResult) {
    return {
      isValid: false,
      error: 'Computed expression must be in format: path1 + separator + path2',
    };
  }

  // *************** Extract paths from expression
  const firstPath = matchResult[1].trim();
  const secondPath = matchResult[3].trim();

  // *************** Validate first path
  const firstValidation = ValidateFieldPath(firstPath);
  if (!firstValidation.isValid) {
    return {
      isValid: false,
      error: `First path invalid: ${firstValidation.error}`,
    };
  }

  // *************** Validate second path
  const secondValidation = ValidateFieldPath(secondPath);
  if (!secondValidation.isValid) {
    return {
      isValid: false,
      error: `Second path invalid: ${secondValidation.error}`,
    };
  }

  // *************** Validate both paths are string type
  if (firstValidation.fieldDefinition.type !== 'string') {
    return {
      isValid: false,
      error: `First field ${firstPath} must be string type for concatenation`,
    };
  }

  if (secondValidation.fieldDefinition.type !== 'string') {
    return {
      isValid: false,
      error: `Second field ${secondPath} must be string type for concatenation`,
    };
  }

  return { isValid: true };
}

// *************** EXPORT MODULE ***************
module.exports = {
  ParseFieldPath,
  ValidateEntityExists,
  ValidateFieldInEntity,
  ValidateFieldPath,
  CountJoinsInContract,
  EnforceJoinLimit,
  ValidateComputedExpressionV4,
};
