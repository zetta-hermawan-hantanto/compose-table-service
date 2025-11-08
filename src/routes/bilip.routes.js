// *************** IMPORT LIBRARY ***************
const express = require('express');

// *************** IMPORT MODULE ***************
const { GetAiTableById, GetAllAiTables } = require('../controllers/compose.controller');
const { HandleChatTurn, GetChatHistory } = require('../controllers/chat.controller');

// *************** Initialize router instance
const router = express.Router();

// *************** Define GET endpoint for table retrieval by ID
router.get('/ai-tables/:id', GetAiTableById);

// *************** Define GET endpoint for all AI tables retrieval
router.get('/ai-tables', GetAllAiTables);

// *************** Define POST endpoint for conversational chat turn
router.post('/bilip/chat', HandleChatTurn);

// *************** Define GET endpoint for chat history retrieval
router.get('/bilip/chat/:conversation_id', GetChatHistory);

// *************** EXPORT MODULE ***************
module.exports = router;
