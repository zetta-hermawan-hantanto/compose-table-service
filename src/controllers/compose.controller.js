// *************** IMPORT MODULES ***************
const DynamicTableModel = require('../models/dynamic_table.model');
const DynamicRowTableModel = require('../models/dynamic_row_table.model');
const ErrorLogModel = require('../models/error_log.model');

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

    const tableId = req.params.id;

    // *************** Query dynamic table by id
    const tableData = await DynamicTableModel.findById(tableId);

    if (!tableData) {
      throw new Error('Table not found');
    }

    // *************** Query rows by dynamic_table_id with limit for preview
    const rowsData = await DynamicRowTableModel.find({
      dynamic_table_id: tableId,
      status: 'active',
    }).limit(100);

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

async function GetAllAiTables(req, res) {
  try {
    // *************** Validate req object exists
    if (!req) {
      throw new Error('Request object is required');
    }

    // *************** Query all dynamic tables
    if (!req.params) {
      throw new Error('Request body is required');
    };

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

// *************** EXPORT MODULE ***************
module.exports = {
  GetAiTableById,
  GetAllAiTables,
};
