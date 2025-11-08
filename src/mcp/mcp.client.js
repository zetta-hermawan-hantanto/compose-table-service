/**
 * CreateRequestContext initializes a simple key-value store for request-scoped data.
 * Used to store contract commitments from AI agent during tool execution.
 * @returns {object} - Context object with get and set methods.
 */
function CreateRequestContext() {
  // *************** Initialize empty context store
  const contextStore = {};

  // *************** Construct context API
  const contextApi = {
    get: function GetContextValue(key) {
      return contextStore[key];
    },
    set: function SetContextValue(key, value) {
      contextStore[key] = value;
    },
  };

  return contextApi;
}

/**
 * CreateMcpClient initializes an MCP client bound to a specific server instance.
 * The client provides methods to call server tools and retrieve committed contracts.
 * Each client maintains its own request-scoped context for state management.
 * @param {object} mcpServer - MCP server instance with tools registry.
 * @returns {Promise<object>} - Promise resolving to MCP client instance.
 * @throws {Error} - If mcpServer is missing or invalid.
 */
async function CreateMcpClient(mcpServer) {
  // *************** Validate mcpServer parameter
  if (!mcpServer) {
    throw new Error('MCP server instance is required');
  }

  if (!mcpServer.tools) {
    throw new Error('MCP server must have tools registry');
  }

  // *************** Create request-scoped context
  const requestContext = CreateRequestContext();

  // *************** Construct MCP client instance
  const mcpClient = {
    server: mcpServer,
    context: requestContext,

    /**
     * callTool invokes a named tool from the MCP server with provided arguments.
     * Tool execution includes request context for state management.
     * @param {string} toolName - Name of the tool to invoke.
     * @param {object} args - Arguments to pass to the tool handler.
     * @returns {Promise<object>} - Promise resolving to tool execution result.
     * @throws {Error} - If tool is not found or execution fails.
     */
    callTool: async function CallTool(toolName, args) {
      // *************** Validate toolName parameter
      if (!toolName) {
        throw new Error('Tool name is required');
      }

      // *************** Retrieve tool from server registry
      const tool = mcpServer.getTool(toolName);

      // *************** Execute tool handler with args and context
      const toolResult = tool.handler(args || {}, requestContext);

      return toolResult;
    },

    /**
     * getLastContract retrieves the most recently committed contract from context.
     * Used by controller to fetch contract after AI agent completes tool calls.
     * @returns {object|null} - Contract object if committed or null if not found.
     */
    getLastContract: function GetLastContract() {
      // *************** Retrieve contract from request context
      const contractData = requestContext.get('contract');

      return contractData || null;
    },
  };

  return mcpClient;
}

// *************** EXPORT MODULE ***************
module.exports = { CreateMcpClient };
