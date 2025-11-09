// *************** IMPORT LIBRARY ***************
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

/**
 * LoadStudentsCatalog reads the schema catalog JSON file and extracts all entity metadata for v4.
 * This function is used to provide field information to the AI agent for building contracts.
 * V4: Returns students base entity plus joinable entities (rncp_title school class).
 * @returns {object} - Object containing base_entity entities array relations and constraints.
 * @throws {Error} - If catalog file cannot be read or parsed.
 */
function LoadStudentsCatalog() {
  // *************** Construct absolute path to catalog file
  const catalogPath = path.join(__dirname, '..', 'shared', 'catalog', 'schema.catalog.json');

  // *************** Read and parse catalog file
  const catalogRaw = fs.readFileSync(catalogPath, 'utf8');
  const catalog = JSON.parse(catalogRaw);

  // *************** Format all entities for AI consumption
  const entitiesFormatted = catalog.entities.map((entity) => {
    const entityData = {
      name: entity.name,
      fields: entity.fields.map((field) => {
        const fieldData = {
          key: field.name,
          label: field.name,
          data_type: field.type,
        };

        if (field.enum) {
          fieldData.enum = field.enum;
        }

        return fieldData;
      }),
    };

    return entityData;
  });

  // *************** Construct v4 metadata response with all entities
  const metadataResult = {
    version: catalog.version || '2025-11-09',
    base_entity: 'students',
    entities: entitiesFormatted,
    relations: catalog.relations || [],
    constraints: catalog.constraints || {},
  };

  return metadataResult;
}

/**
 * SearchCatalogFields performs case-insensitive search over all catalog fields from all entities.
 * Used by AI agent when field names are ambiguous or need clarification.
 * V4: Searches across students rncp_title school and class entities.
 * @param {string} query - Search term to match against field keys and labels.
 * @returns {object} - Object containing matching fields array with entity prefix.
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

  // *************** Load v4 catalog metadata
  const catalogMetadata = LoadStudentsCatalog();

  // *************** Normalize query for case-insensitive search
  const queryLower = query.toLowerCase();

  // *************** Search across all entities
  const matchingFields = [];

  for (let i = 0; i < catalogMetadata.entities.length; i++) {
    const entity = catalogMetadata.entities[i];

    for (let j = 0; j < entity.fields.length; j++) {
      const field = entity.fields[j];
      const keyMatch = field.key.toLowerCase().includes(queryLower);
      const labelMatch = field.label.toLowerCase().includes(queryLower);

      if (keyMatch || labelMatch) {
        // *************** Add entity prefix for joined fields
        const fieldPath = entity.name === 'students' ? field.key : `${entity.name}.${field.key}`;

        matchingFields.push({
          entity: entity.name,
          field_path: fieldPath,
          key: field.key,
          label: field.label,
          data_type: field.data_type,
        });
      }
    }
  }

  // *************** Construct search result
  const searchResult = {
    query: query,
    matches: matchingFields,
    total_matches: matchingFields.length,
  };

  return searchResult;
}

/**
 * GetTableSchema retrieves table metadata for v2 modify operations.
 * Returns columns filters and sort configuration without exposing row data.
 * @param {string} tableId - MongoDB ObjectId of the dynamic table.
 * @returns {Promise<object>} - Object with columns filters and optional sort.
 * @throws {Error} - If table_id is missing or table not found.
 */
async function GetTableSchema(tableId) {
  // *************** Validate table_id parameter
  if (!tableId) {
    throw new Error('Table ID is required');
  }

  if (!mongoose.Types.ObjectId.isValid(tableId)) {
    throw new Error('Invalid table ID format');
  }

  // *************** Load DynamicTable model dynamically to avoid circular dependency
  const DynamicTableModel = require('../models/dynamic_table.model');

  // *************** Query table metadata by ID
  const tableDoc = await DynamicTableModel.findById(tableId).lean();

  if (!tableDoc) {
    throw new Error('Table not found');
  }

  // *************** Construct schema metadata response
  const schemaMetadata = {
    table_id: String(tableDoc._id),
    name: tableDoc.name,
    columns: tableDoc.columns || [],
    filters: tableDoc.filters || [],
  };

  // *************** Include sort if defined
  if (tableDoc.sort && tableDoc.sort.key) {
    schemaMetadata.sort = tableDoc.sort;
  }

  return schemaMetadata;
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
      description: 'Returns v4 catalog metadata including students base entity and joinable entities (rncp_title school class). Use entity.field notation for joins (e.g. school.city rncp_title.rncp_level).',
      parameters: {},
      handler: function IntrospectStudentsHandler() {
        return LoadStudentsCatalog();
      },
    },
    'db_search_fields': {
      name: 'db_search_fields',
      description: 'Search for fields across all entities (students rncp_title school class) by keyword. Returns field_path with entity prefix for joins.',
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
    'tables_get_schema': {
      name: 'tables_get_schema',
      description: 'Get current table schema for modify operations metadata only',
      parameters: {
        table_id: {
          type: 'string',
          required: true,
          description: 'MongoDB ObjectId of the dynamic table',
        },
      },
      handler: async function GetSchemaHandler(args) {
        return await GetTableSchema(args.table_id);
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
