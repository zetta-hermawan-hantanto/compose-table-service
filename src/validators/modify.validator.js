// *************** IMPORT MODULE ***************
const ErrorLogModel = require('../models/error_log.model');

/**
 * ValidateSortDirection checks if sort direction is asc or desc.
 * Used to enforce strict direction values for MongoDB sort operations.
 * @param {string} direction - Sort direction value to validate.
 * @returns {boolean} - True if direction is valid false otherwise.
 */
function ValidateSortDirection(direction) {
  // *************** Check direction against allowed values
  const allowedDirections = ['asc', 'desc'];
  const isValid = allowedDirections.includes(direction);

  return isValid;
}

/**
 * CheckColumnKeyConflict detects if new column keys conflict with existing ones.
 * Prevents duplicate column keys which would cause data integrity issues.
 * @param {Array} existingColumns - Current table columns array.
 * @param {Array} newColumns - New columns to be added.
 * @returns {object} - Object with conflict flag and conflicting keys array.
 */
function CheckColumnKeyConflict(existingColumns, newColumns) {
  // *************** Extract existing column keys
  const existingKeys = existingColumns.map((col) => col.key);

  // *************** Find conflicting keys in new columns
  const conflicts = [];

  for (let i = 0; i < newColumns.length; i++) {
    const newCol = newColumns[i];
    if (existingKeys.includes(newCol.key)) {
      conflicts.push(newCol.key);
    }
  }

  // *************** Construct conflict result
  const conflictResult = {
    hasConflict: conflicts.length > 0,
    conflictingKeys: conflicts,
  };

  return conflictResult;
}

/**
 * CheckColumnExists verifies if column keys exist in current table.
 * Used to validate remove_columns requests before applying changes.
 * @param {Array} existingColumns - Current table columns array.
 * @param {Array} keysToRemove - Column keys to be removed.
 * @returns {object} - Object with exists flag and missing keys array.
 */
function CheckColumnExists(existingColumns, keysToRemove) {
  // *************** Extract existing column keys
  const existingKeys = existingColumns.map((col) => col.key);

  // *************** Find missing keys in remove list
  const missing = [];

  for (let i = 0; i < keysToRemove.length; i++) {
    const keyToRemove = keysToRemove[i];
    if (!existingKeys.includes(keyToRemove)) {
      missing.push(keyToRemove);
    }
  }

  // *************** Construct existence result
  const existenceResult = {
    allExist: missing.length === 0,
    missingKeys: missing,
  };

  return existenceResult;
}

/**
 * ValidateModifyContract validates AI-generated modification changes against existing table.
 * Performs validation for sort configuration column additions and removals.
 * Throws Error immediately on any validation failure after logging.
 * @param {object} changes - The changes object from AI agent modify envelope.
 * @param {object} existingTable - The current dynamic table document.
 * @param {object} catalog - The catalog object containing students metadata.
 * @returns {Promise<object>} - Promise resolving to validated and normalized changes.
 * @throws {Error} - On any validation failure with descriptive message.
 */
async function ValidateModifyContract(changes, existingTable, catalog) {
  try {
    // *************** Validate changes parameter
    if (!changes) {
      throw new Error('Changes object is required');
    }

    if (typeof changes !== 'object') {
      throw new Error('Changes must be an object');
    }

    // *************** Validate existingTable parameter
    if (!existingTable) {
      throw new Error('Existing table is required');
    }

    // *************** Validate catalog parameter
    if (!catalog) {
      throw new Error('Catalog is required');
    }

    // *************** Validate sort if present
    if (changes.sort) {
      if (!changes.sort.key) {
        throw new Error('Sort key is required when sort is specified');
      }

      if (!changes.sort.dir) {
        throw new Error('Sort direction is required when sort is specified');
      }

      // *************** Validate sort direction
      const isSortDirValid = ValidateSortDirection(changes.sort.dir);
      if (!isSortDirValid) {
        throw new Error('Sort direction must be either asc or desc');
      }

      // *************** Validate sort key exists in catalog or existing columns
      const sortKey = changes.sort.key;
      const catalogField = catalog.fields.find((field) => field.key === sortKey);
      const existingColumn = existingTable.columns.find((col) => col.source.field === sortKey);

      if (!catalogField && !existingColumn) {
        throw new Error(`Sort key ${sortKey} not found in catalog or existing columns`);
      }
    }

    // *************** Validate add_columns if present
    if (changes.add_columns) {
      if (!Array.isArray(changes.add_columns)) {
        throw new Error('add_columns must be an array');
      }

      // *************** Check for column key conflicts
      const conflictCheck = CheckColumnKeyConflict(existingTable.columns, changes.add_columns);
      if (conflictCheck.hasConflict) {
        throw new Error(`Column keys already exist: ${conflictCheck.conflictingKeys.join(', ')}`);
      }

      // *************** Validate each new column structure
      for (let i = 0; i < changes.add_columns.length; i++) {
        const newCol = changes.add_columns[i];

        if (!newCol.label) {
          throw new Error(`Column ${i} in add_columns missing label`);
        }

        if (!newCol.key) {
          throw new Error(`Column ${i} in add_columns missing key`);
        }

        if (!newCol.data_type) {
          throw new Error(`Column ${i} in add_columns missing data_type`);
        }

        if (!newCol.source || !newCol.source.field) {
          throw new Error(`Column ${i} in add_columns missing source.field`);
        }

        // *************** Validate field exists in catalog
        const fieldExists = catalog.fields.some((field) => field.key === newCol.source.field);
        if (!fieldExists) {
          throw new Error(`Column ${i} source.field ${newCol.source.field} not found in catalog`);
        }
      }
    }

    // *************** Validate remove_columns if present
    if (changes.remove_columns) {
      if (!Array.isArray(changes.remove_columns)) {
        throw new Error('remove_columns must be an array');
      }

      // *************** Check if columns to remove exist
      const existenceCheck = CheckColumnExists(existingTable.columns, changes.remove_columns);
      if (!existenceCheck.allExist) {
        throw new Error(`Columns do not exist: ${existenceCheck.missingKeys.join(', ')}`);
      }
    }

    // *************** Validate add_filters if present
    if (changes.add_filters) {
      if (!Array.isArray(changes.add_filters)) {
        throw new Error('add_filters must be an array');
      }

      // *************** Validate each filter structure
      for (let i = 0; i < changes.add_filters.length; i++) {
        const filter = changes.add_filters[i];

        if (!filter.key) {
          throw new Error(`Filter ${i} in add_filters missing key`);
        }

        const fieldName = filter.key.replace('students.', '');
        const catalogField = catalog.fields.find((field) => field.key === fieldName);

        if (!catalogField) {
          throw new Error(`Filter ${i} field ${fieldName} not found in catalog`);
        }
      }
    }

    // *************** Validate remove_filters if present
    if (changes.remove_filters) {
      if (!Array.isArray(changes.remove_filters)) {
        throw new Error('remove_filters must be an array');
      }
    }

    // *************** Validate update_filters if present
    if (changes.update_filters) {
      if (!Array.isArray(changes.update_filters)) {
        throw new Error('update_filters must be an array');
      }

      // *************** Validate each updated filter structure
      for (let i = 0; i < changes.update_filters.length; i++) {
        const filter = changes.update_filters[i];

        if (!filter.key) {
          throw new Error(`Filter ${i} in update_filters missing key`);
        }
      }
    }

    // *************** Construct validated changes object
    const validatedChanges = {
      table_name: changes.table_name || undefined,
      description: changes.description || undefined,
      add_columns: changes.add_columns || undefined,
      remove_columns: changes.remove_columns || undefined,
      add_filters: changes.add_filters || undefined,
      remove_filters: changes.remove_filters || undefined,
      update_filters: changes.update_filters || undefined,
      sort: changes.sort || undefined,
    };

    return validatedChanges;
  } catch (error) {
    // *************** Log validation error to database
    await ErrorLogModel.create({
      path: 'validators/modify.validator.js',
      parameter_input: JSON.stringify({ changes, existingTableId: existingTable && existingTable._id }),
      function_name: 'ValidateModifyContract',
      error: String(error.stack),
    });

    throw new Error(error.message);
  }
}

// *************** EXPORT MODULE ***************
module.exports = { ValidateModifyContract };
