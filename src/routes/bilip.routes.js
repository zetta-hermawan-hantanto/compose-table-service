// *************** IMPORT LIBRARY ***************
const express = require('express');

// *************** IMPORT MODULE ***************
const { ComposeStudentsTable, GetAiTableById, GetAllAiTables } = require('../controllers/compose.controller');

// *************** IMPORT UTILITIES ***************
const { IsBilipV2Enabled } = require('../utils/feature.flags');

// *************** Initialize router instance
const router = express.Router();

// *************** Define POST endpoint for table composition
router.post('/bilip/compose', ComposeStudentsTable);

// *************** Define GET endpoint for table retrieval by ID
router.get('/ai-tables/:id', GetAiTableById);

// *************** Define GET endpoint for all AI tables retrieval
router.get('/ai-tables', GetAllAiTables);

// *************** Register v2 routes conditionally behind feature flag
if (IsBilipV2Enabled()) {
  const { HandleChatTurn, GetChatHistory } = require('../controllers/chat.controller');
  
  // *************** Define POST endpoint for conversational chat turn
  router.post('/bilip/chat', HandleChatTurn);
  
  // *************** Define GET endpoint for chat history retrieval
  router.get('/bilip/chat/:conversation_id', GetChatHistory);
}

// *************** EXPORT MODULE ***************
module.exports = router;
