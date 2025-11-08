// *************** IMPORT LIBRARY ***************
const nodemailer = require('nodemailer');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

// *************** Get environment variables
const env = process.env.NODE_ENV;
const IAM_USER_KEY = process.env.AMAZON_S3_ACCESS_KEY;
const IAM_USER_SECRET = process.env.AMAZON_S3_SECRET_KEY;

// *************** Configure SES client
const sesClient = new SESv2Client({
  region: 'eu-west-1',
  credentials: {
    accessKeyId: IAM_USER_KEY,
    secretAccessKey: IAM_USER_SECRET,
  },
});

// *************** Configure nodemailer transport
const transport = nodemailer.createTransport({
  SES: { sesClient, SendEmailCommand },
});

/**
 * Sends an email using AWS SES via Nodemailer.
 *
 *
 * @param {Object} mailOptions - Email configuration object compatible with Nodemailer.
 * @param {Function} next - Callback function to execute after sending or skipping.
 */
function sendMail(mailOptions, next) {
  // *************** Log mail options for debugging
  console.log('amazon mail options ', mailOptions);

  // *************** Only send when the app is in production mode
  if (env === 'production') {
    transport.sendMail(mailOptions, next);
  } else {
    next();
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  sendMail,
};
