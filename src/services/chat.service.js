// *************** IMPORT LIBRARY ***************
const fs = require('fs');
const path = require('path');

// *************** IMPORT MODULE ***************
const { CreateMcpServer } = require('../mcp/mcp.server');
const { CreateMcpClient } = require('../mcp/mcp.client');
const { GetBilipV2SystemPrompt } = require('../ai/bilip_v2.system.prompt');
const { CallAIWithEnvelope } = require('../utils/ai.reasoner');
const { ProcessExportTurn } = require('./export.service');
const CatalogService = require('./catalog.service');
const PlanValidator = require('../validators/plan.validator');
const JoinPlanner = require('./join.planner');
const AggregationBuilderV2 = require('../utils/aggregation.builder.v2');

// *************** IMPORT MODULES ***************
const StudentModel = require('../models/student.model');
const DynamicTableModel = require('../models/dynamic_table.model');
const DynamicRowTableModel = require('../models/dynamic_row_table.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT VALIDATORS ***************
const { ValidateStudentsContract } = require('../validators/contract.validator.v4.2');
const { ValidateModifyContract } = require('../validators/modify.validator');

/**
 * ConvertContractToPlan converts v3 contract format to v4.2 plan format.
 * Extracts columns filters and sort from validated contract into plan structure.
 * @param {object} contract - Validated contract from AI or validation layer.
 * @returns {object} - Plan object compatible with v4.2 engine.
 */
function ConvertContractToPlan(contract) {
  // *************** Extract entry entity default to students
  const entry = contract.entry || 'students';

  // *************** Convert columns from contract format to plan format
  const columns = contract.columns.map((col) => ({
    path: col.key,
    alias: col.key,
  }));

  // *************** Convert filters from contract format to plan format
  const filters = (contract.filters || []).map((filter) => ({
    path: filter.key,
    op: filter.operator,
    value: filter.value,
  }));

  // *************** Convert sort from contract format to plan format
  let sort = null;
  if (contract.sort && contract.sort.length > 0) {
    sort = contract.sort.map((s) => ({
      path: s.key,
      dir: s.direction,
    }));
  }

  // *************** Construct plan object
  const plan = {
    entry: entry,
    columns: columns,
    filters: filters,
    sort: sort,
    limit: contract.limit || 10000,
    metadata: {
      intent: 'generate_table',
      table_name: contract.table_name,
      description: contract.description,
    },
  };

  return plan;
}

/**
 * RebuildTableRows deletes existing rows and rebuilds from current table configuration.
 * Uses v4.2 engine with PlanValidator JoinPlanner and AggregationBuilder v2.
 * Reconstructs plan from table metadata and validates before execution.
 * @param {object} table - Dynamic table document with current configuration.
 * @returns {Promise<number>} - Promise resolving to number of rows inserted.
 * @throws {Error} - If validation fails or query fails.
 */
async function RebuildTableRows(table) {
  // *************** Delete existing rows for this table
  await DynamicRowTableModel.deleteMany({
    dynamic_table_id: table._id,
  });

  // *************** Reconstruct plan from table metadata or stored plan
  let plan;
  
  if (table.plan_metadata && table.plan_metadata.plan) {
    // *************** Use stored plan if available
    plan = table.plan_metadata.plan;
  } else {
    // *************** Reconstruct plan from table columns filters sort
    plan = {
      entry: 'students',
      columns: table.columns.map((col) => ({
        path: col.key,
        alias: col.key,
      })),
      filters: (table.filters || []).map((filter) => ({
        path: filter.key,
        op: filter.operator,
        value: filter.value,
      })),
      sort: (table.sort || []).map((s) => ({
        path: s.key,
        dir: s.direction,
      })),
      limit: 10000,
    };
  }

  // *************** Validate plan against catalog
  const validation = PlanValidator.ValidatePlan(plan);

  if (!validation.isValid) {
    throw new Error(`Plan validation failed: ${validation.errors.join('; ')}`);
  }

  // *************** Plan joins from field paths
  const joinPlan = JoinPlanner.PlanJoins(plan);

  // *************** Build aggregation pipeline using v4.2 engine
  const pipeline = AggregationBuilderV2.BuildPipeline(plan, joinPlan);

  // *************** Execute aggregation pipeline
  const studentDocs = await StudentModel.aggregate(pipeline);

  // *************** Transform documents to row data format
  const rowsToInsert = studentDocs.map((doc) => ({
    dynamic_table_id: table._id,
    data: doc,
    status: 'active',
  }));

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
  const fieldsFormatted = [];

  catalog.entities.forEach((entity) => {
    if (entity.name === 'students') {
      const entityFields = entity.fields.map((field) => ({
        key: field.name,
        label: field.name,
        data_type: field.type,
        enum: field.enum || null,
      }));
      fieldsFormatted.push(...entityFields);
    } else {
      const entityFields = entity.fields.map((field) => ({
        key: `${entity.name}.${field.name}`,
        label: `${entity.name}.${field.name}`,
        data_type: field.type,
        enum: field.enum || null,
      }));
      fieldsFormatted.push(...entityFields);
    }
  });

  return {
    base_entity: 'students',
    fields: fieldsFormatted,
  };
}

// *************** MUTATION ***************

/**
 * ProcessChatTurn orchestrates complete conversational turn for table operations.
 * Coordinates AI reasoning validation query execution and envelope construction.
 * Branches by AI status to handle clarification failure create modify and export intents.
 * Implements Phase F row rebuild and Phase G error protocol throughout.
 * @param {object} params - Parameters object with prompt session user_id and lang.
 * @param {string} params.messages - Array of message objects in the conversation.
 * @param {object} params.session - Session chat document with conversation history.
 * @param {string} params.user_id - User ID for table creation and validation.
 * @param {string} params.lang - Language code en or fr for export messages.
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

    // *************** Inject context information about current session state
    const contextMessage = [];
    if (params.session.table_id) {
      contextMessage.push(`[CONTEXT: Current active table_id is "${params.session.table_id}". Use this ID when calling tables_get_schema for modify operations.]`);
    }
    
    if (contextMessage.length > 0) {
      // Add context as system-level instruction before user messages
      conversationMessages.unshift({
        role: 'system',
        content: contextMessage.join('\n'),
      });
    }

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
      // *************** HANDLE CREATE PATH with v4.2 engine
      
      // *************** Load catalog for validation
      const catalog = LoadCatalogMetadata();

      // *************** Log AI contract for debugging
      console.log('[DEBUG] AI Envelope Contract:', JSON.stringify(aiEnvelope.contract, null, 2));

      // *************** Validate contract using v1 validator for backward compatibility
      const validatedContract = await ValidateStudentsContract(
        aiEnvelope.contract,
        catalog,
        params.user_id
      );

      // *************** Log validated contract for debugging
      console.log('[DEBUG] Validated Contract:', JSON.stringify(validatedContract, null, 2));

      // *************** Convert contract to v4.2 plan format
      const plan = ConvertContractToPlan(validatedContract);

      // *************** Log converted plan for debugging
      console.log('[DEBUG] Converted Plan:', JSON.stringify(plan, null, 2));

      // *************** Validate plan against catalog using v4.2 validator
      const validation = PlanValidator.ValidatePlan(plan);
      if (!validation.isValid) {
        throw new Error(`Plan validation failed: ${validation.errors.join('; ')}`);
      }

      // *************** Plan joins from field paths
      const joinPlan = JoinPlanner.PlanJoins(plan);

      // *************** Build aggregation pipeline using v4.2 engine
      const pipeline = AggregationBuilderV2.BuildPipeline(plan, joinPlan);

      // *************** Execute aggregation pipeline
      const studentDocs = await StudentModel.aggregate(pipeline);

      // *************** Create dynamic table record with plan metadata
      const createdTable = await DynamicTableModel.create({
        status: 'active',
        name: validatedContract.table_name,
        description: validatedContract.description,
        columns: validatedContract.columns,
        filters: validatedContract.filters,
        sort: validatedContract.sort || undefined,
        created_by: params.user_id,
        session_chat_id: params.session._id,
        plan_metadata: {
          plan: plan,
          pipeline: pipeline,
          join_plan: joinPlan,
        },
      });

      // *************** Transform documents to row data format
      const rowsWithTableId = studentDocs.map((doc) => ({
        dynamic_table_id: createdTable._id,
        data: doc,
        status: 'active',
      }));

      // *************** Insert rows with table reference
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
            join_count: joinPlan.joinCount,
          },
        },
      };

      return successCreateEnvelope;
    }

    if (aiEnvelope.status === 'ready' && aiEnvelope.intent === 'export_table') {
      // *************** HANDLE EXPORT PATH

      // *************** Extract language from params or default to en
      const lang = params.lang || 'en';

      // *************** Call export service with validated config
      const exportEnvelope = await ProcessExportTurn({
        user_id: params.user_id,
        conversation_id: params.session._id ? String(params.session._id) : null,
        export_config: aiEnvelope.export_config,
        lang: lang,
        StudentModel: StudentModel,
      });

      return exportEnvelope;
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
