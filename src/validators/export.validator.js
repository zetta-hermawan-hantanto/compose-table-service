// *************** IMPORT CORE ***************
const fs = require('fs');
const path = require('path');

// *************** IMPORT UTILITIES ***************
const { GetExportFailureMessage } = require('../utils/export.messages');
const { ValidateFieldPath, CountJoinsInContract, EnforceJoinLimit } = require('../utils/path.validator');

// *************** LOAD CATALOG ***************
const catalogPath = path.join(__dirname, '../shared/catalog/schema.catalog.json');
const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
const studentsEntity = catalogData.entities.find((e) => e.name === 'students');
const studentsFields = studentsEntity ? studentsEntity.fields : [];

// *************** VALID FILTER OPERATORS ***************
const VALID_OPERATORS = ['eq', 'ne', 'in', 'contains', 'gte', 'lte'];

/**
 * GetValidColumnNames extracts all valid column names from students catalog.
 * Used for column validation and suggestion generation.
 * Returns array of field names that can be used in exports.
 * V4: Also includes joined entity field examples.
 * @returns {Array<string>} - List of valid column names from catalog.
 */
function GetValidColumnNames() {
  // *************** Extract field names from catalog
  const validColumns = [];

  for (let i = 0; i < studentsFields.length; i++) {
    const field = studentsFields[i];
    validColumns.push(field.name);
  }

  return validColumns;
}

/**
 * ValidateColumns checks if requested columns exist in students catalog.
 * Identifies unknown columns and suggests valid alternatives.
 * Returns validation result with clarification message if needed.
 * V4: Supports entity.field notation for joined entities.
 * @param {Array<string>} columns - Requested column names from user prompt.
 * @param {string} lang - Language for error messages.
 * @returns {object} - Validation result with isValid and optional clarification.
 */
function ValidateColumns(columns, lang) {
  // *************** Check if columns array is empty
  if (!columns) {
    const clarificationMessage = GetExportFailureMessage('missing_columns', lang);
    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  if (!Array.isArray(columns)) {
    const clarificationMessage = GetExportFailureMessage('missing_columns', lang);
    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  if (columns.length === 0) {
    const clarificationMessage = GetExportFailureMessage('missing_columns', lang);
    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  // *************** Validate each column using v4 path validator
  const unknownColumns = [];
  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i];

    // *************** Check if column contains dot notation for v4 joins
    if (columnName.includes('.')) {
      try {
        ValidateFieldPath(columnName, catalogData);
      } catch (error) {
        unknownColumns.push(columnName);
      }
    } else {
      // *************** Check v3 students field
      const fieldExists = studentsFields.some((f) => f.name === columnName);
      if (!fieldExists) {
        unknownColumns.push(columnName);
      }
    }
  }

  // *************** Return clarification if unknown columns found
  if (unknownColumns.length > 0) {
    const validExamples = GetValidColumnNames().slice(0, 8);
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
 * Verifies field names exist in catalog and operators are supported.
 * Returns validation result with failure message if invalid.
 * V4: Supports entity.field notation for joined entity filters.
 * @param {Array} filters - Array of filter objects with key op and value.
 * @param {string} lang - Language for error messages.
 * @returns {object} - Validation result with isValid and optional failure.
 */
function ValidateFilters(filters, lang) {
  // *************** Filters are optional for export
  if (!filters) {
    return {
      isValid: true,
      validatedFilters: [],
    };
  }

  if (!Array.isArray(filters)) {
    return {
      isValid: true,
      validatedFilters: [],
    };
  }

  // *************** Validate each filter
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    const filterKey = filter.key;

    // *************** Validate filter key using v4 path validator
    try {
      if (filterKey.includes('.')) {
        // *************** V4 path like school.city or students.status
        ValidateFieldPath(filterKey, catalogData);
      } else {
        // *************** V3 path assume students entity
        const fieldExists = studentsFields.some((f) => f.name === filterKey);
        if (!fieldExists) {
          const validExamples = GetValidColumnNames().slice(0, 5).join(', ');
          const failureMessage = GetExportFailureMessage('invalid_filter', lang, {
            fieldName: filterKey,
            suggestions: `Try one of: ${validExamples}`,
          });

          return {
            isValid: false,
            failure: failureMessage,
          };
        }
      }
    } catch (error) {
      const validExamples = GetValidColumnNames().slice(0, 5).join(', ');
      const failureMessage = GetExportFailureMessage('invalid_filter', lang, {
        fieldName: filterKey,
        suggestions: `Try one of: ${validExamples}`,
      });

      return {
        isValid: false,
        failure: failureMessage,
      };
    }

    // *************** Check if operator is valid
    if (!VALID_OPERATORS.includes(filter.op)) {
      const failureMessage = GetExportFailureMessage('invalid_filter', lang, {
        fieldName: filterKey,
        suggestions: `Valid operators: ${VALID_OPERATORS.join(', ')}`,
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
 * ValidateDelimiter checks if delimiter is one of the three allowed values.
 * Only comma semicolon and tab are permitted as per v3 requirements.
 * Returns validation result with clarification if invalid.
 * @param {string} delimiter - Delimiter name from user prompt.
 * @param {string} lang - Language for error messages.
 * @returns {object} - Validation result with isValid and optional clarification.
 */
function ValidateDelimiter(delimiter, lang) {
  // *************** Check if delimiter is provided
  if (!delimiter) {
    const clarificationMessage = GetExportFailureMessage('invalid_delimiter', lang);
    return {
      isValid: false,
      clarification: clarificationMessage,
    };
  }

  // *************** Check if delimiter is one of allowed values
  const validDelimiters = ['comma', 'semicolon', 'tab'];

  if (!validDelimiters.includes(delimiter)) {
    const clarificationMessage = GetExportFailureMessage('invalid_delimiter', lang);
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
 * ValidateLanguage checks if language is en or fr.
 * Defaults to en if not specified or invalid.
 * Returns validation result with normalized language code.
 * @param {string} lang - Language code from request.
 * @returns {object} - Validation result with validated language.
 */
function ValidateLanguage(lang) {
  // *************** Check if lang is valid
  if (lang === 'en' || lang === 'fr') {
    return {
      isValid: true,
      validatedLang: lang,
    };
  }

  // *************** Default to en if invalid or missing
  return {
    isValid: true,
    validatedLang: 'en',
  };
}

/**
 * ValidateExportRequest validates complete export request parameters.
 * Checks columns filters delimiter and language against catalog rules.
 * Returns normalized export config or clarification or failure envelope.
 * V4: Enforces max 3 joined entities per export.
 * @param {object} params - Export request parameters.
 * @param {Array<string>} params.columns - Requested column names.
 * @param {Array} params.filters - Optional filter conditions.
 * @param {string} params.delimiter - Delimiter name comma semicolon or tab.
 * @param {string} params.lang - Language code en or fr.
 * @returns {object} - Validation result with config or envelope.
 */
function ValidateExportRequest({ columns, filters, delimiter, lang }) {
  // *************** Validate language first to use in error messages
  const langResult = ValidateLanguage(lang);
  const effectiveLang = langResult.validatedLang;

  // *************** Validate columns
  const columnsResult = ValidateColumns(columns, effectiveLang);
  if (!columnsResult.isValid) {
    return {
      isValid: false,
      needsClarification: true,
      clarificationMessage: columnsResult.clarification,
    };
  }

  // *************** Validate delimiter
  const delimiterResult = ValidateDelimiter(delimiter, effectiveLang);
  if (!delimiterResult.isValid) {
    return {
      isValid: false,
      needsClarification: true,
      clarificationMessage: delimiterResult.clarification,
    };
  }

  // *************** Validate filters
  const filtersResult = ValidateFilters(filters, effectiveLang);
  if (!filtersResult.isValid) {
    return {
      isValid: false,
      failed: true,
      failureMessage: filtersResult.failure,
    };
  }

  // *************** Enforce v4 join limit max 3 entities
  const joinCount = CountJoinsInContract({
    columns: columns.map((col) => ({ source: { field: col } })),
    filters: filters || [],
  });

  try {
    EnforceJoinLimit(joinCount);
  } catch (error) {
    return {
      isValid: false,
      failed: true,
      failureMessage: error.message,
    };
  }

  // *************** Return validated export config
  const validatedConfig = {
    isValid: true,
    config: {
      columns: columnsResult.validatedColumns,
      filters: filtersResult.validatedFilters,
      delimiter: delimiterResult.validatedDelimiter,
      lang: langResult.validatedLang,
    },
  };

  return validatedConfig;
}

// *************** EXPORT MODULE ***************
module.exports = {
  ValidateExportRequest,
  ValidateColumns,
  ValidateFilters,
  ValidateDelimiter,
  GetValidColumnNames,
};
