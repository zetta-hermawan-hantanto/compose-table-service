// *************** IMPORT CORE ***************
require('dotenv').config();

// *************** IMPORT MODULE ***************
const app = require('./app');
const { ConnectDB } = require('./config/database');

// *************** Extract port from environment
const PORT = process.env.PORT || 3000;

// *************** Initialize database connection
ConnectDB();

// *************** Start Express server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// *************** Handle graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server gracefully');
  
  // *************** Close server and exit process
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// *************** Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.stack);
});
