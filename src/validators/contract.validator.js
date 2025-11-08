// *************** IMPORT MODULE ***************
const DynamicTableModel = require('../models/dynamic_table.model');
const ErrorLogModel = require('../models/error_log.model');

/**
 * ValidateTableName checks if table name meets format and length requirements.
 * Table name must be alphanumeric with spaces dashes and underscores only.
 * @param {string} tableName - The table name to validate.
 * @returns {boolean} - True if valid false otherwise.
 */
function ValidateTableName(tableName) {
  // *************** Validate table name parameter
  if (!tableName) {
    return false;
  }

  // *************** Check length constraint
  if (tableName.length > 60) {
    return false;
  }

  // *************** Check allowed characters pattern
  const allowedPattern = /^[A-Za-z0-9 _-]+$/;
  const isPatternValid = allowedPattern.test(tableName);

  return isPatternValid;
}

/**
 * ValidateColumnKeys checks if all column keys are unique within the columns array.
 * Duplicate keys are not allowed and will cause data integrity issues.
 * @param {Array} columns - Array of column definitions.
 * @returns {boolean} - True if all keys are unique false if duplicates found.
 */
function ValidateColumnKeys(columns) {
  // *************** Validate columns parameter
  if (!columns) {
    return false;
  }

  if (!Array.isArray(columns)) {
    return false;
  }

  // *************** Extract all column keys
  const columnKeys = columns.map((col) => col.key);

  // *************** Check for duplicates using Set
  const uniqueKeys = new Set(columnKeys);
  const hasDuplicates = uniqueKeys.size !== columnKeys.length;

  return !hasDuplicates;
}

/**
 * ValidateComputedExpression checks if computed field expression is valid.
 * Only supports simple string concatenation format field1 + separator + field2.
 * @param {string} expression - The computed expression to validate.
 * @param {object} catalog - The catalog object containing field definitions.
 * @returns {object} - Object with valid flag and optional error message.
 */
function ValidateComputedExpression(expression, catalog) {
  // *************** Validate expression parameter
  if (!expression) {
    return { valid: false, error: 'Expression is required' };
  }

  // *************** Check for simple concatenation pattern
  const concatPattern = /^(\w+)\s*\+\s*'([^']*)'\s*\+\s*(\w+)$/;
  const matchResult = expression.match(concatPattern);

  if (!matchResult) {
    return { valid: false, error: 'Computed expression must be in format: field1 + separator + field2' };
  }

  // *************** Extract field names from expression
  const firstField = matchResult[1];
  const secondField = matchResult[3];

  // *************** Find fields in catalog
  const firstFieldExists = catalog.fields.some((field) => field.key === firstField);
  const secondFieldExists = catalog.fields.some((field) => field.key === secondField);

  if (!firstFieldExists) {
    return { valid: false, error: `Field ${firstField} not found in catalog` };
  }

  if (!secondFieldExists) {
    return { valid: false, error: `Field ${secondField} not found in catalog` };
  }

  // *************** Validate both fields are string type
  const firstFieldDef = catalog.fields.find((field) => field.key === firstField);
  const secondFieldDef = catalog.fields.find((field) => field.key === secondField);

  if (firstFieldDef.data_type !== 'string') {
    return { valid: false, error: `Field ${firstField} must be string type for concatenation` };
  }

  if (secondFieldDef.data_type !== 'string') {
    return { valid: false, error: `Field ${secondField} must be string type for concatenation` };
  }

  return { valid: true };
}

/**
 * ValidateFilterOperator checks if filter operator is supported in v1.
 * Allowed operators are eq ne in contains gte lte.
 * @param {string} operator - The filter operator to validate.
 * @returns {boolean} - True if operator is valid false otherwise.
 */
function ValidateFilterOperator(operator) {
  // *************** Define allowed operators for v1
  const allowedOperators = ['eq', 'ne', 'in', 'contains', 'gte', 'lte'];

  // *************** Check if operator is in allowed list
  const isValid = allowedOperators.includes(operator);

  return isValid;
}

/**
 * ValidateFilterValue checks if filter value type matches the catalog field type.
 * Ensures type compatibility to prevent query errors.
 * @param {any} value - The filter value to validate.
 * @param {string} fieldType - The expected field type from catalog.
 * @param {string} operator - The filter operator being used.
 * @returns {object} - Object with valid flag and optional error message.
 */
function ValidateFilterValue(value, fieldType, operator) {
  // *************** Handle in operator expecting array value
  if (operator === 'in') {
    if (!Array.isArray(value)) {
      return { valid: false, error: 'Operator in requires array value' };
    }
    return { valid: true };
  }

  // *************** Validate value based on field type
  if (fieldType === 'string') {
    if (typeof value !== 'string') {
      return { valid: false, error: 'Value must be string type' };
    }
  }

  if (fieldType === 'number') {
    if (typeof value !== 'number') {
      return { valid: false, error: 'Value must be number type' };
    }
  }

  if (fieldType === 'boolean') {
    if (typeof value !== 'boolean') {
      return { valid: false, error: 'Value must be boolean type' };
    }
  }

  if (fieldType === 'date') {
    if (typeof value !== 'string') {
      return { valid: false, error: 'Value must be date string' };
    }
  }

  return { valid: true };
}

/**
 * ValidateStudentsContract validates AI-generated contract against all business rules.
 * Performs comprehensive validation including field existence type compatibility and uniqueness.
 * Throws Error immediately on any validation failure after logging to ErrorLogModel.
 * @param {object} contract - The contract object from AI agent.
 * @param {object} catalog - The catalog object containing students metadata.
 * @param {string} createdByUserId - The user ID creating the table.
 * @returns {Promise<object>} - Promise resolving to validated and normalized contract.
 * @throws {Error} - On any validation failure with descriptive message.
 */
async function ValidateStudentsContract(contract, catalog, createdByUserId) {
  try {
    // *************** Validate contract parameter
    if (!contract) {
      throw new Error('Contract is required');
    }

    if (!catalog) {
      throw new Error('Catalog is required');
    }

    if (!createdByUserId) {
      throw new Error('User ID is required');
    }

    // *************** Validate base entity
    if (contract.base_entity !== 'students') {
      throw new Error('Base entity must be students in v1');
    }

    // *************** Validate table name format
    if (!contract.table_name) {
      throw new Error('Table name is required');
    }

    const isTableNameValid = ValidateTableName(contract.table_name);
    if (!isTableNameValid) {
      throw new Error('Table name must be max 60 chars and contain only alphanumeric characters spaces dashes and underscores');
    }

    // *************** Validate table name uniqueness for user
    const existingTable = await DynamicTableModel.findOne({
      name: contract.table_name,
      created_by: createdByUserId,
      status: 'active',
    });

    if (existingTable) {
      throw new Error('Table name already exists. Choose a different name.');
    }

    // *************** Validate columns array
    if (!contract.columns) {
      throw new Error('Columns array is required');
    }

    if (!Array.isArray(contract.columns)) {
      throw new Error('Columns must be an array');
    }

    if (contract.columns.length === 0) {
      throw new Error('At least one column is required');
    }

    // *************** Validate column keys uniqueness
    const areKeysUnique = ValidateColumnKeys(contract.columns);
    if (!areKeysUnique) {
      throw new Error('Column keys must be unique');
    }

    // *************** Validate each column definition
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

      const allowedDataTypes = ['string', 'number', 'boolean', 'date'];
      if (!allowedDataTypes.includes(column.data_type)) {
        throw new Error(`Column ${i} data_type must be one of: ${allowedDataTypes.join(', ')}`);
      }

      if (!column.source) {
        throw new Error(`Column ${i} missing source`);
      }

      if (column.source.collection !== 'students') {
        throw new Error(`Column ${i} source.collection must be students`);
      }

      if (!column.source.field) {
        throw new Error(`Column ${i} missing source.field`);
      }

      // *************** Check if source field is computed or direct
      const isComputedExpression = column.source.field.includes('+');

      if (isComputedExpression) {
        const validationResult = ValidateComputedExpression(column.source.field, catalog);
        if (!validationResult.valid) {
          throw new Error(`Column ${i} computed expression invalid: ${validationResult.error}`);
        }
      } else {
        const fieldExists = catalog.fields.some((field) => field.key === column.source.field);
        if (!fieldExists) {
          throw new Error(`Column ${i} source.field ${column.source.field} not found in catalog`);
        }
      }
    }

    // *************** Validate filters array
    if (!contract.filters) {
      throw new Error('Filters array is required');
    }

    if (!Array.isArray(contract.filters)) {
      throw new Error('Filters must be an array');
    }

    if (contract.filters.length === 0) {
      throw new Error('Please add at least one filter');
    }

    // *************** Validate each filter definition
    for (let i = 0; i < contract.filters.length; i++) {
      const filter = contract.filters[i];

      if (!filter.key) {
        throw new Error(`Filter ${i} missing key`);
      }

      if (!filter.key.startsWith('students.')) {
        throw new Error(`Filter ${i} key must start with students.`);
      }

      const fieldName = filter.key.replace('students.', '');
      const catalogField = catalog.fields.find((field) => field.key === fieldName);

      if (!catalogField) {
        throw new Error(`Filter ${i} field ${fieldName} not found in catalog`);
      }

      if (!filter.op) {
        throw new Error(`Filter ${i} missing operator`);
      }

      const isOperatorValid = ValidateFilterOperator(filter.op);
      if (!isOperatorValid) {
        throw new Error(`Filter ${i} operator ${filter.op} not allowed in v1`);
      }

      if (filter.value === undefined || filter.value === null) {
        throw new Error(`Filter ${i} missing value`);
      }

      const valueValidation = ValidateFilterValue(filter.value, catalogField.data_type, filter.op);
      if (!valueValidation.valid) {
        throw new Error(`Filter ${i} value validation failed: ${valueValidation.error}`);
      }
    }

    // *************** Normalize and construct validated contract
    const validatedContract = {
      status: contract.status,
      intent: contract.intent,
      table_name: contract.table_name.trim(),
      description: contract.description || '',
      base_entity: contract.base_entity,
      columns: contract.columns.map((col) => ({
        label: col.label.trim(),
        key: col.key.trim(),
        data_type: col.data_type,
        source: {
          collection: col.source.collection,
          field: col.source.field.trim(),
        },
      })),
      filters: contract.filters.map((filter) => ({
        key: filter.key.trim(),
        op: filter.op,
        value: filter.value,
      })),
    };

    return validatedContract;
  } catch (error) {
    // *************** Log validation error to database
    await ErrorLogModel.create({
      path: 'validators/contract.validator.js',
      parameter_input: JSON.stringify({ contract, createdByUserId }),
      function_name: 'ValidateStudentsContract',
      error: String(error.stack),
    });

    throw new Error(error.message);
  }
}

// *************** EXPORT MODULE ***************
module.exports = { ValidateStudentsContract };
