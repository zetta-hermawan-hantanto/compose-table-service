// *************** IMPORT LIBRARY ***************
const express = require('express');

// *************** IMPORT MODULE ***************
const { GetAiTableById, GetAllAiTables, UpdateAITable, DeleteAIStudentTable, ExportManualAITable } = require('../controllers/compose.controller');
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

// *************** Define additional routes as needed
router.put('/ai-tables/:id', UpdateAITable);

// *************** Define DELETE endpoint for AI student table deletion
router.delete('/ai-tables/:id', DeleteAIStudentTable);

// *************** Define POST endpoint for manual AI table export
router.post('/ai-tables/:id/export', ExportManualAITable);

// *************** EXPORT MODULE ***************
module.exports = router;
