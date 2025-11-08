// *************** IMPORT CORE ***************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DynamicRowTableSchema = new Schema(
  {
    // Reference to the dynamic table
    dynamic_table_id: { type: Schema.Types.ObjectId, ref: 'DynamicTable', required: true },

    // Current status of the row
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
    },

    // Data for each row in the dynamic table as key value pairs
    data: { type: Schema.Types.Mixed, required: true },
  },
  {
    // Enable timestamps for createdAt and updatedAt
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// *************** EXPORT MODULE ***************
module.exports = mongoose.model('DynamicRowTable', DynamicRowTableSchema);
