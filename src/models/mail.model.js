const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SenderPropertySchema = new Schema({
  sender: {
    type: Schema.ObjectId,
    ref: 'user',
  },
  module: {
    type: String,
    enum: ['candidate', 'school', 'university', 'admin', 'external'],
  },
  is_read: {
    type: Boolean,
    default: false,
  },
  mail_type: {
    type: String,
    enum: ['inbox', 'sent', 'important', 'draft', 'trash', 'any'],
    default: 'sent',
  },
  is_starred: {
    type: Boolean,
    default: false,
  },
});

const RecipientPropertySchema = new Schema({
  recipients: [
    {
      type: Schema.ObjectId,
      ref: 'user',
    },
  ],
  rank: {
    type: String,
    enum: ['a', 'cc', 'c'],
  },
  module: {
    type: String,
    enum: ['candidate', 'school', 'university', 'admin', 'external'],
  },
  is_read: {
    type: Boolean,
    default: false,
  },
  mail_type: {
    type: String,
    enum: ['inbox', 'sent', 'important', 'draft', 'trash', 'any'],
    default: 'inbox',
  },
  is_starred: {
    type: Boolean,
    default: false,
  },
});

const mailSchema = new Schema(
  {
    sender_property: SenderPropertySchema,
    recipient_properties: [RecipientPropertySchema],
    subject: {
      type: String,
      required: false,
    },
    is_sent: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      required: false,
    },
    tags: [
      {
        type: String,
      },
    ],
    attachments: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
    },
    is_urgent_mail: {
      type: Boolean,
      default: false,
    },
    file_attachments: [
      {
        file_name: {
          type: String,
        },
        path: {
          type: String,
        },
      },
    ],
    is_group_parent: {
      type: Boolean,
      default: false,
    },
    is_group_child: {
      type: Boolean,
      default: false,
    },
    group_detail: {
      rncp_titles: [
        {
          type: Schema.ObjectId,
          ref: 'rncp_title',
        },
      ],
      title_classes: [
        {
          title_id: {
            type: Schema.ObjectId,
            ref: 'rncp_title',
          },
          class_ids: [
            {
              type: Schema.ObjectId,
              ref: 'class',
            },
          ],
        },
      ],
      user_types: [
        {
          type: Schema.ObjectId,
          ref: 'user_type',
        },
      ],
    },
    user_type_selection: {
      type: Boolean,
      default: false,
    },
    date: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

mailSchema.pre('save', function (next) {
  if (this.isNew) {
    this.date = new Date(this.createdAt).toISOString();
  }
  next();
});

module.exports = mongoose.model('mail', mailSchema);
