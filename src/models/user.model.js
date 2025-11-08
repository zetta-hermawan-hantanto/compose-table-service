// ***************** IMPORT LIBRARY *****************
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema(
  {
    // entities of user
    entities: [
      {
        // Name of the entity, must match EnumEntityType in user.typedef.js
        entity_name: {
          type: String,
          enum: ['admtc', 'academic', 'company', 'service_provider', 'group_of_schools', null],
          default: null,
        },

        // Role name associated with the entity
        role_name: {
          type: String,
          default: '',
        },

        // Status of the entity (active or deleted)
        status: {
          type: String,
          enum: ['active', 'deleted'],
          default: 'active',
        },

        // Type of school if applicable
        school_type: {
          type: String,
          enum: ['preparation_center', 'certifier', null],
        },

        // Reference to the associated school
        school: {
          type: Schema.ObjectId,
          ref: 'school',
          autopopulate: {
            select:
              '-status -updatedAt -createdAt -deals -logo -school_siret -tax_status -legal_details -social_addresses -group_name -belong_to_group -users -companies -rncp_titles -addresses',
          },
        },

        // References to associated companies
        companies: [
          {
            type: Schema.ObjectId,
            ref: 'companies',
          },
        ],

        // References to group of schools
        group_of_schools: [
          {
            type: Schema.ObjectId,
            ref: 'school',
          },
        ],

        // Reference to the group of schools
        group_of_school: {
          type: Schema.ObjectId,
          ref: 'school_group',
        },

        // Reference to the associated class
        class: {
          type: Schema.ObjectId,
          ref: 'class',
        },

        // Reference to the user type
        type: {
          type: Schema.ObjectId,
          ref: 'user_type',
        },

        // Reference to the assigned RNCP title
        assigned_rncp_title: {
          type: Schema.ObjectId,
          ref: 'rncp_title',
        },

        // Timestamp when the entity was created
        created_at: {
          type: String,
          default: Date.now(),
        },

        // Timestamp when the entity was last updated
        updated_at: {
          type: String,
          default: Date.now(),
        },

        // List of RNCP titles the entity is in charge of
        titles_in_charge: [
          {
            type: Schema.ObjectId,
            ref: 'rncp_title',
          },
        ],
      },
    ],
    // User's last name
    last_name: {
      type: String,
      default: '',
    },

    // User's first name
    first_name: {
      type: String,
      default: '',
    },

    // User's civility (MR, MRS, or empty)
    civility: {
      type: String,
      enum: ['MR', 'MRS', ''],
      default: '',
    },

    // Reference to the user who created this record
    created_by: {
      type: Schema.ObjectId,
      ref: 'user',
    },

    // User's sex (M, F, or empty)
    sex: {
      type: String,
      enum: ['M', 'F', ''],
      default: '',
    },

    // User's job position
    position: {
      type: String,
      default: '',
    },

    // User's email address
    email: {
      type: String,
      default: '',
    },

    // Email before converting to lowercase
    email_before_change_to_lower_case: {
      type: String,
      default: '',
    },

    // Email address used for signing documents
    signatory_email: {
      type: String,
      default: '',
    },

    // User's office phone number
    office_phone: {
      type: String,
      default: '',
    },

    // Country code for the office phone number
    office_phone_number_indicative: {
      type: String,
      default: '',
    },

    // User's direct phone line
    direct_line: {
      type: String,
      default: '',
    },

    // Country code for the direct phone line
    direct_line_indicative: {
      type: String,
      default: '',
    },

    // User's mobile phone number
    portable_phone: {
      type: String,
      default: '',
    },

    // Country code for the mobile phone number
    portable_phone_number_indicative: {
      type: String,
      default: '',
    },

    // Salt used for password encryption
    salt: {
      type: String,
    },

    // User's hashed password
    hashed_password: {
      type: String,
    },

    // Recovery code for password reset
    recovery_code: {
      type: String,
      default: '',
    },

    // Authentication tokens for user sessions
    auth_token: [
      {
        type: String,
        default: '',
      },
    ],

    // Reference to user's avatar in the directory
    avatar: {
      type: Schema.ObjectId,
      ref: 'directory',
      required: false,
    },

    // Status of the user (active or deleted)
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
    },

    // User's current status in the system
    user_status: {
      type: String,
      enum: ['incorrect_email', 'pending', 'active'],
      default: 'pending',
    },

    // Indicates if the user is a student
    is_user_student: {
      type: Boolean,
      default: false,
    },
    // Reference to the associated student record
    student_id: {
      type: Schema.ObjectId,
      ref: 'student',
    },

    // Indicates whether the user has set a password
    is_password_set: {
      type: Boolean,
      default: false,
    },

    // Indicates whether the user registration email has been sent
    is_user_registration_email_sent: {
      type: Boolean,
      default: false,
    },

    // Indicates whether the user has completed registration
    is_registered: {
      type: Boolean,
      default: false,
    },

    // Indicates if the user's email has been marked as incorrect
    incorrect_email: {
      type: Boolean,
      default: false,
    },

    // Indicates if the user registered using social login
    is_social_login: {
      type: Boolean,
      default: false,
    },

    // List of secondary email addresses
    secondary_emails: [
      {
        type: String,
      },
    ],

    // Social login details
    social_login: {
      // Indicates if LinkedIn login is enabled
      linked_in: {
        type: Boolean,
        default: false,
      },

      // Email linked to the LinkedIn account
      linked_email: {
        type: String,
      },
    },

    // Curriculum Vitae (CV) details
    curriculum_vitae: {
      // File path of the CV
      file_path: {
        type: String,
      },

      // Name of the CV file
      name: {
        type: String,
      },

      // Indicates if the CV is stored in S3
      is_in_s3: {
        type: Boolean,
      },

      // S3 storage path for the CV
      s3_path: {
        type: String,
      },
    },

    // User's profile picture
    profile_picture: {
      type: String,
      default: '',
    },

    // Timestamp of the last password reset request
    last_forgot_pass_sent_on: {
      type: String,
    },

    // User's email before being marked as incorrect
    email_before_incorrect_email: {
      type: String,
    },

    // Reason provided for resignation
    reason_for_resignation: {
      type: String,
    },

    // Date when the user resigned
    date_of_resignation: {
      type: String,
    },

    // Reference to the user who processed the resignation
    resignation_by: {
      type: Schema.ObjectId,
      ref: 'user',
    },

    // List of user addresses
    address: [
      {
        // Full address
        address: {
          type: String,
          default: '',
        },

        // Postal code of the address
        postal_code: {
          type: String,
          default: '',
        },

        // City of the address
        city: {
          type: String,
          default: '',
        },

        // Region of the address
        region: {
          type: String,
          default: '',
        },

        // Department of the address
        department: {
          type: String,
          default: '',
        },

        // Country of the address
        country: {
          type: String,
        },

        // Indicates if this is the user's primary address
        is_main_address: {
          type: Boolean,
          default: false,
        },
      },
    ],
    // Tracks the last update to the user's ES (Employment Status)
    user_ES_status_updated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks the last update to the user's company status
    user_company_status_updated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks the last update to the user's job description status
    user_job_description_status_updated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks the last update to the user's problematic status
    user_problematic_status_updated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks the last update to the user's evaluation status
    user_eval_status_updated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks when the user set their password during registration
    registration_set_password: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks when the user's registration was deactivated
    registration_deactivated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks when the user's registration was reactivated
    registration_reactivated: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks when the user's email was marked as incorrect
    registration_incorrect_email: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks when the user changed their email during registration
    registration_email_change: {
      date: String,
      time: String,
      status: String,
    },

    // Tracks when the user renewed their password during registration
    registration_renew_password: {
      date: String,
      time: String,
      status: String,
    },

    // Stores the previous password salt before an update
    old_salt: {
      type: String,
    },

    // Stores the previous hashed password before an update
    old_hashed_password: {
      type: String,
    },

    // Stores the user's previous email before an update
    old_email: {
      type: String,
    },

    // Indicates whether the user's email is verified by AWS
    is_email_aws_verified: {
      type: Boolean,
      default: false,
    },

    // List of students associated with the user
    students_connected: [
      {
        type: Schema.ObjectId,
        ref: 'user',
      },
    ],

    // Stores the reason why the user's email was marked as incorrect
    reason_for_incorrect_email: {
      type: String,
    },

    // Tracks the user's last login details
    last_login: {
      date: String,
      time: String,
    },

    // Stores the user's selected theme settings
    user_selected_theme: {
      // Sidebar type chosen by the user
      sidebar_type: {
        type: String,
        enum: ['icon', 'none', 'full'],
      },

      // Theme preferences selected by the user
      selected_theme: {
        name: String,
        primary: String,
        secondary: String,
        tertiary: String,
      },
    },

    // Status of the email validation process
    email_validator_status: {
      type: String,
    },

    // Indicates whether the user's class is active
    class_active: {
      type: Boolean,
      default: false,
    },

    // Indicates whether the vertical menu is displayed in the student file
    is_display_vertical_menu_on_student_file: {
      type: Boolean,
      default: true,
    },
  },
  {
    // Enables automatic creation and update timestamps for the document
    timestamps: true,
  }
);

/**
 * Converts a given first name to Title Case, It capitalizes the first letter of each word, including hyphen-separated and space-separated words.
 * @param {string} str - The first name to be converted.
 * @returns {string} - The formatted first name in Title Case.
 */
function firstNameToTitleCase(str) {
  let firstNameResult = str;

  // ***************** Check if the first name contains a hyphen (-)
  const regex = new RegExp('-');
  if (regex.test(firstNameResult)) {
    // ***************** Convert each hyphen-separated part to Title Case
    firstNameResult = firstNameResult
      .split('-')
      .map((word) => word.substring(0, 1).toUpperCase() + word.substring(1))
      .join('-');
  }

  // ***************** Convert each space-separated word to Title Case
  firstNameResult = firstNameResult
    .split(' ')
    .map((word) => word.substring(0, 1).toUpperCase() + word.substring(1))
    .join(' ');

  return firstNameResult;
}

/**
 *  Pre-save hook to format user name and email before saving.
 * @param {Function} next - Callback function to proceed to the next middleware.
 */
UserSchema.pre('save', function (next) {
  // ***************** Update user name to proper format
  if (this.first_name && this.last_name) {
    // ***************** Convert first name to Title Case
    this.first_name = firstNameToTitleCase(this.first_name);

    // ***************** Convert last name to uppercase
    this.last_name = this.last_name.toUpperCase();
  }

  // ***************** Convert email to lowercase before saving
  if (this.email) {
    this.email = this.email.toLowerCase();
  }

  next();
});

/**
 * ***************** Pre-update hook to format user name and email before updating.
 *
 * @param {Function} next - Callback function to proceed to the next middleware.
 */
UserSchema.pre(['findOneAndUpdate', 'update', 'updateOne'], function (next) {
  // ***************** Format first name if present in $set
  if (this._update && this._update.$set && this._update.$set.first_name) {
    this._update.$set.first_name = firstNameToTitleCase(this._update.$set.first_name);
  }

  // ***************** Convert last name to uppercase if present in $set
  if (this._update && this._update.$set && this._update.$set.last_name) {
    this._update.$set.last_name = this._update.$set.last_name.toUpperCase();
  }

  // ***************** Format first name if present at root level
  if (this._update && this._update.first_name) {
    this._update.first_name = firstNameToTitleCase(this._update.first_name);
  }

  // ***************** Convert last name to uppercase if present at root level
  if (this._update && this._update.last_name) {
    this._update.last_name = this._update.last_name.toUpperCase();
  }

  // ***************** Convert email to lowercase before updating
  if (this._update && this._update.email) {
    this._update.email = this._update.email.toLowerCase();
  }

  next();
});

// ***************** EXPORT MODULE *****************
module.exports = mongoose.model('user', UserSchema);
