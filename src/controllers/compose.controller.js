// *************** IMPORT LIBRARY ***************
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

// *************** IMPORT MODULE ***************
const StudentModel = require('../models/student.model');
const DynamicTableModel = require('../models/dynamic_table.model');
const DynamicRowTableModel = require('../models/dynamic_row_table.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT VALIDATORS ***************
const { ValidateStudentsContract } = require('../validators/contract.validator');

// *************** IMPORT AI PROMPTS ***************
const { GetBilipSystemPrompt } = require('../ai/bilip.system.prompt');

// *************** IMPORT MCP ***************
const { CreateMcpServer } = require('../mcp/mcp.server');
const { CreateMcpClient } = require('../mcp/mcp.client');

/**
 * BuildMongoFilter converts contract filters to MongoDB query format.
 * Maps filter operators to MongoDB query operators for students collection.
 * @param {Array} filters - Array of filter objects with key op and value.
 * @returns {object} - MongoDB query filter object.
 */
function BuildMongoFilter(filters) {
  // *************** Initialize empty filter object
  const mongoFilter = {};

  // *************** Process each filter and map to MongoDB syntax
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];

    // *************** Extract field name from students.field_name format
    const fieldName = filter.key.replace('students.', '');

    // *************** Map filter operator to MongoDB operator
    if (filter.op === 'eq') {
      mongoFilter[fieldName] = filter.value;
    }

    if (filter.op === 'ne') {
      mongoFilter[fieldName] = { $ne: filter.value };
    }

    if (filter.op === 'in') {
      mongoFilter[fieldName] = { $in: filter.value };
    }

    if (filter.op === 'contains') {
      mongoFilter[fieldName] = { $regex: filter.value, $options: 'i' };
    }

    if (filter.op === 'gte') {
      mongoFilter[fieldName] = { $gte: filter.value };
    }

    if (filter.op === 'lte') {
      mongoFilter[fieldName] = { $lte: filter.value };
    }
  }

  return mongoFilter;
}

/**
 * ResolveStudentValue extracts column value from student document.
 * Handles both direct field access and computed string concatenation expressions.
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
 * LoadCatalogFromFile reads and parses the schema catalog JSON file.
 * Used to retrieve students entity metadata for contract validation.
 * @returns {object} - Complete catalog object with entities array.
 * @throws {Error} - If catalog file cannot be read or parsed.
 */
function LoadCatalogFromFile() {
  // *************** Construct absolute path to catalog file
  const catalogPath = path.join(__dirname, '..', 'shared', 'catalog', 'schema.catalog.json');

  // *************** Read and parse catalog file
  const catalogRaw = fs.readFileSync(catalogPath, 'utf8');
  const catalog = JSON.parse(catalogRaw);

  return catalog;
}

/**
 * ExtractStudentsCatalogMetadata extracts students entity fields from catalog.
 * Formats catalog data for contract validation with simplified field structure.
 * @param {object} catalog - Complete catalog object.
 * @returns {object} - Students metadata with base_entity and fields array.
 * @throws {Error} - If students entity not found in catalog.
 */
function ExtractStudentsCatalogMetadata(catalog) {
  // *************** Find students entity in catalog
  const studentsEntity = catalog.entities.find((entity) => entity.name === 'students');

  if (!studentsEntity) {
    throw new Error('Students entity not found in catalog');
  }

  // *************** Map catalog fields to validation format
  const fieldsFormatted = studentsEntity.fields.map((field) => {
    const fieldData = {
      key: field.name,
      label: field.name,
      data_type: field.type,
    };

    if (field.enum) {
      fieldData.enum = field.enum;
    }

    return fieldData;
  });

  // *************** Construct metadata object
  const metadataResult = {
    base_entity: 'students',
    fields: fieldsFormatted,
  };

  return metadataResult;
}

/**
 * ComposeStudentsTable orchestrates AI agent to generate dynamic table from natural language.
 * Coordinates MCP tools OpenAI API contract validation MongoDB query and row persistence.
 * Follows validation query transformation output flow per WARP.md conventions.
 * @param {object} req - Express request object with body containing user_id and message.
 * @param {object} res - Express response object for sending result or error.
 * @returns {Promise<void>} - Promise resolving when response is sent.
 * @throws {Error} - On validation query or persistence errors after logging.
 */
async function ComposeStudentsTable(req, res) {
  try {
    // *************** Validate req object exists
    if (!req) {
      throw new Error('Request object is required');
    }

    if (!req.body) {
      throw new Error('Request body is required');
    }

    // *************** Validate user_id parameter
    if (!req.body.user_id) {
      throw new Error('Missing user_id');
    }

    const userId = req.body.user_id;

    // *************** Validate message parameter
    if (!req.body.message) {
      throw new Error('Missing message');
    }

    const userMessage = req.body.message;

    // *************** Start MCP session for AI agent tool access
    const mcpServer = CreateMcpServer();
    const mcpClient = await CreateMcpClient(mcpServer);

    // *************** Initialize OpenAI client with API key from environment
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable not configured');
    }

    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // *************** Retrieve model name from environment with fallback
    const modelName = process.env.BILIP_MODEL || 'gpt-4o-mini';

    // *************** Load system prompt for AI agent
    const systemPrompt = GetBilipSystemPrompt();

    // *************** Define tools specification for OpenAI function calling
    const toolsSpec = [
      {
        type: 'function',
        function: {
          name: 'db_introspect_students',
          description: 'Returns metadata about students entity including all available fields',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'db_search_fields',
          description: 'Search for fields in students catalog by keyword',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search term to match against field names',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'ai_commit_plan',
          description: 'Commit the final contract plan when AI agent is confident',
          parameters: {
            type: 'object',
            properties: {
              contract: {
                type: 'object',
                description: 'Complete contract object with status ready and all required fields',
              },
            },
            required: ['contract'],
          },
        },
      },
    ];

    // *************** Initialize conversation messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // *************** Call OpenAI API with function calling enabled
    let chatResponse = await openaiClient.chat.completions.create({
      model: modelName,
      messages: messages,
      tools: toolsSpec,
      tool_choice: 'auto',
    });
    
    // *************** Process tool calls until AI completes or max iterations reached
    let iterationCount = 0;
    const maxIterations = 10;

    while (chatResponse.choices[0].message.tool_calls && iterationCount < maxIterations) {
      iterationCount = iterationCount + 1;

      const assistantMessage = chatResponse.choices[0].message;
      messages.push(assistantMessage);

      // *************** Execute each tool call via MCP client
      for (let i = 0; i < assistantMessage.tool_calls.length; i++) {
        const toolCall = assistantMessage.tool_calls[i];
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        // *************** Invoke tool through MCP client
        const toolResult = await mcpClient.callTool(toolName, toolArgs);

        // *************** Append tool result to conversation
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // *************** Continue conversation with tool results
      chatResponse = await openaiClient.chat.completions.create({
        model: modelName,
        messages: messages,
        tools: toolsSpec,
        tool_choice: 'auto',
      });
    }

    // *************** Fetch committed contract from MCP client context
    const committedContract = mcpClient.getLastContract();

    if (!committedContract) {
      throw new Error('AI agent did not commit a contract. Please provide more details or clarify your request.');
    }

    // *************** Validate contract status and base entity
    if (committedContract.status !== 'ready') {
      throw new Error('Contract status is not ready');
    }

    if (committedContract.base_entity !== 'students') {
      throw new Error('Contract base entity must be students');
    }

    // *************** Load catalog and extract students metadata
    const catalog = LoadCatalogFromFile();
    const studentsCatalog = ExtractStudentsCatalogMetadata(catalog);

    // *************** Validate contract against all business rules
    const validatedContract = await ValidateStudentsContract(committedContract, studentsCatalog, userId);

    // *************** Build MongoDB filter from validated contract filters
    const mongoFilter = BuildMongoFilter(validatedContract.filters);

    // *************** Query students collection with filter
    const studentDocs = await StudentModel.find(mongoFilter).lean();

    // *************** Check row count against demo limit
    if (studentDocs.length > 5000) {
      throw new Error('Result too large for demo; please add more filters. Current result: ' + studentDocs.length + ' rows.');
    }

    // *************** Transform student documents to row data
    const rowsToInsert = studentDocs.map((studentDoc) => {
      // *************** Resolve each column value from student document
      const rowData = {};

      for (let i = 0; i < validatedContract.columns.length; i++) {
        const columnDef = validatedContract.columns[i];
        const columnKey = columnDef.key;
        const columnValue = ResolveStudentValue(studentDoc, columnDef);

        rowData[columnKey] = columnValue;
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
      created_by: userId,
    });

    // *************** Add dynamic_table_id to each row
    const rowsWithTableId = rowsToInsert.map((rowData) => ({
      dynamic_table_id: createdTable._id,
      data: rowData,
      status: 'active',
    }));

    // *************** Insert all rows into dynamic_row_table collection
    if (rowsWithTableId.length > 0) {
      await DynamicRowTableModel.insertMany(rowsWithTableId);
    }

    // *************** Construct success response output
    const outputResponse = {
      table_id: createdTable._id,
      name: createdTable.name,
      description: createdTable.description,
      total_rows: rowsWithTableId.length,
      columns: createdTable.columns,
      filters: createdTable.filters,
    };

    return res.status(200).json(outputResponse);
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/compose.controller.js',
      parameter_input: JSON.stringify({ body: req && req.body }),
      function_name: 'ComposeStudentsTable',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
  }
}

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

// *************** EXPORT MODULE ***************
module.exports = {
  ComposeStudentsTable,
  GetAiTableById,
};
