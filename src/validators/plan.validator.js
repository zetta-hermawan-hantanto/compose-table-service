// *************** IMPORT SERVICES ***************
const CatalogService = require('../services/catalog.service');

/**
 * ValidatePlan validates an LLM-generated plan against v4.2 catalog.
 * Checks entry entity field paths operations join limits filter limits row caps.
 * Returns validation result with detailed error messages if invalid.
 * @param {object} plan - Plan object with entry columns filters sort limit.
 * @returns {object} - Validation result with isValid errors and warnings.
 */
function ValidatePlan(plan) {
  // *************** Initialize validation result
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  // *************** Validate plan structure
  if (!plan || typeof plan !== 'object') {
    result.isValid = false;
    result.errors.push('Plan must be an object');
    return result;
  }

  // *************** Validate entry entity
  const entryValidation = ValidateEntry(plan.entry);
  if (!entryValidation.isValid) {
    result.isValid = false;
    result.errors.push(...entryValidation.errors);
  }

  // *************** Validate columns
  if (plan.columns) {
    const columnsValidation = ValidateColumns(plan.columns);
    if (!columnsValidation.isValid) {
      result.isValid = false;
      result.errors.push(...columnsValidation.errors);
    }
    result.warnings.push(...columnsValidation.warnings);
  }

  // *************** Validate filters
  if (plan.filters) {
    const filtersValidation = ValidateFilters(plan.filters);
    if (!filtersValidation.isValid) {
      result.isValid = false;
      result.errors.push(...filtersValidation.errors);
    }
  }

  // *************** Validate sort
  if (plan.sort) {
    const sortValidation = ValidateSort(plan.sort);
    if (!sortValidation.isValid) {
      result.isValid = false;
      result.errors.push(...sortValidation.errors);
    }
  }

  // *************** Validate global constraints
  const constraintsValidation = ValidateConstraints(plan);
  if (!constraintsValidation.isValid) {
    result.isValid = false;
    result.errors.push(...constraintsValidation.errors);
  }

  return result;
}

/**
 * ValidateEntry validates the entry entity in plan.
 * Checks if entry exists in catalog and is valid entry point.
 * @param {string} entry - Entry entity name.
 * @returns {object} - Validation result with isValid and errors.
 */
function ValidateEntry(entry) {
  const result = { isValid: true, errors: [] };

  // *************** Check if entry provided
  if (!entry) {
    // *************** Use default entry if not specified
    const defaultEntry = CatalogService.GetDefaultEntry();
    result.warnings = [`No entry specified, using default: ${defaultEntry}`];
    return result;
  }

  // *************** Check if entry exists in catalog
  const entity = CatalogService.GetEntity(entry);
  if (!entity) {
    result.isValid = false;
    const validEntities = CatalogService.ListEntities();
    result.errors.push(`Invalid entry entity: ${entry}. Valid entities: ${validEntities.join(', ')}`);
    return result;
  }

  // *************** Check if entity is valid entry point
  if (!CatalogService.IsEntryEntity(entry)) {
    result.isValid = false;
    result.errors.push(`Entity ${entry} cannot be used as entry point. Only entities with is_entry=true are allowed.`);
  }

  return result;
}

/**
 * ValidateColumns validates columns array in plan.
 * Checks if all field paths exist and aliases are unique.
 * @param {Array} columns - Array of column objects with path and alias.
 * @returns {object} - Validation result with isValid errors and warnings.
 */
function ValidateColumns(columns) {
  const result = { isValid: true, errors: [], warnings: [] };

  // *************** Check if columns is array
  if (!Array.isArray(columns)) {
    result.isValid = false;
    result.errors.push('Columns must be an array');
    return result;
  }

  // *************** Check column count against constraints
  const constraints = CatalogService.GetConstraints();
  if (columns.length > constraints.max_columns_per_table) {
    result.isValid = false;
    result.errors.push(`Too many columns: ${columns.length}. Maximum allowed: ${constraints.max_columns_per_table}`);
  }

  // *************** Track aliases for uniqueness check
  const aliases = new Set();

  // *************** Validate each column
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];

    // *************** Check column structure
    if (!column.path) {
      result.isValid = false;
      result.errors.push(`Column at index ${i} missing path`);
      continue;
    }

    // *************** Validate field path exists in catalog
    const pathValid = CatalogService.ValidateFieldPath(column.path);
    if (!pathValid) {
      result.isValid = false;
      result.errors.push(`Column path not found in catalog: ${column.path}`);
    }

    // *************** Check alias uniqueness
    if (column.alias) {
      if (aliases.has(column.alias)) {
        result.isValid = false;
        result.errors.push(`Duplicate column alias: ${column.alias}`);
      }
      aliases.add(column.alias);
    }
  }

  return result;
}

/**
 * ValidateFilters validates filters array in plan.
 * Checks if field paths exist operations are allowed and values are appropriate.
 * @param {Array} filters - Array of filter objects with path op and value.
 * @returns {object} - Validation result with isValid and errors.
 */
function ValidateFilters(filters) {
  const result = { isValid: true, errors: [] };

  // *************** Check if filters is array
  if (!Array.isArray(filters)) {
    result.isValid = false;
    result.errors.push('Filters must be an array');
    return result;
  }

  // *************** Check filter count against constraints
  const constraints = CatalogService.GetConstraints();
  if (filters.length > constraints.max_filters_per_request) {
    result.isValid = false;
    result.errors.push(`Too many filters: ${filters.length}. Maximum allowed: ${constraints.max_filters_per_request}`);
  }

  // *************** Validate each filter
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];

    // *************** Check filter structure
    if (!filter.path) {
      result.isValid = false;
      result.errors.push(`Filter at index ${i} missing path`);
      continue;
    }

    if (!filter.op) {
      result.isValid = false;
      result.errors.push(`Filter at index ${i} missing operation`);
      continue;
    }

    if (filter.value === undefined || filter.value === null) {
      result.isValid = false;
      result.errors.push(`Filter at index ${i} missing value`);
      continue;
    }

    // *************** Validate field path exists in catalog
    const pathValid = CatalogService.ValidateFieldPath(filter.path);
    if (!pathValid) {
      result.isValid = false;
      result.errors.push(`Filter path not found in catalog: ${filter.path}`);
      continue;
    }

    // *************** Validate operation is allowed for field
    try {
      const allowedOps = CatalogService.GetAllowedOps(filter.path);
      if (!allowedOps.includes(filter.op)) {
        result.isValid = false;
        result.errors.push(`Operation ${filter.op} not allowed for field ${filter.path}. Allowed: ${allowedOps.join(', ')}`);
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Error validating filter operation: ${error.message}`);
    }

    // *************** Validate value type matches field type
    try {
      const fieldType = CatalogService.GetFieldType(filter.path);
      const valueValid = ValidateFilterValue(filter.value, fieldType, filter.op);
      if (!valueValid.isValid) {
        result.isValid = false;
        result.errors.push(`Filter value type mismatch at ${filter.path}: ${valueValid.error}`);
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Error validating filter value: ${error.message}`);
    }
  }

  return result;
}

/**
 * ValidateFilterValue validates filter value matches expected type.
 * Checks if value is appropriate for field type and operation.
 * @param {*} value - Filter value.
 * @param {string} fieldType - Field data type from catalog.
 * @param {string} op - Filter operation.
 * @returns {object} - Validation result with isValid and error.
 */
function ValidateFilterValue(value, fieldType, op) {
  const result = { isValid: true, error: null };

  // *************** Handle array operations (in)
  if (op === 'in') {
    if (!Array.isArray(value)) {
      result.isValid = false;
      result.error = 'Value for "in" operation must be an array';
    }
    return result;
  }

  // *************** Validate value type matches field type
  switch (fieldType) {
    case 'string':
      if (typeof value !== 'string') {
        result.isValid = false;
        result.error = `Expected string, got ${typeof value}`;
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        result.isValid = false;
        result.error = `Expected number, got ${typeof value}`;
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        result.isValid = false;
        result.error = `Expected boolean, got ${typeof value}`;
      }
      break;

    case 'date':
      // Accept string or Date object for dates
      if (typeof value !== 'string' && !(value instanceof Date)) {
        result.isValid = false;
        result.error = `Expected date string or Date object, got ${typeof value}`;
      }
      break;

    case 'objectId':
      // Accept string for ObjectId
      if (typeof value !== 'string') {
        result.isValid = false;
        result.error = `Expected ObjectId string, got ${typeof value}`;
      }
      break;

    default:
      // Unknown type, allow any value
      break;
  }

  return result;
}

/**
 * ValidateSort validates sort configuration in plan.
 * Checks if sort paths exist and directions are valid.
 * @param {Array|object} sort - Sort configuration (array or single object).
 * @returns {object} - Validation result with isValid and errors.
 */
function ValidateSort(sort) {
  const result = { isValid: true, errors: [] };

  // *************** Normalize sort to array
  const sortArray = Array.isArray(sort) ? sort : [sort];

  // *************** Validate each sort item
  for (let i = 0; i < sortArray.length; i++) {
    const sortItem = sortArray[i];

    // *************** Check sort structure
    if (!sortItem.path) {
      result.isValid = false;
      result.errors.push(`Sort item at index ${i} missing path`);
      continue;
    }

    if (!sortItem.dir) {
      result.isValid = false;
      result.errors.push(`Sort item at index ${i} missing direction`);
      continue;
    }

    // *************** Validate field path exists in catalog
    const pathValid = CatalogService.ValidateFieldPath(sortItem.path);
    if (!pathValid) {
      result.isValid = false;
      result.errors.push(`Sort path not found in catalog: ${sortItem.path}`);
    }

    // *************** Validate direction
    if (sortItem.dir !== 'asc' && sortItem.dir !== 'desc') {
      result.isValid = false;
      result.errors.push(`Invalid sort direction: ${sortItem.dir}. Must be "asc" or "desc"`);
    }
  }

  return result;
}

/**
 * ValidateConstraints validates plan against global catalog constraints.
 * Checks join limits and estimated row count.
 * @param {object} plan - Full plan object.
 * @returns {object} - Validation result with isValid and errors.
 */
function ValidateConstraints(plan) {
  const result = { isValid: true, errors: [] };

  // *************** Get constraints from catalog
  const constraints = CatalogService.GetConstraints();

  // *************** Count joins from all paths
  const joinCount = CountJoinsInPlan(plan);
  if (joinCount > constraints.max_joins_per_request) {
    result.isValid = false;
    result.errors.push(`Too many joins: ${joinCount}. Maximum allowed: ${constraints.max_joins_per_request}`);
  }

  // *************** Validate row limit
  if (plan.limit && plan.limit > constraints.max_row_cap) {
    result.isValid = false;
    result.errors.push(`Limit exceeds maximum: ${plan.limit}. Maximum allowed: ${constraints.max_row_cap}`);
  }

  return result;
}

/**
 * CountJoinsInPlan counts distinct joined entities in plan.
 * Extracts entity names from all field paths containing dots.
 * @param {object} plan - Plan object with columns filters and sort.
 * @returns {number} - Count of distinct joined entities.
 */
function CountJoinsInPlan(plan) {
  const joinedEntities = new Set();

  // *************** Extract entities from columns
  if (plan.columns && Array.isArray(plan.columns)) {
    for (const column of plan.columns) {
      if (column.path && column.path.includes('.')) {
        const entityName = column.path.split('.')[0];
        const defaultEntry = CatalogService.GetDefaultEntry();
        if (entityName !== defaultEntry) {
          joinedEntities.add(entityName);
        }
      }
    }
  }

  // *************** Extract entities from filters
  if (plan.filters && Array.isArray(plan.filters)) {
    for (const filter of plan.filters) {
      if (filter.path && filter.path.includes('.')) {
        const entityName = filter.path.split('.')[0];
        const defaultEntry = CatalogService.GetDefaultEntry();
        if (entityName !== defaultEntry) {
          joinedEntities.add(entityName);
        }
      }
    }
  }

  // *************** Extract entities from sort
  if (plan.sort) {
    const sortArray = Array.isArray(plan.sort) ? plan.sort : [plan.sort];
    for (const sortItem of sortArray) {
      if (sortItem.path && sortItem.path.includes('.')) {
        const entityName = sortItem.path.split('.')[0];
        const defaultEntry = CatalogService.GetDefaultEntry();
        if (entityName !== defaultEntry) {
          joinedEntities.add(entityName);
        }
      }
    }
  }

  return joinedEntities.size;
}

// *************** EXPORT MODULE ***************
module.exports = {
  ValidatePlan,
  ValidateEntry,
  ValidateColumns,
  ValidateFilters,
  ValidateSort,
  ValidateConstraints,
  CountJoinsInPlan,
};
