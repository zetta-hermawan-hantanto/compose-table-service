// *************** IMPORT MODULE ***************
const CatalogService = require('../services/catalog.service');
const { GetExportFailureMessage } = require('../utils/export.messages');

/**
 * BILIP V4.2 Export Validator
 * 
 * Uses CatalogService as single source of truth.
 * Supports joined entity fields (school.name, rncp_title.rncp_level, class.name).
 */

/**
 * ValidateColumns checks if requested columns exist in catalog.
 * Supports both student base fields and joined entity fields.
 * @param {Array<string>} columns - Requested column names.
 * @param {string} lang - Language for error messages.
 * @returns {object} - Validation result with isValid and optional clarification.
 */
function ValidateColumns(columns, lang) {
  // *************** Check if columns array is empty
  if (!columns || !Array.isArray(columns) || columns.length === 0) {
    const clarificationMessage = GetExportFailureMessage('missing_columns', lang);
    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  // *************** Validate each column using CatalogService
  const unknownColumns = [];
  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i];

    // Validate field path exists in catalog
    const fieldValid = CatalogService.ValidateFieldPath(columnName);
    if (!fieldValid) {
      unknownColumns.push(columnName);
    }
  }

  // *************** Return clarification if unknown columns found
  if (unknownColumns.length > 0) {
    // Get valid field examples from catalog
    const studentsEntity = CatalogService.GetEntity('students');
    const validExamples = studentsEntity.fields.slice(0, 8).map(f => f.name);
    
    const clarificationMessage = GetExportFailureMessage('unknown_columns', lang, {
      unknownColumns: unknownColumns,
      validExamples: validExamples,
    });

    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  // *************** All columns are valid
  return {
    isValid: true,
    validatedColumns: columns,
  };
}

/**
 * ValidateFilters checks if filter fields and operators are valid.
 * Uses CatalogService to validate field paths and allowed operations.
 * @param {Array} filters - Array of filter objects with key operator and value.
 * @param {string} lang - Language for error messages.
 * @returns {object} - Validation result with isValid and optional failure.
 */
function ValidateFilters(filters, lang) {
  // *************** Filters are optional for export
  if (!filters || !Array.isArray(filters)) {
    return {
      isValid: true,
      validatedFilters: [],
    };
  }

  // *************** Validate each filter
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const filterKey = filter.key;

    // *************** Validate filter key using CatalogService
    const fieldValid = CatalogService.ValidateFieldPath(filterKey);
    if (!fieldValid) {
      // Get valid field examples
      const studentsEntity = CatalogService.GetEntity('students');
      const validExamples = studentsEntity.fields.slice(0, 5).map(f => f.name).join(', ');
      
      const failureMessage = GetExportFailureMessage('invalid_filter', lang, {
        fieldName: filterKey,
        suggestions: `Try one of: ${validExamples}`,
      });

      return {
        isValid: false,
        failure: failureMessage,
      };
    }

    // *************** Check if operator is valid for this field
    const allowedOps = CatalogService.GetAllowedOps(filterKey);
    if (!allowedOps || !allowedOps.includes(filter.operator)) {
      const failureMessage = GetExportFailureMessage('invalid_filter', lang, {
        fieldName: filterKey,
        suggestions: `Valid operators: ${allowedOps ? allowedOps.join(', ') : 'eq, ne, in'}`,
      });

      return {
        isValid: false,
        failure: failureMessage,
      };
    }
  }

  // *************** All filters are valid
  return {
    isValid: true,
    validatedFilters: filters,
  };
}

/**
 * ValidateDelimiter checks if delimiter is one of three allowed values.
 * @param {string} delimiter - Delimiter value to validate.
 * @param {string} lang - Language for error messages.
 * @returns {object} - Validation result with isValid and optional clarification.
 */
function ValidateDelimiter(delimiter, lang) {
  // *************** Check delimiter is provided
  if (!delimiter) {
    const clarificationMessage = GetExportFailureMessage('missing_delimiter', lang);
    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  // *************** Validate delimiter is one of allowed values
  const validDelimiters = ['comma', 'semicolon', 'tab'];
  const isValidDelimiter = validDelimiters.includes(delimiter);

  if (!isValidDelimiter) {
    const clarificationMessage = GetExportFailureMessage('invalid_delimiter', lang, {
      providedDelimiter: delimiter,
      validOptions: validDelimiters.join(', '),
    });

    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  // *************** Delimiter is valid
  return {
    isValid: true,
    validatedDelimiter: delimiter,
  };
}

/**
 * ValidateExportRequest validates complete export request parameters.
 * Main validation entry point for export operations.
 * @param {object} params - Export request parameters.
 * @param {Array<string>} params.columns - Column names to export.
 * @param {Array} params.filters - Optional filter conditions.
 * @param {string} params.delimiter - Delimiter type.
 * @param {string} params.lang - Language for messages.
 * @returns {object} - Validation result with config or error.
 */
function ValidateExportRequest(params) {
  // *************** Validate columns
  const columnsResult = ValidateColumns(params.columns, params.lang);
  if (!columnsResult.isValid) {
    return {
      needsClarification: true,
      clarificationMessage: columnsResult.clarification,
    };
  }

  // *************** Validate filters
  const filtersResult = ValidateFilters(params.filters, params.lang);
  if (!filtersResult.isValid) {
    return {
      failed: true,
      failureMessage: filtersResult.failure,
    };
  }

  // *************** Validate delimiter
  const delimiterResult = ValidateDelimiter(params.delimiter, params.lang);
  if (!delimiterResult.isValid) {
    return {
      needsClarification: true,
      clarificationMessage: delimiterResult.clarification,
    };
  }

  // *************** All validation passed
  return {
    config: {
      columns: columnsResult.validatedColumns,
      filters: filtersResult.validatedFilters,
      delimiter: delimiterResult.validatedDelimiter,
    },
  };
}

// *************** EXPORT MODULE ***************
module.exports = {
  ValidateExportRequest,
  ValidateColumns,
  ValidateFilters,
  ValidateDelimiter,
};
