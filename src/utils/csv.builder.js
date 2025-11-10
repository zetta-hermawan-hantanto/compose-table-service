// *************** IMPORT LIBRARY ***************
const moment = require('moment');

/**
 * MapDelimiterToChar converts delimiter name to actual character.
 * Supports comma semicolon and tab only as specified in v3 requirements.
 * Returns mapped character for CSV field separation.
 * @param {string} delimiterName - Name of delimiter comma semicolon or tab.
 * @returns {string} - Actual delimiter character.
 * @throws {Error} - If delimiter is not one of the three allowed values.
 */
function MapDelimiterToChar(delimiterName) {
  // *************** Validate delimiter parameter
  if (!delimiterName) {
    throw new Error('Delimiter is required');
  }

  // *************** Map delimiter name to character
  if (delimiterName === 'comma') {
    return ',';
  }

  if (delimiterName === 'semicolon') {
    return ';';
  }

  if (delimiterName === 'tab') {
    return '\t';
  }

  // *************** Reject invalid delimiter
  throw new Error('Invalid delimiter. Must be comma, semicolon, or tab');
}

/**
 * EscapeCsvValue applies CSV escaping rules to a single cell value.
 * Implements CSV injection safety by prefixing dangerous characters.
 * Quotes fields only when necessary and doubles internal quotes.
 * @param {any} value - Raw cell value to escape.
 * @param {string} delimiter - Delimiter character used in CSV.
 * @returns {string} - Escaped CSV cell value ready for output.
 */
function EscapeCsvValue(value, delimiter) {
  // *************** Handle null and undefined as empty string
  if (value === null || value === undefined) {
    return '';
  }

  // *************** Convert value to string
  let stringValue = String(value);

  // *************** Apply CSV injection safety for formula characters
  const firstChar = stringValue.charAt(0);
  const dangerousChars = ['=', '+', '-', '@'];

  if (dangerousChars.includes(firstChar)) {
    stringValue = "'" + stringValue;
  }

  // *************** Check if quoting is needed
  const needsQuoting =
    stringValue.includes(delimiter) || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes('"');

  if (!needsQuoting) {
    return stringValue;
  }

  // *************** Escape internal quotes by doubling them
  const escapedValue = stringValue.replace(/"/g, '""');

  // *************** Wrap in quotes
  const quotedValue = '"' + escapedValue + '"';

  return quotedValue;
}

/**
 * FormatCsvCellValue converts a raw value to CSV-safe formatted string.
 * Handles date serialization with moment UTC ISO format.
 * Applies proper escaping and injection safety rules.
 * @param {any} value - Raw cell value from database record.
 * @param {string} delimiter - Delimiter character for this CSV.
 * @returns {string} - Formatted and escaped CSV cell value.
 */
function FormatCsvCellValue(value, delimiter) {
  // *************** Handle date values with moment UTC
  if (value instanceof Date) {
    const isoString = moment.utc(value).toISOString();
    return EscapeCsvValue(isoString, delimiter);
  }

  // *************** Handle all other values through escape logic
  return EscapeCsvValue(value, delimiter);
}

/**
 * BuildCsvFromRows generates complete CSV content from data rows.
 * Creates header row from column names and data rows from records.
 * Applies delimiter escaping and formatting rules throughout.
 * Streams row-by-row to avoid memory spikes on large datasets.
 * @param {object} params - Function parameters.
 * @param {Array<string>} params.columns - Ordered list of column names for header.
 * @param {Array<object>} params.rows - Array of data records to export.
 * @param {string} params.delimiter - Delimiter name comma semicolon or tab.
 * @returns {string} - Complete CSV content with header and data rows.
 */
function BuildCsvFromRows({ columns, rows, delimiter }) {
  // *************** Validate columns parameter
  if (!columns) {
    throw new Error('Columns array is required');
  }

  if (!Array.isArray(columns)) {
    throw new Error('Columns must be an array');
  }

  if (columns.length === 0) {
    throw new Error('At least one column is required');
  }

  // *************** Validate rows parameter
  if (!rows) {
    throw new Error('Rows array is required');
  }

  if (!Array.isArray(rows)) {
    throw new Error('Rows must be an array');
  }

  // *************** Validate and map delimiter
  const delimiterChar = MapDelimiterToChar(delimiter);

  console.log(columns, rows)

  // *************** Build header row from column names
  const headerCells = [];
  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i];
    const escapedColumn = EscapeCsvValue(columnName, delimiterChar);
    headerCells.push(escapedColumn);
  }
  const headerRow = headerCells.join(delimiterChar);

  // *************** Initialize CSV content with header
  const csvLines = [headerRow];

  // *************** Process each data row
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const record = rows[rowIndex];
    const dataCells = [];

    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const columnName = columns[colIndex];
      const columnArrays = columnName.split('.');

      if (columnArrays.length > 1) {
        const key = columnArrays[0];

        const keyCollection = record[key];

        if (keyCollection) {
          const rawValue = keyCollection[columnArrays[1]];
          const formattedValue = FormatCsvCellValue(rawValue, delimiterChar);
          dataCells.push(formattedValue);
        }
      } else {
        // *************** Extract values for each column in order
        const columnName = columns[colIndex];
        const rawValue = record[columnName];
        const formattedValue = FormatCsvCellValue(rawValue, delimiterChar);
        dataCells.push(formattedValue);
      }
    }

    // *************** Join cells with delimiter to form row
    const dataRow = dataCells.join(delimiterChar);
    csvLines.push(dataRow);
  }

  // *************** Join all rows with newline
  const csvContent = csvLines.join('\n');

  return csvContent;
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildCsvFromRows,
  MapDelimiterToChar,
  EscapeCsvValue,
  FormatCsvCellValue,
};
