// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');

// *************** Initialize Express application
const app = express();

// *************** Configure global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// *************** Define health check endpoint
app.get('/health', (req, res) => {
  // *************** Construct health check response
  const healthData = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'compose-table-service'
  };
  
  return res.status(200).json(healthData);
});

// *************** Handle 404 for undefined routes
app.use((req, res) => {
  const errorResponse = {
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  };
  
  return res.status(404).json(errorResponse);
});

// *************** EXPORT MODULE ***************
module.exports = app;
