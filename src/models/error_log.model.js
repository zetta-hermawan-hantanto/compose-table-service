// *************** IMPORT CORE ***************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const errorLogSchema = new Schema(
  {
    // Name of the function where the error occurred
    function_name: { type: String, default: '' },

    // Path where the error occurred
    path: { type: String, default: '' },

    // Error message or details
    error: { type: String, default: '' },

    // Input parameters that led to the error
    parameter_input: { type: String, default: '' },

  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  }
);

// *************** EXPORT MODULE ***************
module.exports = mongoose.model('error_log', errorLogSchema);
