// *************** IMPORT MODULE ***************
const DynamicTableModel = require('../models/dynamic_table.model');
const ErrorLogModel = require('../models/error_log.model');
const CatalogService = require('../services/catalog.service');
const ComputedExpression = require('../utils/computed.expression');

/**
 * BILIP V4.2 Contract Validator
 * 
 * This validator uses CatalogService as the single source of truth.
 * Supports:
 * - Student base fields (first_name, status, email)
 * - Joined entity fields (school.name, rncp_title.rncp_level, class.name)
 * - Dynamic validation based on catalog v4.2
 * - Type-safe operation checking
 */

/**
 * ValidateTableName checks if table name meets format and length requirements.
 * @param {string} tableName - The table name to validate.
 * @returns {boolean} - True if valid false otherwise.
 */
function ValidateTableName(tableName) {
  if (!tableName) return false;
  if (tableName.length > 60) return false;
  
  const allowedPattern = /^[A-Za-z0-9 _-]+$/;
  return allowedPattern.test(tableName);
}

/**
 * ValidateColumnKeys checks if all column keys are unique.
 * @param {Array} columns - Array of column definitions.
 * @returns {boolean} - True if all keys are unique.
 */
function ValidateColumnKeys(columns) {
  if (!columns || !Array.isArray(columns)) return false;
  
  const columnKeys = columns.map((col) => col.key);
  const uniqueKeys = new Set(columnKeys);
  
  return uniqueKeys.size === columnKeys.length;
}

/**
 * ValidateComputedExpression validates computed field expressions.
 * Supports multi-field concatenation with both base and joined entity fields.
 * Examples:
 * - "first_name + ' ' + last_name"
 * - "school.short_name + ' - ' + school.long_name"
 * - "first_name + ' from ' + school.city"
 * @param {string} expression - The computed expression.
 * @returns {object} - Validation result.
 */
function ValidateComputedExpression(expression) {
  // Use enhanced computed expression utility
  return ComputedExpression.ValidateComputedExpression(expression);
}

/**
 * ValidateFilterOperator checks if operator is supported and allowed for field.
 * Uses CatalogService to get allowed_ops from catalog.
 * @param {string} fieldPath - The field path (e.g., 'status' or 'school.country').
 * @param {string} operator - The filter operator.
 * @returns {object} - Validation result with valid flag and error message.
 */
function ValidateFilterOperator(fieldPath, operator) {
  // Get allowed operations from catalog
  const allowedOps = CatalogService.GetAllowedOps(fieldPath);
  
  if (!allowedOps) {
    return { 
      valid: false, 
      error: `Field ${fieldPath} not found in catalog` 
    };
  }

  if (!allowedOps.includes(operator)) {
    return { 
      valid: false, 
      error: `Operation ${operator} not allowed for field ${fieldPath}. Allowed: ${allowedOps.join(', ')}` 
    };
  }

  return { valid: true };
}

/**
 * ValidateFilterValue checks if value type matches field type.
 * @param {any} value - The filter value.
 * @param {string} fieldPath - The field path.
 * @param {string} operator - The operator.
 * @returns {object} - Validation result.
 */
function ValidateFilterValue(value, fieldPath, operator) {
  // Handle 'in' operator expecting array
  if (operator === 'in') {
    if (!Array.isArray(value)) {
      return { valid: false, error: 'Operator "in" requires array value' };
    }
    return { valid: true };
  }

  // Get field type from catalog
  const fieldType = CatalogService.GetFieldType(fieldPath);
  
  if (!fieldType) {
    return { valid: false, error: `Field ${fieldPath} not found in catalog` };
  }

  // Validate value type matches field type
  if (fieldType === 'string' && typeof value !== 'string') {
    return { valid: false, error: 'Value must be string type' };
  }

  if (fieldType === 'number' && typeof value !== 'number') {
    return { valid: false, error: 'Value must be number type' };
  }

  if (fieldType === 'boolean' && typeof value !== 'boolean') {
    return { valid: false, error: 'Value must be boolean type' };
  }

  if (fieldType === 'date' && typeof value !== 'string') {
    return { valid: false, error: 'Value must be date string' };
  }

  return { valid: true };
}

/**
 * ValidateStudentsContract validates AI-generated contract using CatalogService v4.2.
 * Fully dynamic validation supporting joins and dot-path notation.
 * @param {object} contract - The contract from AI agent.
 * @param {object} legacyCatalog - Legacy catalog object (ignored, kept for compatibility).
 * @param {string} createdByUserId - User ID creating the table.
 * @returns {Promise<object>} - Validated and normalized contract.
 * @throws {Error} - On validation failure.
 */
async function ValidateStudentsContract(contract, legacyCatalog, createdByUserId) {
  try {
    // *************** Validate required parameters
    if (!contract) {
      throw new Error('Contract is required');
    }

    if (!createdByUserId) {
      throw new Error('User ID is required');
    }

    // *************** Load catalog via CatalogService
    const catalog = CatalogService.LoadCatalog();
    const defaultEntry = CatalogService.GetDefaultEntry();

    // *************** Validate base entity
    const baseEntity = contract.base_entity || defaultEntry;
    if (baseEntity !== 'students') {
      throw new Error('Base entity must be students');
    }

    // *************** Validate table name
    if (!contract.table_name) {
      throw new Error('Table name is required');
    }

    if (!ValidateTableName(contract.table_name)) {
      throw new Error('Table name must be alphanumeric with spaces/dashes/underscores and max 60 chars');
    }

    // *************** Check table name uniqueness
    const existingTable = await DynamicTableModel.findOne({
      name: contract.table_name,
      created_by: createdByUserId,
      status: { $ne: 'deleted' },
    }).lean();

    if (existingTable) {
      throw new Error(`Table name "${contract.table_name}" already exists`);
    }

    // *************** Validate columns
    if (!contract.columns || !Array.isArray(contract.columns) || contract.columns.length === 0) {
      throw new Error('At least one column is required');
    }

    // Check column key uniqueness
    if (!ValidateColumnKeys(contract.columns)) {
      throw new Error('Column keys must be unique');
    }

    // Validate each column
    for (let i = 0; i < contract.columns.length; i++) {
      const column = contract.columns[i];

      if (!column.label) {
        throw new Error(`Column ${i} missing label`);
      }

      if (!column.key) {
        throw new Error(`Column ${i} missing key`);
      }

      if (!column.data_type) {
        throw new Error(`Column ${i} missing data_type`);
      }

      if (!column.source || !column.source.field) {
        throw new Error(`Column ${i} missing source.field`);
      }

      // Validate field path using CatalogService
      const fieldPath = column.source.field;
      
      // Check if it's a computed expression
      if (fieldPath.includes('+')) {
        const computedResult = ValidateComputedExpression(fieldPath);
        if (!computedResult.valid) {
          throw new Error(`Column ${i} computed expression invalid: ${computedResult.error}`);
        }
      } else {
        // Validate field path exists in catalog
        const fieldValid = CatalogService.ValidateFieldPath(fieldPath);
        if (!fieldValid) {
          throw new Error(`Column ${i} field path not found: ${fieldPath}`);
        }
      }

      // Ensure key matches source.field for joins
      if (column.key !== column.source.field && !fieldPath.includes('+')) {
        throw new Error(`Column ${i} key must match source.field (${column.key} !== ${column.source.field})`);
      }
    }

    // *************** Validate filters (at least 1 required)
    if (!contract.filters || !Array.isArray(contract.filters) || contract.filters.length === 0) {
      throw new Error('At least one filter is required');
    }

    // Validate each filter
    for (let i = 0; i < contract.filters.length; i++) {
      const filter = contract.filters[i];

      if (!filter.key) {
        throw new Error(`Filter ${i} missing key`);
      }

      if (!filter.operator) {
        throw new Error(`Filter ${i} missing operator`);
      }

      if (filter.value === undefined || filter.value === null) {
        throw new Error(`Filter ${i} missing value`);
      }

      // Validate field path
      const fieldValid = CatalogService.ValidateFieldPath(filter.key);
      if (!fieldValid) {
        throw new Error(`Filter ${i} field path not found: ${filter.key}`);
      }

      // Validate operator is allowed for this field
      const operatorResult = ValidateFilterOperator(filter.key, filter.operator);
      if (!operatorResult.valid) {
        throw new Error(`Filter ${i} ${operatorResult.error}`);
      }

      // Validate value type matches field type
      const valueResult = ValidateFilterValue(filter.value, filter.key, filter.operator);
      if (!valueResult.valid) {
        throw new Error(`Filter ${i} ${valueResult.error}`);
      }
    }

    // *************** Validate sort (optional)
    if (contract.sort) {
      if (Array.isArray(contract.sort)) {
        // Array format
        for (let i = 0; i < contract.sort.length; i++) {
          const sortItem = contract.sort[i];
          
          if (!sortItem.key) {
            throw new Error(`Sort ${i} missing key`);
          }

          if (!sortItem.direction) {
            throw new Error(`Sort ${i} missing direction`);
          }

          if (!['asc', 'desc'].includes(sortItem.direction)) {
            throw new Error(`Sort ${i} direction must be "asc" or "desc"`);
          }

          // Validate sort field exists
          const fieldValid = CatalogService.ValidateFieldPath(sortItem.key);
          if (!fieldValid) {
            throw new Error(`Sort ${i} field path not found: ${sortItem.key}`);
          }
        }
      } else if (typeof contract.sort === 'object') {
        // Object format (legacy)
        if (!contract.sort.key) {
          throw new Error('Sort missing key');
        }

        if (!contract.sort.dir && !contract.sort.direction) {
          throw new Error('Sort missing direction');
        }

        const direction = contract.sort.dir || contract.sort.direction;
        if (!['asc', 'desc'].includes(direction)) {
          throw new Error('Sort direction must be "asc" or "desc"');
        }

        const fieldValid = CatalogService.ValidateFieldPath(contract.sort.key);
        if (!fieldValid) {
          throw new Error(`Sort field path not found: ${contract.sort.key}`);
        }
      }
    }

    // *************** Construct validated contract
    const validatedContract = {
      table_name: contract.table_name,
      description: contract.description || '',
      base_entity: baseEntity,
      columns: contract.columns,
      filters: contract.filters,
      sort: contract.sort || null,
      limit: contract.limit || 10000,
    };

    return validatedContract;
  } catch (error) {
    // *************** Log validation error
    await ErrorLogModel.create({
      path: 'validators/contract.validator.v4.2.js',
      parameter_input: JSON.stringify({ contract, createdByUserId }),
      function_name: 'ValidateStudentsContract',
      error: String(error.stack),
    });

    throw error;
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  ValidateStudentsContract,
  ValidateTableName,
  ValidateColumnKeys,
  ValidateComputedExpression,
  ValidateFilterOperator,
  ValidateFilterValue,
};
