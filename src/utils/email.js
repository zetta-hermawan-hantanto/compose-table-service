// *************** IMPORT LIBRARY ***************
const fs = require('fs');
const mongoose = require('mongoose');

// *************** IMPORT MODULES ***************
const UserModel = require('../models/user.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT SERVICES ***************
const { sendMail } = require('../services/amazon.service');

/**
 * @function CompileHtmlTemplate
 * @description
 * Replaces all placeholder variables in an HTML email template with their corresponding values.
 * Each placeholder should follow the format `{{key}}`. Missing values are logged for debugging.
 *
 * @rationale
 * Ensures dynamic HTML email templates (e.g., export notifications) can be filled with user-specific data
 * such as civility, name, and download link without manual string concatenation.
 *
 * @param {string} templateContent - The raw HTML string containing placeholders (e.g., `{{first_name}}`).
 * @param {Object} placeholders - Key-value mapping of placeholders and their actual values.
 * @param {string} placeholders.first_name - User’s first name.
 * @param {string} placeholders.last_name - User’s last name.
 * @param {string} placeholders.civility - User’s civility (e.g., Mr., Ms., Mme).
 * @param {string} placeholders.URL - The download URL to be inserted.
 *
 * @returns {string} - The compiled HTML with all placeholders replaced by actual values.
 */
function CompileHtmlTemplate(templateContent, placeholders) {
  // *************** Replace placeholders in the template with actual values
  return templateContent.replace(/{{(.*?)}}/g, (match, placeholder) => {
    // *************** Trim whitespace from placeholder key
    const key = placeholder.trim();

    // *************** Log missing placeholders
    if (!placeholders[key]) {
      console.warn(`Missing placeholder value for: ${key}`);
    }

    // *************** Return the corresponding value or the original match if not found
    return placeholders[key] || match;
  });
}

/**
 * @function SendExportEmail
 * @description
 * Sends an email notification to the user when a data export has been successfully processed.
 * The email uses a language-specific HTML template (EN or FR) and includes the download link for the CSV file.
 *
 * @rationale
 * Automates post-export notifications to improve user experience and ensure immediate access to export files.
 * It validates all inputs, reads the correct template, injects user data, and sends the email via Amazon SES.
 *
 * @param {Object} params - Function parameters.
 * @param {string} params.userId - MongoDB ObjectId of the user who requested the export.
 * @param {string} params.csvResultString - The generated CSV data (for potential debugging or storage reference).
 * @param {string} params.fileUrl - The AWS S3 public link for downloading the exported file.
 * @param {string} params.lang - The email language, must be either `'en'` or `'fr'`.
 *
 * @returns {Promise<void>} - Resolves when the email has been successfully sent.
 *
 * @throws {Error} - If any validation fails, user not found, or email sending fails.
 */
async function SendExportEmail({ userId, csvResultString, fileUrl, lang }) {
  try {
    if (!fileUrl || typeof fileUrl !== 'string') {
      throw new Error('File URL is required to send export email');
    }

    // *************** Validate input parameter of userId
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error('User ID is required to send export email');
    }

    // *************** Validate input parameter of csvResultString
    if (!csvResultString || typeof csvResultString !== 'string') {
      throw new Error('CSV result string content is required for the email body');
    }

    // *************** Validate input parameter of lang
    if (!['en', 'fr'].includes(lang)) {
      throw new Error('Unsupported language for export email');
    }

    // *************** Fetch user details from database
    const user = await UserModel.findById(userId).select('email first_name last_name civility').lean();
    if (!user) {
      throw new Error('User not found for sending export email');
    }
    // *************** Determine email subject based on language
    const subject = lang === 'fr' ? 'Votre export de données est prêt' : 'Your Data Export is Ready';

    // *************** Determine template path based on language
    const templatePath = lang === 'fr' ? 'src/shared/templates/export/FR.html' : 'src/shared/templates/export/EN.html';

    // *************** Read HTML template content
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // *************** Compile HTML content with user-specific data
    const emailHtml = CompileHtmlTemplate(templateContent, {
      URL: fileUrl,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      civility: user.civility || '',
    });

    const mailOptions = {
      from: 'noreply@example.com',
      to: user.email,
      subject: subject,
      html: emailHtml,
    };

    // TODO: Create MailModel entry for tracking sent emails

    // *************** Send email using Amazon SES service
    sendMail(mailOptions);
  } catch (error) {
    await ErrorLogModel.create({
      name_function: 'SendExportEmail',
      parameter_input: JSON.stringify({ mailOptions, userId }),
      error_message: error.message,
    });

    throw new Error('Error sending export email');
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  SendExportEmail,
};
