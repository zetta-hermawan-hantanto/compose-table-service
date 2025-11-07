// *************** IMPORT LIBRARY ***************
const mongoose = require('mongoose');

/**
 * ConnectDB establishes connection to MongoDB database
 * Handles connection events and errors
 * @returns {Promise<void>}
 * @throws {Error} - Database connection errors
 */
const ConnectDB = async () => {
  try {
    // *************** Get MongoDB URI from environment or use default
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/compose-table-service';
    
    // *************** Connect to MongoDB database
    await mongoose.connect(mongoURI);
    
    console.log('MongoDB connected successfully');
    
    // *************** Set up error event listener
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });
    
    // *************** Set up disconnection event listener
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });
    
  } catch (error) {
    // *************** Log connection failure and exit process
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// *************** EXPORT MODULE ***************
module.exports = { ConnectDB };
