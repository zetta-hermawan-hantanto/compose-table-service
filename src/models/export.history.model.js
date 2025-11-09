// *************** IMPORT CORE ***************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ExportHistorySchema = new Schema(
  {
    // User who requested the export
    user_id: { type: Schema.Types.ObjectId, ref: 'user', required: true },

    // Associated conversation if export initiated from chat
    conversation_id: { type: Schema.Types.ObjectId, ref: 'session_chat' },

    // Column names included in the export
    columns: [{ type: String, required: true }],

    // Filters applied to the export query
    filters: [
      {
        // Filter key representing the field path
        key: { type: String, required: true },

        // Filter operator
        op: { type: String, required: true },

        // Filter value
        value: { type: Schema.Types.Mixed, required: true },
      },
    ],

    // Delimiter used in the CSV file
    delimiter: {
      type: String,
      enum: ['comma', 'semicolon', 'tab'],
      required: true,
    },

    // Number of data rows exported
    row_count: { type: Number, required: true },

    // S3 file key for the exported CSV
    file_key: { type: String, required: true },

    // Expiration timestamp for the presigned S3 URL
    file_expires_at: { type: Date, required: true },

    // Language used for email notification
    lang: { type: String, enum: ['en', 'fr'], required: true },

    // Status of the export operation
    status: { type: String, enum: ['success', 'failed'], required: true },

    // Error message if export failed
    error_message: { type: String },
  },
  {
    // Enable timestamps for createdAt and updatedAt
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

// *************** Create index for efficient user export history queries
ExportHistorySchema.index({ user_id: 1, created_at: -1 });

// *************** EXPORT MODULE ***************
module.exports = mongoose.model('export_history', ExportHistorySchema);
