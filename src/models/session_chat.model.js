// **************** IMPORT CORE ****************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SessionChatSchema = new Schema(
  {
    // Unique identifier for the session chat
    _id: { type: Schema.Types.ObjectId, auto: true },

    // Array of messages in the chat session
    messages: [
      {
        role: { type: String, enum: ['user', 'assistant'] },

        content: { type: String },
      },
    ],

    // Reference to the associated dynamic table
    table_id: { type: Schema.Types.ObjectId, ref: 'dynamic_table' },

    // Reference to the user who owns the session chat
    user_id: { type: Schema.Types.ObjectId, ref: 'user', required: true },
  },
  {
    timestamps: {
      // Enable timestamps for createdAt and updatedAt
      createdAt: 'created_at',

      // Enable timestamps for createdAt and updatedAt
      updatedAt: 'updated_at',
    },
  }
);

// **************** EXPORT MODULE ****************
module.exports = mongoose.model('session_chat', SessionChatSchema);
