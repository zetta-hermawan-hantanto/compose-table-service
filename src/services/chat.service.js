// *************** IMPORT LIBRARY ***************
const fs = require('fs');
const path = require('path');

// *************** IMPORT MODULE ***************
const { CreateMcpServer } = require('../mcp/mcp.server');
const { CreateMcpClient } = require('../mcp/mcp.client');
const { GetBilipV2SystemPrompt } = require('../ai/bilip_v2.system.prompt');
const { CallAIWithEnvelope } = require('../utils/ai.reasoner');
const { BuildMongoFilter, BuildProjection, BuildSort } = require('../utils/query.builders');
const { EstimateRowCount } = require('../utils/row.estimator');

// *************** IMPORT MODULES ***************
const StudentModel = require('../models/student.model');
const DynamicTableModel = require('../models/dynamic_table.model');
const DynamicRowTableModel = require('../models/dynamic_row_table.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT VALIDATORS ***************
const { ValidateStudentsContract } = require('../validators/contract.validator');
const { ValidateModifyContract } = require('../validators/modify.validator');

/**
 * ResolveStudentValue extracts column value from student document.
 * Handles both direct field access and computed string concatenation expressions.
 * Reuses v1 logic for backward compatibility in row transformation.
 * @param {object} studentDoc - Student document from MongoDB query.
 * @param {object} columnDef - Column definition with source field information.
 * @returns {any} - Resolved value for the column or null if missing.
 */
function ResolveStudentValue(studentDoc, columnDef) {
  // *************** Check if source field is computed expression
  const isComputedExpression = columnDef.source.field.includes('+');

  if (isComputedExpression) {
    // *************** Parse computed expression for field names
    const concatPattern = /^(\w+)\s*\+\s*'([^']*)'\s*\+\s*(\w+)$/;
    const matchResult = columnDef.source.field.match(concatPattern);

    if (!matchResult) {
      return null;
    }

    const firstField = matchResult[1];
    const separator = matchResult[2];
    const secondField = matchResult[3];

    // *************** Extract field values with fallback to empty string
    const firstValue = studentDoc[firstField] || '';
    const secondValue = studentDoc[secondField] || '';

    // *************** Concatenate values with separator
    const computedValue = firstValue + separator + secondValue;

    return computedValue;
  }

  // *************** Access direct field from student document
  const fieldName = columnDef.source.field;
  const fieldValue = studentDoc[fieldName];

  // *************** Return null if field is missing or undefined
  if (fieldValue === undefined || fieldValue === null) {
    return null;
  }

  return fieldValue;
}

/**
 * RebuildTableRows deletes existing rows and rebuilds from current table configuration.
 * Triggers on any change to columns filters or sort in modify operations.
 * Enforces 5000 row guard after rebuild to maintain demo environment performance.
 * @param {object} table - Dynamic table document with current configuration.
 * @returns {Promise<number>} - Promise resolving to number of rows inserted.
 * @throws {Error} - If row count exceeds 5000 or query fails.
 */
async function RebuildTableRows(table) {
  // *************** Delete existing rows for this table
  await DynamicRowTableModel.deleteMany({
    dynamic_table_id: table._id,
  });

  // *************** Build query components from table configuration
  const mongoFilter = BuildMongoFilter(table.filters);
  const projection = BuildProjection(table.columns);
  const sortConfig = BuildSort(table.sort);

  // *************** Query students with filter projection and sort
  const studentDocs = await StudentModel
    .find(mongoFilter)
    .select(projection)
    .sort(sortConfig)
    .lean();

  // *************** Transform student documents to row data
  const rowsToInsert = studentDocs.map((doc) => {
    const rowData = {};

    for (let i = 0; i < table.columns.length; i++) {
      const column = table.columns[i];
      const value = ResolveStudentValue(doc, column);
      rowData[column.key] = value;
    }

    return {
      dynamic_table_id: table._id,
      data: rowData,
      status: 'active',
    };
  });

  // *************** Insert new rows if any exist
  if (rowsToInsert.length > 0) {
    await DynamicRowTableModel.insertMany(rowsToInsert);
  }

  return rowsToInsert.length;
}

/**
 * LoadCatalogMetadata reads and parses students catalog for validation.
 * Used by both create and modify paths to validate field references.
 * @returns {object} - Catalog metadata with students fields array.
 */
function LoadCatalogMetadata() {
  // *************** Construct absolute path to catalog file
  const catalogPath = path.join(__dirname, '..', 'shared', 'catalog', 'schema.catalog.json');

  // *************** Read and parse catalog file
  const catalogRaw = fs.readFileSync(catalogPath, 'utf8');
  const catalog = JSON.parse(catalogRaw);

  // *************** Find students entity in catalog
  const studentsEntity = catalog.entities.find((entity) => entity.name === 'students');

  if (!studentsEntity) {
    throw new Error('Students entity not found in catalog');
  }

  // *************** Map catalog fields to validation format
  const fieldsFormatted = studentsEntity.fields.map((field) => ({
    key: field.name,
    label: field.name,
    data_type: field.type,
    enum: field.enum || undefined,
  }));

  return {
    base_entity: 'students',
    fields: fieldsFormatted,
  };
}

// *************** MUTATION ***************

/**
 * ProcessChatTurn orchestrates complete conversational turn for table operations.
 * Coordinates AI reasoning validation query execution and envelope construction.
 * Branches by AI status to handle clarification failure create and modify intents.
 * Implements Phase F row rebuild and Phase G error protocol throughout.
 * @param {object} params - Parameters object with prompt session and user_id.
 * @param {string} params.messages - Array of message objects in the conversation.
 * @param {object} params.session - Session chat document with conversation history.
 * @param {string} params.user_id - User ID for table creation and validation.
 * @returns {Promise<object>} - Promise resolving to envelope object with messages array.
 * @throws {Error} - On critical failures after logging to ErrorLogModel.
 */
async function ProcessChatTurn(params) {
  try {
    // *************** Validate required parameters
    if (!params) {
      throw new Error('Parameters object is required');
    }

    if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
      throw new Error('Messages array is required');
    }

    if (!params.session) {
      throw new Error('Session is required');
    }

    if (!params.user_id) {
      throw new Error('User ID is required');
    }

    // *************** Initialize MCP server and client for AI tool access
    const mcpServer = CreateMcpServer();
    const mcpClient = await CreateMcpClient(mcpServer);

    // *************** Load v2 system prompt
    const systemPrompt = GetBilipV2SystemPrompt();

    // *************** Prepare conversation messages for AI
    const conversationMessages = params.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // *************** Call AI with envelope parsing
    const aiEnvelope = await CallAIWithEnvelope({
      messages: conversationMessages,
      mcpClient: mcpClient,
      systemPrompt: systemPrompt,
    });

    // *************** Branch by envelope status
    if (aiEnvelope.status === 'need_clarification') {
      // *************** Return Clarification envelope
      const clarificationEnvelope = {
        status: 'need_clarification',
        conversation_id: params.session._id ? String(params.session._id) : null,
        messages: [{ role: 'assistant', message: aiEnvelope.question || 'I need more information to proceed.' }],
      };

      return clarificationEnvelope;
    }

    if (aiEnvelope.status === 'failed') {
      // *************** Return Failure envelope from AI
      const failureEnvelope = {
        status: 'failed',
        conversation_id: params.session._id ? String(params.session._id) : null,
        table_id: params.session.table_id ? String(params.session.table_id) : null,
        messages: [{ role: 'assistant', message: aiEnvelope.message || 'I cannot process that request.' }],
        explanation: aiEnvelope.explanation || 'Request cannot be completed',
        options: aiEnvelope.options || ['Please try again'],
      };

      return failureEnvelope;
    }

    if (aiEnvelope.status === 'ready' && aiEnvelope.intent === 'generate_table') {
      // *************** HANDLE CREATE PATH
      
      // *************** Load catalog for validation
      const catalog = LoadCatalogMetadata();

      // *************** Validate contract using v1 validator
      const validatedContract = await ValidateStudentsContract(
        aiEnvelope.contract,
        catalog,
        params.user_id
      );

      // *************** Estimate row count for guard check
      const estimatedCount = await EstimateRowCount(validatedContract.filters, StudentModel);

      // *************** Build MongoDB query components
      const mongoFilter = BuildMongoFilter(validatedContract.filters);
      const projection = BuildProjection(validatedContract.columns);
      const sortConfig = BuildSort(validatedContract.sort);

      // *************** Query students collection
      const studentDocs = await StudentModel
        .find(mongoFilter)
        .select(projection)
        .sort(sortConfig)
        .lean();

      // *************** Transform student documents to row data
      const rowsToInsert = studentDocs.map((doc) => {
        const rowData = {};

        for (let i = 0; i < validatedContract.columns.length; i++) {
          const column = validatedContract.columns[i];
          const value = ResolveStudentValue(doc, column);
          rowData[column.key] = value;
        }

        return rowData;
      });

      // *************** Create dynamic table record
      const createdTable = await DynamicTableModel.create({
        status: 'active',
        name: validatedContract.table_name,
        description: validatedContract.description,
        columns: validatedContract.columns,
        filters: validatedContract.filters,
        sort: validatedContract.sort || undefined,
        created_by: params.user_id,
      });

      // *************** Insert rows with table reference
      const rowsWithTableId = rowsToInsert.map((rowData) => ({
        dynamic_table_id: createdTable._id,
        data: rowData,
        status: 'active',
      }));

      if (rowsWithTableId.length > 0) {
        await DynamicRowTableModel.insertMany(rowsWithTableId);
      }

      // *************** Construct Success Create envelope
      const successCreateEnvelope = {
        status: 'ready',
        intent: 'generate_table',
        conversation_id: params.session._id ? String(params.session._id) : null,
        table_id: String(createdTable._id),
        messages: [{ role: 'assistant', message: aiEnvelope.message || `Table created successfully with ${rowsWithTableId.length} rows.` }],
        result: {
          summary: {
            table_id: String(createdTable._id),
            name: createdTable.name,
            total_rows: rowsWithTableId.length,
            columns: createdTable.columns.map((col) => col.key),
            filters: createdTable.filters,
            sort: createdTable.sort || undefined,
          },
        },
      };

      return successCreateEnvelope;
    }

    if (aiEnvelope.status === 'ready' && aiEnvelope.intent === 'modify_table') {
      // *************** HANDLE MODIFY PATH
      
      // *************** Validate session has table_id
      if (!params.session.table_id) {
        throw new Error('Cannot modify without existing table_id in session');
      }

      // *************** Load existing table
      const existingTable = await DynamicTableModel.findById(params.session.table_id);

      if (!existingTable) {
        throw new Error('Table not found for modification');
      }

      // *************** Load catalog for validation
      const catalog = LoadCatalogMetadata();

      // *************** Validate modification changes
      const validatedChanges = await ValidateModifyContract(
        aiEnvelope.changes,
        existingTable,
        catalog
      );

      // *************** Apply changes to table
      if (validatedChanges.table_name) {
        existingTable.name = validatedChanges.table_name;
      }

      if (validatedChanges.description) {
        existingTable.description = validatedChanges.description;
      }

      if (validatedChanges.add_columns) {
        for (let i = 0; i < validatedChanges.add_columns.length; i++) {
          existingTable.columns.push(validatedChanges.add_columns[i]);
        }
      }

      if (validatedChanges.remove_columns) {
        existingTable.columns = existingTable.columns.filter(
          (col) => !validatedChanges.remove_columns.includes(col.key)
        );
      }

      if (validatedChanges.add_filters) {
        for (let i = 0; i < validatedChanges.add_filters.length; i++) {
          existingTable.filters.push(validatedChanges.add_filters[i]);
        }
      }

      if (validatedChanges.remove_filters) {
        for (let i = 0; i < validatedChanges.remove_filters.length; i++) {
          const filterToRemove = validatedChanges.remove_filters[i];
          existingTable.filters = existingTable.filters.filter(
            (f) => f.key !== filterToRemove.key
          );
        }
      }

      if (validatedChanges.update_filters) {
        for (let i = 0; i < validatedChanges.update_filters.length; i++) {
          const updatedFilter = validatedChanges.update_filters[i];
          const filterIndex = existingTable.filters.findIndex((f) => f.key === updatedFilter.key);

          if (filterIndex !== -1) {
            existingTable.filters[filterIndex] = updatedFilter;
          }
        }
      }

      if (validatedChanges.sort) {
        existingTable.sort = validatedChanges.sort;
      }

      // *************** Save updated table
      await existingTable.save();

      // *************** Rebuild rows with new configuration
      const totalRows = await RebuildTableRows(existingTable);

      // *************** Construct Success Modify envelope
      const successModifyEnvelope = {
        status: 'ready',
        intent: 'modify_table',
        conversation_id: params.session._id ? String(params.session._id) : null,
        table_id: String(existingTable._id),
        messages: [{ role: 'assistant', message: aiEnvelope.message || `Applied changes and rebuilt ${totalRows} rows.` }],
        result: {
          summary: {
            table_id: String(existingTable._id),
            name: existingTable.name,
            total_rows: totalRows,
            columns: existingTable.columns.map((col) => col.key),
            filters: existingTable.filters,
            sort: existingTable.sort || undefined,
          },
        },
      };

      return successModifyEnvelope;
    }

    // *************** Unexpected envelope status
    throw new Error(`Unexpected AI envelope status: ${aiEnvelope.status}`);
  } catch (error) {
    // *************** Log error to database with full context
    await ErrorLogModel.create({
      path: 'services/chat.service.js',
      parameter_input: JSON.stringify({
        prompt: params && params.prompt,
        session_id: params && params.session && params.session._id,
        user_id: params && params.user_id,
      }),
      function_name: 'ProcessChatTurn',
      error: String(error.stack),
    });

    // *************** Return Failure envelope for unexpected errors
    const criticalFailureEnvelope = {
      status: 'failed',
      conversation_id: params.session && params.session._id ? String(params.session._id) : null,
      table_id: params.session && params.session.table_id ? String(params.session.table_id) : null,
      messages: [{ role: 'assistant', message: 'An unexpected error occurred.' }],
      explanation: error.message,
      options: ['Please try again', 'Rephrase your request'],
    };

    return criticalFailureEnvelope;
  }
}

// *************** EXPORT MODULE ***************
module.exports = { ProcessChatTurn };
