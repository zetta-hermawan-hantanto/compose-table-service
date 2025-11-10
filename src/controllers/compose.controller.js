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
 * Exports selected rows from a dynamic student table as a CSV download.
 *
 * @function ExportManualAITable
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<import('express').Response>}
 *
 * @rationale
 * - Manual selection:
 *    - is_select_all = true  -> export ALL active rows MINUS excluded_ids
 *    - is_select_all = false -> export ONLY included_ids
 * - Validates ownership (only table owner can export).
 * - Uses table's column order to shape CSV headers/values.
 * - CSV hygiene: quotes doubled, leading (= + - @) prefixed with ', null -> "".
 * - Streams CSV to client for immediate download (no S3/email).
 *
 * @errorHandling
 * - 400: invalid payload/ids, empty selection, invalid delimiter.
 * - 404: table not found or not owned by requester.
 * - 500: unexpected errors (logged to ErrorLogModel).
 */
async function ExportManualAITable(req, res) {
  try {
    const tableId = req.params.id;
    const { is_select_all, included_ids, excluded_ids, delimiter, lang } = req.body;

    // *************** Validate request parameters
    if (!tableId) {
      throw new Error('Missing table id');
    }

    if (typeof is_select_all !== 'boolean') {
      throw new Error('is_select_all must be a boolean');
    }

    if (!Array.isArray(included_ids) && !Array.isArray(excluded_ids)) {
      throw new Error('included_ids and excluded_ids must be arrays');
    }

    if (typeof delimiter !== 'string' || !delimiter) {
      throw new Error('Invalid delimiter');
    }

    if (!lang || typeof lang !== 'string' || ['fr', 'en'].includes(lang) === false) {
      lang = 'en';
    }

    const allRows = [];

    if (is_select_all) {
      if (Array.isArray(excluded_ids) && excluded_ids.length) {
        allRows.push(
          ...(await DynamicRowTableModel.find({ dynamic_table_id: tableId, status: 'active', _id: { $nin: excluded_ids } }).lean())
        );
      } else {
        allRows.push(...(await DynamicRowTableModel.find({ dynamic_table_id: tableId, status: 'active' }).lean()));
      }
    } else {
      if (Array.isArray(included_ids) && included_ids.length) {
        allRows.push(
          ...(await DynamicRowTableModel.find({ dynamic_table_id: tableId, status: 'active', _id: { $in: included_ids } }).lean())
        );
      }
    }

    // *************** Handle case of no rows to export
    if (allRows.length === 0) {
      return res.status(200).json({ rows: [], total_rows: 0 });
    }

    // *************** Query dynamic table by id
    const tableDoc = await DynamicTableModel.findById(tableId).lean();
    if (!tableDoc) {
      throw new Error('Table not found');
    }

    // *************** Enforce ownership check to prevent unauthorized access
    const columnLabels = tableDoc.columns.map((col) => col.label);

    // *************** Build CSV content
    let finalStringRows = '';

    // *************** Build CSV content from allRows
    for (const row of allRows) {
      finalStringRows += Object.values(row.data).join(delimiter) + '\n';
    }

    // *************** Combine header and data rows
    const csvContent = columnLabels.join(delimiter) + '\n' + finalStringRows;

    // *************** Determine name source for filename
    const nameSource = 'export-students';

    // *************** Upload CSV to S3 and get presigned URL
    const uploadResult = await UploadCsvToS3({
      csvContent: csvContent,
      nameSource: nameSource,
    });

    // *************** Send export email to user
    await SendExportEmail({
      userId: req.userId,
      csvResultString: `Exported ${allRows.length} rows with ${columnLabels.length} columns`,
      fileUrl: uploadResult.url,
      lang: lang,
    });

    return res.status(200).json({ success: true, rows_exported: allRows.length });
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({ params: req && req.params, body: req && req.body }),
      function_name: 'ExportManualAITable',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
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
