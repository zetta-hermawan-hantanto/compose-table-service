// *************** IMPORT LIBRARY ***************
const express = require('express');

// *************** IMPORT MODULE ***************
const { ComposeStudentsTable, GetAiTableById } = require('../controllers/compose.controller');

// *************** Initialize router instance
const router = express.Router();

// *************** Define POST endpoint for table composition
router.post('/bilip/compose', ComposeStudentsTable);

// *************** Define GET endpoint for table retrieval by ID
router.get('/ai-tables/:id', GetAiTableById);

// *************** EXPORT MODULE ***************
module.exports = router;
