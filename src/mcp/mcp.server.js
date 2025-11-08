// *************** IMPORT LIBRARY ***************
const fs = require('fs');
const path = require('path');

/**
 * LoadStudentsCatalog reads the schema catalog JSON file and extracts students entity metadata.
 * This function is used to provide field information to the AI agent for building contracts.
 * @returns {object} - Object containing base_entity and fields array from catalog.
 * @throws {Error} - If catalog file cannot be read or parsed.
 */
function LoadStudentsCatalog() {
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

  // *************** Map catalog fields to simplified format for AI consumption
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

  // *************** Construct metadata response
  const metadataResult = {
    base_entity: 'students',
    fields: fieldsFormatted,
  };

  return metadataResult;
}

/**
 * SearchCatalogFields performs case-insensitive search over students catalog fields.
 * Used by AI agent when field names are ambiguous or need clarification.
 * @param {string} query - Search term to match against field keys and labels.
 * @returns {object} - Object containing matching fields array.
 * @throws {Error} - If query is missing or invalid.
 */
function SearchCatalogFields(query) {
  // *************** Validate query parameter
  if (!query) {
    throw new Error('Search query is required');
  }

  if (typeof query !== 'string') {
    throw new Error('Search query must be a string');
  }

  // *************** Load catalog metadata
  const catalogMetadata = LoadStudentsCatalog();

  // *************** Normalize query for case-insensitive search
  const queryLower = query.toLowerCase();

  // *************** Filter fields matching query in key or label
  const matchingFields = catalogMetadata.fields.filter((field) => {
    const keyMatch = field.key.toLowerCase().includes(queryLower);
    const labelMatch = field.label.toLowerCase().includes(queryLower);
    return keyMatch || labelMatch;
  });

  // *************** Construct search result
  const searchResult = {
    query: query,
    matches: matchingFields,
  };

  return searchResult;
}

/**
 * StoreContractInContext saves the committed contract in request-scoped context.
 * This is a metadata-only operation that does not persist to database.
 * @param {object} ctx - Request context object with get and set methods.
 * @param {object} contract - The validated contract object from AI agent.
 * @returns {object} - Confirmation object indicating contract was stored.
 * @throws {Error} - If contract is missing or invalid.
 */
function StoreContractInContext(ctx, contract) {
  // *************** Validate contract parameter
  if (!contract) {
    throw new Error('Contract object is required');
  }

  if (typeof contract !== 'object') {
    throw new Error('Contract must be an object');
  }

  // *************** Store contract in request context
  ctx.set('contract', contract);

  // *************** Construct confirmation response
  const confirmationResult = {
    success: true,
    message: 'Contract committed to context',
  };

  return confirmationResult;
}

/**
 * CreateMcpServer initializes an in-process MCP server with metadata-only tools.
 * The server provides three tools for AI agent interaction with students catalog.
 * Tools are executed synchronously within the same process without external MCP protocol.
 * @returns {object} - MCP server instance with tools registry.
 */
function CreateMcpServer() {
  // *************** Define tools registry for MCP server
  const toolsRegistry = {
    'db_introspect_students': {
      name: 'db_introspect_students',
      description: 'Returns metadata about students entity including all available fields',
      parameters: {},
      handler: function IntrospectStudentsHandler() {
        return LoadStudentsCatalog();
      },
    },
    'db_search_fields': {
      name: 'db_search_fields',
      description: 'Search for fields in students catalog by keyword',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: 'Search term to match against field names',
        },
      },
      handler: function SearchFieldsHandler(args) {
        return SearchCatalogFields(args.query);
      },
    },
    'ai_commit_plan': {
      name: 'ai_commit_plan',
      description: 'Commit the final contract plan when AI agent is confident',
      parameters: {
        contract: {
          type: 'object',
          required: true,
          description: 'Complete contract object with status ready and all required fields',
        },
      },
      handler: function CommitPlanHandler(args, ctx) {
        return StoreContractInContext(ctx, args.contract);
      },
    },
  };

  // *************** Construct MCP server instance
  const mcpServer = {
    tools: toolsRegistry,
    getTool: function GetTool(toolName) {
      const tool = toolsRegistry[toolName];
      if (!tool) {
        throw new Error(`Tool ${toolName} not found in registry`);
      }
      return tool;
    },
  };

  return mcpServer;
}

// *************** EXPORT MODULE ***************
module.exports = { CreateMcpServer };
