// *************** IMPORT LIBRARY ***************
const express = require('express');
const cors = require('cors');

// *************** IMPORT MODULE ***************
const bilipRoutes = require('./routes/bilip.routes');

// *************** IMPORT MIDDLEWARE ***************
const { AuthMiddleware } = require('./middleware/auth.middleware');

// *************** Initialize Express application
const app = express();

// *************** Configure global middleware
const corsOptions = {
  origin: ['http://localhost:4200', 'https://upgrade.zetta-demo.space'],                      
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 86400,
};

// *************** Apply CORS middleware
app.use(cors(corsOptions));  

// *************** Apply JSON and URL-encoded body parsers
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

// *************** Apply authentication middleware globally
app.use(AuthMiddleware);

// *************** Mount bilip routes under /api prefix
app.use('/api', bilipRoutes);

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
