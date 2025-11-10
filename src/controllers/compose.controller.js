// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULES ***************
const DynamicTableModel = require('../models/dynamic_table.model');
const DynamicRowTableModel = require('../models/dynamic_row_table.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT UTILITIES ***************
const { UploadCsvToS3 } = require('../utils/s3.uploader');
const { SendExportEmail } = require('../utils/email');

/**
 * GetAiTableById retrieves dynamic table definition and preview rows by table ID.
 * Used for demo preview to display generated table structure and sample data.
 * @param {object} req - Express request object with params containing id.
 * @param {object} res - Express response object for sending result or error.
 * @returns {Promise<void>} - Promise resolving when response is sent.
 * @throws {Error} - On validation or query errors after logging.
 */
async function GetAiTableById(req, res) {
  try {
    // *************** Validate req object exists
    if (!req) {
      throw new Error('Request object is required');
    }

    if (!req.params) {
      throw new Error('Request params is required');
    }

    // *************** Validate id parameter
    if (!req.params.id) {
      throw new Error('Missing table id');
    }

    const { page = 1, limit = 10 } = req.query;

    if (isNaN(page) || page < 1) {
      throw new Error('Invalid page number');
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid limit number');
    }

    const tableId = req.params.id;

    // *************** Query dynamic table by id
    const tableData = await DynamicTableModel.findById(tableId);

    if (!tableData) {
      throw new Error('Table not found');
    }

    // *************** Enforce ownership check to prevent unauthorized access
    if (req.userId && tableData.created_by && tableData.created_by.toString() !== req.userId.toString()) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const skip = (page - 1) * limit;

    // *************** Query rows by dynamic_table_id with limit for preview
    const rowsData = await DynamicRowTableModel.find({
      dynamic_table_id: tableId,
      status: 'active',
    })
      .limit(limit)
      .skip(skip);

    // *************** Construct output response
    const outputResponse = {
      table: {
        id: tableData._id,
        name: tableData.name,
        description: tableData.description,
        columns: tableData.columns,
        filters: tableData.filters,
        status: tableData.status,
        created_at: tableData.created_at,
        session_chat_id: tableData.session_chat_id,
      },
      rows: rowsData.map((row) => ({
        id: row._id,
        data: row.data,
        created_at: row.created_at,
      })),
      total_rows_preview: rowsData.length,
    };

    return res.status(200).json(outputResponse);
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({ params: req && req.params }),
      function_name: 'GetAiTableById',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
  }
}

/**
 * @function GetAllAiTables
 * @description
 * Retrieve all active AI-composed dynamic tables created by the authenticated user.
 * This function is responsible for fetching all dynamic tables linked to a specific user (via `created_by` field)
 * to display in the “My Tables” section. It enforces validation on the request object and ensures
 * proper error logging for any unexpected behavior. This endpoint helps the frontend list tables
 * that were composed via the AI assistant.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @property {string} req.userId - The authenticated user’s ID (injected by auth middleware).
 *
 * @returns {Promise<Object>} 200 - JSON response with tables and total count.
 * @returns {Promise<Object>} 500 - JSON response with error message when an exception occurs.
 *
 * @throws {Error} If `req` or `req.params` is missing.
 */
async function GetAllAiTables(req, res) {
  try {
    // *************** Validate req object exists
    if (!req) {
      throw new Error('Request object is required');
    }

    // *************** Query all dynamic tables
    if (!req.params) {
      throw new Error('Request body is required');
    }

    // *************** Extract user ID from authenticated request
    const userId = req.userId;

    // *************** Query dynamic tables created by user
    const tablesData = await DynamicTableModel.find({ created_by: userId, status: 'active' });

    // *************** Construct output response
    const outputResponse = {
      tables: tablesData.map((table) => ({
        id: table._id,
        name: table.name,
        description: table.description,
        columns: table.columns,
        filters: table.filters,
        status: table.status,
        session_chat_id: table.session_chat_id,
        created_at: table.created_at,
        created_by: table.created_by,
      })),
      total_tables: tablesData.length,
    };

    return res.status(200).json(outputResponse);
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({ params: req && req.params }),
      function_name: 'GetAllAiTables',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
  }
}

/**
 * Renames (title) and/or updates the description of an AI-composed table by its ID.
 * @function UpdateAITable
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<import('express').Response>} 200 with updated table metadata, 400/404/500 on error.
 *
 * @rationale
 * - Enforces validation-first and ownership: only creator can update.
 * - Name is optional but, if provided, must be trimmed, non-empty, and ≤ 60 chars.
 * - Description is optional; when provided, trimmed.
 * - Unique name per user enforced only when name changes.
 * - Linear, readable flow with explicit guards and DB error logging.
 *
 * @errorHandling
 * - 400: invalid/missing id, bad ObjectId, empty payload, invalid name, duplicate name.
 * - 404: table not found or not owned by requester.
 * - 500: unexpected errors (logged to ErrorLogModel).
 */
async function UpdateAITable(req, res) {
  // *************** WHY: Validate request envelope early to fail fast and avoid unnecessary DB calls
  if (!req) {
    return res.status(400).json({ error: 'Request object is required' });
  }

  if (!req.params) {
    return res.status(400).json({ error: 'Request params are required' });
  }
  if (!req.params.id) {
    return res.status(400).json({ error: 'Table ID is required' });
  }
  if (!req.body) {
    return res.status(400).json({ error: 'Request body is required' });
  }

  // *************** WHY: Normalize and validate identifiers and payload shape
  const tableId = String(req.params.id);
  const userId = req.userId;

  if (!mongoose.Types.ObjectId.isValid(tableId)) {
    return res.status(400).json({ error: 'Invalid table id format' });
  }
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Authenticated userId is required' });
  }

  // *************** WHY: Allow partial updates; only validate provided fields
  const incomingNameRaw = typeof req.body.name === 'string' ? req.body.name : null;
  const incomingDescRaw = typeof req.body.description === 'string' ? req.body.description : null;

  if (incomingNameRaw === null && incomingDescRaw === null) {
    return res.status(400).json({ error: 'Provide at least one field to update: name or description' });
  }

  // *************** WHY: Apply v3 naming constraints only when name is provided
  let normalizedName = null;
  if (incomingNameRaw !== null) {
    normalizedName = String(incomingNameRaw).trim();
    if (normalizedName.length === 0) {
      return res.status(400).json({ error: 'Table name cannot be empty' });
    }
    if (normalizedName.length > 60) {
      return res.status(400).json({ error: 'Table name must be 60 characters or fewer' });
    }
  }

  // *************** WHY: Build $set payload only with fields the caller sent
  const updatePayload = {};
  if (normalizedName !== null) {
    updatePayload.name = normalizedName;
  }

  if (incomingDescRaw !== null) {
    updatePayload.description = String(incomingDescRaw).trim();
  }

  try {
    // *************** WHY: Enforce uniqueness of name per user only if name is changing
    if (updatePayload.name) {
      const nameExists = await DynamicTableModel.exists({
        status: 'active',
        name: updatePayload.name,
        created_by: userId,
        _id: { $ne: tableId },
      });
      if (nameExists) {
        return res.status(400).json({ error: 'Table name must be unique' });
      }
    }

    // *************** WHY: Enforce ownership at query-level to avoid leaking table existence
    const queryCondition = {
      _id: tableId,
      created_by: userId,
      status: 'active',
    };

    // *************** WHY: Atomic update with validation; return lean doc for lightweight response
    const updatedTable = await DynamicTableModel.findOneAndUpdate(queryCondition, { $set: updatePayload }, { new: true }).lean();

    if (!updatedTable) {
      return res.status(404).json({ error: 'Table not found or not owned by the user' });
    }

    // *************** WHY: Construct a clean response object with stable keys
    const outputResponse = {
      id: updatedTable._id,
      name: updatedTable.name,
      description: updatedTable.description,
      columns: updatedTable.columns,
      filters: updatedTable.filters,
      status: updatedTable.status,
      created_at: updatedTable.created_at || updatedTable.createdAt || null,
      updated_at: updatedTable.updated_at || updatedTable.updatedAt || null,
    };

    return res.status(200).json(outputResponse);
  } catch (error) {
    // *************** WHY: Persist full context for post-mortem debugging and audit
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({
        params: { id: tableId },
        body: { name: incomingNameRaw, description: incomingDescRaw },
        userId: userId,
      }),
      function_name: 'UpdateAITable',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
  }
}

/**
 * Deletes a student's AI-composed table (metadata) and all of its materialized rows.
 *
 * @function DeleteAIStudentTable
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>}
 *
 * @rationale
 * - Validation-first: guard request, params, ids, and ownership before mutating data.
 * - Safety: hard-delete rows (materialized data), soft-delete the table metadata for auditability.
 * - Scope: only allows deleting tables created by the authenticated user.
 * - Observability: logs rich context to ErrorLogModel on failure.
 *
 * @errorHandling
 * - 400: missing/invalid id, missing auth.
 * - 404: table not found or not owned by user.
 * - 500: unexpected errors (logged).
 */
async function DeleteAIStudentTable(req, res) {
  // *************** WHY: Fail fast on envelope issues to avoid unnecessary DB operations
  if (!req) {
    return res.status(400).json({ error: 'Request object is required' });
  }
  if (!req.params) {
    return res.status(400).json({ error: 'Request params are required' });
  }
  if (!req.params.id) {
    return res.status(400).json({ error: 'Table ID is required' });
  }
  if (!req.userId) {
    return res.status(400).json({ error: 'Authenticated userId is required' });
  }

  const tableId = String(req.params.id);
  const userId = String(req.userId);

  if (!mongoose.Types.ObjectId.isValid(tableId)) {
    return res.status(400).json({ error: 'Invalid table id format' });
  }
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user id format' });
  }

  try {
    // *************** Validation Section: ensure table exists and is owned by the requester
    const tableQueryCondition = {
      _id: tableId,
      created_by: userId,
      status: { $ne: 'deleted' },
    };

    const existingTable = await DynamicTableModel.findOne(tableQueryCondition).lean();

    if (!existingTable) {
      return res.status(404).json({ error: 'Table not found or not owned by the user' });
    }

    // *************** Optional strictness: ensure base entity is students for this endpoint
    if (existingTable.base_entity && existingTable.base_entity !== 'students') {
      return res.status(400).json({ error: 'Only student tables can be deleted via this endpoint' });
    }

    // *************** Query Section: delete materialized rows first
    const deleteRowsResult = await DynamicRowTableModel.deleteMany({ dynamic_table_id: tableId });

    // *************** Transformation Section: soft-delete the table metadata (audit-friendly)
    const softDeleteUpdate = {
      status: 'deleted',
      deleted_at: new Date(),
    };

    const deletedTable = await DynamicTableModel.findOneAndUpdate(
      { _id: tableId, created_by: userId },
      { $set: softDeleteUpdate },
      { new: true }
    ).lean();

    if (!deletedTable) {
      return res.status(404).json({ error: 'Table became unavailable during deletion' });
    }

    // *************** Output Section: clean response with counts and timestamps
    const outputResponse = {
      id: deletedTable._id,
      name: deletedTable.name,
      status: deletedTable.status,
      deleted_rows_count: deleteRowsResult && deleteRowsResult.deletedCount ? deleteRowsResult.deletedCount : 0,
      deleted_at: deletedTable.deleted_at || null,
    };

    return res.status(200).json(outputResponse);
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({
        params: { id: tableId },
        userId: req && req.userId ? req.userId : null,
      }),
      function_name: 'DeleteAIStudentTable',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
  }
}

/**
 * Flattens a nested object (objects → dot keys; arrays → joined by ", ").
 * Null and undefined become empty string. Dates become ISO strings.
 * @param {Object} inputObj - The row.data object to flatten.
 * @param {string} prefix - Internal: path prefix when recursing.
 * @returns {Object} Flat object with dot keys.
 */
function FlattenRowDataForCsv(inputObj, prefix = '') {
  const outputObject = {};

  if (inputObj === null || inputObj === undefined) {
    return outputObject;
  }

  if (typeof inputObj !== 'object' || inputObj instanceof Date) {
    const keyName = prefix.length > 0 ? prefix : '';
    if (keyName.length > 0) {
      outputObject[keyName] = inputObj instanceof Date ? inputObj.toISOString() : String(inputObj);
    }
    return outputObject;
  }

  const objectKeys = Object.keys(inputObj);
  for (let index = 0; index < objectKeys.length; index++) {
    const keyName = objectKeys[index];
    const value = inputObj[keyName];
    const nextPrefix = prefix.length > 0 ? prefix + '.' + keyName : keyName;

    if (value !== null && typeof value === 'object' && Array.isArray(value) === false && !(value instanceof Date)) {
      const nestedFlat = FlattenRowDataForCsv(value, nextPrefix);
      const nestedKeys = Object.keys(nestedFlat);
      for (let j = 0; j < nestedKeys.length; j++) {
        const nestedKey = nestedKeys[j];
        outputObject[nestedKey] = nestedFlat[nestedKey];
      }
      continue;
    }

    if (Array.isArray(value)) {
      const arrayJoined = value.map(function mapArrayToString(arrayItem) {
        if (arrayItem === null || arrayItem === undefined) {
          return '';
        }
        if (arrayItem instanceof Date) {
          return arrayItem.toISOString();
        }
        return String(arrayItem);
      }).join(', ');
      outputObject[nextPrefix] = arrayJoined;
      continue;
    }

    if (value instanceof Date) {
      outputObject[nextPrefix] = value.toISOString();
      continue;
    }

    if (value === null || value === undefined) {
      outputObject[nextPrefix] = '';
      continue;
    }

    outputObject[nextPrefix] = String(value);
  }

  return outputObject;
}

/**
 * Escapes a single CSV cell value.
 * @param {any} rawValue - Value to escape.
 * @param {string} delimiter - CSV delimiter (e.g., ",", ";", "\t").
 * @returns {string} Escaped value safe for CSV.
 */
function CsvEscapeSimple(rawValue, delimiter) {
  let stringValue = '';

  if (rawValue === null || rawValue === undefined) {
    stringValue = '';
  } else {
    stringValue = String(rawValue);
  }

  if (stringValue.length > 0) {
    const firstChar = stringValue.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@') {
      stringValue = "'" + stringValue;
    }
  }

  const mustQuote = stringValue.indexOf(delimiter) >= 0
    || stringValue.indexOf('\n') >= 0
    || stringValue.indexOf('\r') >= 0
    || stringValue.indexOf('"') >= 0;

  if (mustQuote) {
    const doubled = stringValue.replace(/"/g, '""');
    const quoted = '"' + doubled + '"';
    return quoted;
  }

  return stringValue;
}

/**
 * Exports manual AI table rows to CSV (supports nested objects in row.data).
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @returns {Promise<import('express').Response>}
 *
 * @throws Will log error to ErrorLogModel and rethrow Apollo-style message
 */
async function ExportManualAITable(req, res) {
  try {
    // *************** Validation Section (fail fast)
    const tableId = req && req.params ? req.params.id : null;
    if (!tableId) {
      throw new Error('Missing table id');
    }

    const requestBody = req && req.body ? req.body : {};
    const isSelectAll = requestBody.is_select_all;
    const includedIds = requestBody.included_ids;
    const excludedIds = requestBody.excluded_ids;
    const delimiter = requestBody.delimiter;
    const languageInput = requestBody.lang;

    if (typeof isSelectAll !== 'boolean') {
      throw new Error('is_select_all must be a boolean');
    }

    const includedIsArray = Array.isArray(includedIds);
    const excludedIsArray = Array.isArray(excludedIds);
    if (!includedIsArray && !excludedIsArray) {
      throw new Error('included_ids and excluded_ids must be arrays');
    }

    if (typeof delimiter !== 'string' || delimiter.length === 0) {
      throw new Error('Invalid delimiter');
    }

    const exportLang = (typeof languageInput === 'string' && (languageInput === 'fr' || languageInput === 'en')) ? languageInput : 'en';

    // *************** Query Section (collect rows according to selection)
    const collectedRows = [];

    if (isSelectAll === true) {
      if (excludedIsArray && excludedIds.length > 0) {
        const queryResultExcluded = await DynamicRowTableModel.find({
          dynamic_table_id: tableId,
          status: 'active',
          _id: { $nin: excludedIds }
        }).lean();
        for (let i = 0; i < queryResultExcluded.length; i++) {
          collectedRows.push(queryResultExcluded[i]);
        }
      } else {
        const queryResultAll = await DynamicRowTableModel.find({
          dynamic_table_id: tableId,
          status: 'active'
        }).lean();
        for (let i = 0; i < queryResultAll.length; i++) {
          collectedRows.push(queryResultAll[i]);
        }
      }
    } else {
      if (includedIsArray && includedIds.length > 0) {
        const queryResultIncluded = await DynamicRowTableModel.find({
          dynamic_table_id: tableId,
          status: 'active',
          _id: { $in: includedIds }
        }).lean();
        for (let i = 0; i < queryResultIncluded.length; i++) {
          collectedRows.push(queryResultIncluded[i]);
        }
      }
    }

    // *************** Guard: no rows
    if (collectedRows.length === 0) {
      const emptyOutput = { rows: [], total_rows: 0 };
      const emptyResponse = res.status(200).json(emptyOutput);
      return emptyResponse;
    }

    // *************** Transformation Section (CSV build - SIMPLE MODE)
    const firstRow = collectedRows[0];
    const firstRowData = firstRow && firstRow.data ? firstRow.data : {};
    const firstFlat = FlattenRowDataForCsv(firstRowData);
    const columnLabels = Object.keys(firstFlat);

    const headerLine = columnLabels.map(function mapHeaderToEscaped(headerKey) {
      return CsvEscapeSimple(headerKey, delimiter);
    }).join(delimiter);

    let csvBodyString = '';
    for (let r = 0; r < collectedRows.length; r++) {
      const currentRow = collectedRows[r];
      const currentData = currentRow && currentRow.data ? currentRow.data : {};
      const flattened = FlattenRowDataForCsv(currentData);

      const cells = [];
      for (let c = 0; c < columnLabels.length; c++) {
        const keyName = columnLabels[c];
        const rawValue = Object.prototype.hasOwnProperty.call(flattened, keyName) ? flattened[keyName] : '';
        const escaped = CsvEscapeSimple(rawValue, delimiter);
        cells.push(escaped);
      }

      csvBodyString += cells.join(delimiter) + '\n';
    }

    const csvContent = headerLine + '\n' + csvBodyString;

    // *************** Output Section (S3 upload + email)
    const nameSource = 'export-students';
    const uploadResult = await UploadCsvToS3({
      csvContent: csvContent,
      nameSource: nameSource
    });

    await SendExportEmail({
      userId: req.userId,
      csvResultString: 'Exported ' + String(collectedRows.length) + ' rows with ' + String(columnLabels.length) + ' columns',
      fileUrl: uploadResult && uploadResult.url ? uploadResult.url : '',
      lang: exportLang
    });

    const successOutput = { success: true, rows_exported: collectedRows.length };
    const successResponse = res.status(200).json(successOutput);
    return successResponse;
  } catch (error) {
    // *************** Error Handling Section (log + rethrow)
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({
        params: req ? req.params : null,
        body: req ? req.body : null
      }),
      function_name: 'ExportManualAITable',
      error: String(error.stack)
    });

    const failureResponse = res.status(500).json({ error: error.message });
    return failureResponse;
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  GetAiTableById,
  GetAllAiTables,
  UpdateAITable,
  DeleteAIStudentTable,
  ExportManualAITable,
};
