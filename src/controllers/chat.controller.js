// *************** IMPORT MODULES ***************
const SessionChatModel = require('../models/session_chat.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT SERVICE ***************
const { ProcessChatTurn } = require('../services/chat.service');

/**
 * GetErrorMessage returns human-readable error message based on error type and language.
 * Translates technical errors into user-friendly messages without exposing internals.
 * Supports English and French languages for consistent user experience.
 * @param {Error} error - Error object from caught exception.
 * @param {string} lang - Language code en or fr.
 * @returns {object} - Object with message explanation and options array.
 */
function GetErrorMessage(error, lang) {
  // *************** Default to English if lang not specified
  const effectiveLang = lang === 'fr' ? 'fr' : 'en';

  // *************** Extract error message for pattern matching
  const errorMessage = error.message || '';

  // *************** Handle missing prompt error
  if (errorMessage.includes('Missing prompt') || errorMessage.includes('prompt')) {
    if (effectiveLang === 'fr') {
      return {
        message: 'Veuillez fournir une question ou une instruction.',
        explanation: 'Le message ne peut pas être vide.',
        options: ['Posez une question sur les étudiants', 'Demandez de créer ou modifier une table'],
      };
    }
    return {
      message: 'Please provide a question or instruction.',
      explanation: 'Your message cannot be empty.',
      options: ['Ask a question about students', 'Request to create or modify a table'],
    };
  }

  // *************** Handle missing user_id error
  if (errorMessage.includes('Missing user_id') || errorMessage.includes('user_id')) {
    if (effectiveLang === 'fr') {
      return {
        message: 'Authentification requise.',
        explanation: 'Veuillez vous connecter pour continuer.',
        options: ['Connectez-vous à nouveau'],
      };
    }
    return {
      message: 'Authentication required.',
      explanation: 'Please log in to continue.',
      options: ['Log in again'],
    };
  }

  // *************** Handle conversation not found error
  if (errorMessage.includes('Conversation not found')) {
    if (effectiveLang === 'fr') {
      return {
        message: 'Cette conversation n\'existe plus.',
        explanation: 'La conversation a peut-être été supprimée ou l\'ID est incorrect.',
        options: ['Commencer une nouvelle conversation'],
      };
    }
    return {
      message: 'This conversation no longer exists.',
      explanation: 'The conversation may have been deleted or the ID is incorrect.',
      options: ['Start a new conversation'],
    };
  }

  // *************** Handle database connection errors
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connection')) {
    if (effectiveLang === 'fr') {
      return {
        message: 'Service temporairement indisponible.',
        explanation: 'Nous rencontrons des difficultés techniques.',
        options: ['Réessayez dans quelques instants'],
      };
    }
    return {
      message: 'Service temporarily unavailable.',
      explanation: 'We are experiencing technical difficulties.',
      options: ['Try again in a few moments'],
    };
  }

  // *************** Default generic error for unknown cases
  if (effectiveLang === 'fr') {
    return {
      message: 'Une erreur s\'est produite lors du traitement de votre demande.',
      explanation: 'Veuillez reformuler votre demande ou réessayer.',
      options: ['Réessayez', 'Reformulez votre question avec plus de détails'],
    };
  }
  return {
    message: 'An error occurred while processing your request.',
    explanation: 'Please rephrase your request or try again.',
    options: ['Try again', 'Rephrase your question with more details'],
  };
}

/**
 * HandleChatTurn processes a single conversational turn for table operations.
 * Manages session creation and persistence across conversation flow.
 * Follows WARP validation query transformation output flow.
 * @param {object} req - Express request object with body containing prompt user_id conversation_id table_id and lang.
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
    const userId = req.userId;

    // *************** Validate user_id presence
    if (!userId) {
      throw new Error('Missing user_id');
    }

    // *************** Extract parameters from request body
    const { prompt, conversation_id, table_id, lang } = req.body;

    // *************** Validate and default lang parameter
    const effectiveLang = (lang === 'fr' || lang === 'en') ? lang : 'en';

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
        user_id: userId,
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
      user_id: userId,
      lang: effectiveLang,
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
    // *************** Extract language for error messages
    const errorLang = (req.body && req.body.lang) || 'en';

    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/chat.controller.js',
      parameter_input: JSON.stringify({ body: req && req.body }),
      function_name: 'HandleChatTurn',
      error: String(error.stack),
    });

    // *************** Get human-readable error message
    const errorDetails = GetErrorMessage(error, errorLang);

    // *************** Construct Failure envelope for error response
    const failureEnvelope = {
      status: 'failed',
      conversation_id: req.body.conversation_id || null,
      table_id: req.body.table_id || null,
      messages: [{ role: 'assistant', message: errorDetails.message }],
      explanation: errorDetails.explanation,
      options: errorDetails.options,
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
    // *************** Extract language for error messages default to en
    const errorLang = 'en';

    // *************** Log error to database with request context
    await ErrorLogModel.create({
      path: 'controllers/chat.controller.js',
      parameter_input: JSON.stringify({ params: req && req.params }),
      function_name: 'GetChatHistory',
      error: String(error.stack),
    });

    // *************** Get human-readable error message
    const errorDetails = GetErrorMessage(error, errorLang);

    // *************** Return structured error response
    return res.status(500).json({
      error: errorDetails.message,
      details: errorDetails.explanation,
      suggestions: errorDetails.options,
    });
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  HandleChatTurn,
  GetChatHistory,
};
