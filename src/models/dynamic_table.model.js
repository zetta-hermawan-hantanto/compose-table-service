// *************** IMPORT CORE ***************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DynamicTableSchema = new Schema(
  {
    // Name of the dynamic table
    name: { type: String, required: true },

    // Description of the dynamic table
    description: { type: String, default: '' },

    // Current status of the table
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
    },

    // Definition of columns in the dynamic table
    columns: [
      {
        // Label for the column
        label: { type: String, required: true },

        // Key for the column
        key: { type: String, required: true },

        // Data type of the column
        data_type: {
          type: String,
          enum: ['string', 'number', 'boolean', 'date'],
          required: true,
        },

        // Source information for the column data
        source: {
          collection: { type: String, required: true },
          field: { type: String, required: true },
        },
      },
    ],

    // Filters applied to generate the table rows
    filters: [
      {
        // Filter key representing the field path
        key: { type: String, required: true },

        // Filter operator
        operator: { type: String, required: true },

        // Filter value
        value: { type: Schema.Types.Mixed, required: true },
      },
    ],

    // Optional sorting configuration for v2
    sort: [
      {
        // Field key to sort by
        key: { type: String },

        // Sort direction asc or desc
        dir: { type: String, enum: ['asc', 'desc'] },
      },
    ],

    // Indicates if the table is filterable
    filterable: { type: Boolean, default: true },

    // Indicates if the table supports sorting
    sortable: { type: Boolean, default: true },

    // User who created the dynamic table
    created_by: { type: Schema.Types.ObjectId, ref: 'user', required: true },

    // Reference to the associated session chat
    session_chat_id: { type: Schema.Types.ObjectId, ref: 'session_chat' },
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
module.exports = mongoose.model('dynamic_table', DynamicTableSchema);
