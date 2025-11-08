// *************** IMPORT MODULE ***************
const SessionChatModel = require('../models/session_chat.model');
const ErrorLogModel = require('../models/error_log.model');
const { ProcessChatTurn } = require('../services/chat.service');

/**
 * HandleChatTurn processes a single conversational turn for table operations.
 * Manages session creation and persistence across conversation flow.
 * Follows WARP validation query transformation output flow.
 * @param {object} req - Express request object with body containing prompt user_id conversation_id and table_id.
 * @param {object} res - Express response object for sending envelope response.
 * @returns {Promise<void>} - Promise resolving when response is sent.
 * @throws {Error} - On validation or processing errors with Failure envelope.
 */
async function HandleChatTurn(req, res) {
  try {
    // *************** Validate req object exists
    if (!req) {
      throw new Error('Request object is required');
    }

    if (!req.body) {
      throw new Error('Request body is required');
    }

    // *************** Validate prompt parameter
    if (!req.body.prompt) {
      throw new Error('Missing prompt');
    }

    // *************** Validate user_id parameter
    if (!req.body.user_id) {
      throw new Error('Missing user_id');
    }

    const { prompt, conversation_id, table_id, user_id } = req.body;

    // *************** Load or create session based on conversation_id
    let session;

    if (conversation_id) {
      // *************** Query existing session by conversation_id
      session = await SessionChatModel.findById(conversation_id);

      if (!session) {
        throw new Error('Conversation not found');
      }
    } else {
      // *************** Create new session for first turn
      session = await SessionChatModel.create({
        user_id: user_id,
        table_id: table_id || null,
        messages: [],
      });
    }

    // *************** Append user message to session transcript
    session.messages.push({
      role: 'user',
      content: prompt,
    });

    await session.save();

    // *************** Call ChatService to process conversation turn
    const serviceResult = await ProcessChatTurn({
      messages: session.messages,
      session: session,
      user_id: user_id,
    });

    // *************** Extract AI message from service result
    const aiMessages = serviceResult.messages || [];
    const aiMessage = aiMessages[aiMessages.length - 1];

    if (aiMessage) {
      // *************** Append AI message to session transcript
      session.messages.push({
        role: 'assistant',
        content: aiMessage.message,
      });
    }

    // *************** Update table_id if created in this turn
    if (serviceResult.table_id && !session.table_id) {
      session.table_id = serviceResult.table_id;
    }

    await session.save();

    // *************** Construct output envelope with conversation_id
    const outputEnvelope = {
      ...serviceResult,
      conversation_id: String(session._id),
    };

    return res.status(200).json(outputEnvelope);
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/chat.controller.js',
      parameter_input: JSON.stringify({ body: req && req.body }),
      function_name: 'HandleChatTurn',
      error: String(error.stack),
    });

    // *************** Construct Failure envelope for error response
    const failureEnvelope = {
      status: 'failed',
      conversation_id: req.body.conversation_id || null,
      table_id: req.body.table_id || null,
      messages: [{ role: 'assistant', message: 'An error occurred processing your request.' }],
      explanation: error.message,
      options: ['Please try again', 'Rephrase your request with more details'],
    };

    return res.status(500).json(failureEnvelope);
  }
}

/**
 * GetChatHistory retrieves conversation transcript and metadata by conversation_id.
 * Used for displaying conversation history and table context in frontend.
 * Returns session messages and associated table_id if present.
 * @param {object} req - Express request object with params containing conversation_id.
 * @param {object} res - Express response object for sending history data.
 * @returns {Promise<void>} - Promise resolving when response is sent.
 * @throws {Error} - If conversation_id is missing or session not found.
 */
async function GetChatHistory(req, res) {
  try {
    // *************** Validate req object exists
    if (!req) {
      throw new Error('Request object is required');
    }

    if (!req.params) {
      throw new Error('Request params is required');
    }

    // *************** Validate conversation_id parameter
    if (!req.params.conversation_id) {
      throw new Error('Missing conversation_id');
    }

    const conversationId = req.params.conversation_id;

    // *************** Query session by conversation_id
    const session = await SessionChatModel.findById(conversationId);

    if (!session) {
      throw new Error('Conversation not found');
    }

    // *************** Transform messages to consistent format
    const messagesFormatted = session.messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      message: msg.content,
    }));

    // *************** Construct output response with history
    const outputResponse = {
      conversation_id: String(session._id),
      table_id: session.table_id ? String(session.table_id) : null,
      messages: messagesFormatted,
      created_at: session.created_at,
      updated_at: session.updated_at,
    };

    return res.status(200).json(outputResponse);
  } catch (error) {
    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/chat.controller.js',
      parameter_input: JSON.stringify({ params: req && req.params }),
      function_name: 'GetChatHistory',
      error: String(error.stack),
    });

    return res.status(500).json({ error: error.message });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  HandleChatTurn,
  GetChatHistory,
};
