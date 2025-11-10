// *************** IMPORT LIBRARY ***************
const { OpenAI } = require('openai');

/**
 * CallAIWithEnvelope orchestrates OpenAI chat completion with MCP tool integration.
 * Manages conversation flow with function calling and iterative tool execution.
 * Parses and validates envelope responses against v2 schema requirements.
 * @param {object} params - Configuration object with messages mcpClient and systemPrompt.
 * @param {Array} params.messages - Conversation messages array for OpenAI.
 * @param {object} params.mcpClient - MCP client instance for tool invocation.
 * @param {string} params.systemPrompt - System prompt text for AI agent.
 * @returns {Promise<object>} - Promise resolving to validated envelope object.
 * @throws {Error} - If OpenAI call fails or envelope parsing fails.
 */
async function CallAIWithEnvelope(params) {
  // *************** Validate required parameters
  if (!params) {
    throw new Error('Parameters object is required');
  }

  if (!params.messages) {
    throw new Error('Messages array is required');
  }

  if (!Array.isArray(params.messages)) {
    throw new Error('Messages must be an array');
  }

  if (!params.mcpClient) {
    throw new Error('MCP client is required');
  }

  if (!params.systemPrompt) {
    throw new Error('System prompt is required');
  }

  // *************** Initialize OpenAI client with environment API key
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable not configured');
  }

  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // *************** Retrieve model name from environment with fallback
  const modelName = process.env.BILIP_MODEL || 'gpt-4o-mini';

  // *************** Define MCP tools specification for OpenAI function calling
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
    {
      type: 'function',
      function: {
        name: 'tables_get_schema',
        description: 'Get current table schema for modify operations metadata only (no sample data)',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description: 'MongoDB ObjectId of the dynamic table',
            },
          },
          required: ['table_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'tables_get_data',
        description: 'Get current table structure AND sample rows (RECOMMENDED for modify operations - shows actual data)',
        parameters: {
          type: 'object',
          properties: {
            table_id: {
              type: 'string',
              description: 'MongoDB ObjectId of the dynamic table',
            },
            sample_size: {
              type: 'number',
              description: 'Number of sample rows to return (default 5, max 10)',
            },
          },
          required: ['table_id'],
        },
      },
    },
  ];

  // *************** Prepare messages array with system prompt
  const conversationMessages = [{ role: 'system', content: params.systemPrompt }, ...params.messages];

  // *************** Call OpenAI API with function calling enabled
  let chatResponse = await openaiClient.chat.completions.create({
    model: modelName,
    messages: conversationMessages,
    tools: toolsSpec,
    tool_choice: 'auto',
  });

  // *************** Process tool calls iteratively until completion or max iterations
  let iterationCount = 0;
  const maxIterations = 10;

  while (chatResponse.choices[0].message.tool_calls && iterationCount < maxIterations) {
    iterationCount = iterationCount + 1;

    const assistantMessage = chatResponse.choices[0].message;
    conversationMessages.push(assistantMessage);

    // *************** Execute each tool call via MCP client
    for (let i = 0; i < assistantMessage.tool_calls.length; i++) {
      const toolCall = assistantMessage.tool_calls[i];
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      // *************** Invoke tool through MCP client
      const toolResult = await params.mcpClient.callTool(toolName, toolArgs);

      // *************** Append tool result to conversation
      conversationMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }

    // *************** Continue conversation with tool results
    chatResponse = await openaiClient.chat.completions.create({
      model: modelName,
      messages: conversationMessages,
      tools: toolsSpec,
      tool_choice: 'auto',
    });
  }

  // *************** Extract final response content
  const finalMessage = chatResponse.choices[0].message;

  if (!finalMessage.content) {
    throw new Error('AI response missing content');
  }

  // *************** Parse envelope from AI response
  let envelope;

  try {
    envelope = JSON.parse(finalMessage.content);
  } catch (parseError) {
    throw new Error('AI response is not valid JSON envelope: ' + parseError.message);
  }

  // *************** Validate envelope has required status field
  if (!envelope.status) {
    throw new Error('Envelope missing status field');
  }

  return envelope;
}

// *************** EXPORT MODULE ***************
module.exports = { CallAIWithEnvelope };
