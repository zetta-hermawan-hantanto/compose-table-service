// *************** IMPORT LIBRARY ***************
const { S3, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const moment = require('moment');

// *************** IMPORT MODULE ***************
const ErrorLogModel = require('../models/error_log.model');

// *************** GLOBAL VARIABLES ***************
const BUCKET_NAME = process.env.AMAZON_S3_BUCKET_NAME;
const IAM_USER_KEY = process.env.AMAZON_S3_ACCESS_KEY;
const IAM_USER_SECRET = process.env.AMAZON_S3_SECRET_KEY;
const REGION = process.env.AMAZON_S3_REGION;

const s3bucket = new S3({
  region: REGION,
  credentials: {
    accessKeyId: IAM_USER_KEY,
    secretAccessKey: IAM_USER_SECRET,
  },
});

/**
 * SanitizeFilenameSlug converts table name or prompt text to safe filename slug.
 * Removes special characters normalizes spaces and truncates to reasonable length.
 * Used to generate human-readable filenames for CSV exports.
 * @param {string} inputText - Raw text to convert to filename slug.
 * @returns {string} - Sanitized slug safe for use in filenames.
 */
function SanitizeFilenameSlug(inputText) {
  // *************** Validate input parameter
  if (!inputText) {
    return 'export';
  }

  // *************** Normalize Unicode and remove diacritics
  let slug = inputText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // *************** Replace spaces and special characters with dash
  slug = slug.replace(/[^a-z0-9]+/g, '-');

  // *************** Remove leading and trailing dashes
  slug = slug.replace(/^-+|-+$/g, '');

  // *************** Truncate to 50 characters for reasonable length
  if (slug.length > 50) {
    slug = slug.substring(0, 50);
  }

  // *************** Remove trailing dash after truncation
  slug = slug.replace(/-+$/, '');

  // *************** Default to export if sanitization resulted in empty string
  if (slug.length === 0) {
    slug = 'export';
  }

  return slug;
}

/**
 * GenerateCsvFilename creates standardized filename for CSV export.
 * Uses pattern table-{slug}-{YYYYMMDD-HHmmss}.csv as specified in v3 requirements.
 * Slug derived from table name or prompt text.
 * @param {string} nameSource - Table name or descriptive text for filename.
 * @returns {string} - Generated filename with timestamp.
 */
function GenerateCsvFilename(nameSource) {
  // *************** Sanitize name source to create slug
  const slug = SanitizeFilenameSlug(nameSource);

  // *************** Generate timestamp in required format YYYYMMDD-HHmmss
  const timestamp = moment.utc().format('YYYYMMDD-HHmmss');

  // *************** Construct filename with pattern table-slug-timestamp.csv
  const filename = `table-${slug}-${timestamp}.csv`;

  return filename;
}

/**
 * UploadCsvToS3 uploads CSV content to S3 with proper metadata and returns presigned URL.
 * Generates 72h presigned URL for secure time-limited access to export file.
 * Sets ContentType and ContentDisposition for browser download behavior.
 * @param {object} params - Function parameters.
 * @param {string} params.csvContent - Complete CSV file content as string.
 * @param {string} params.nameSource - Table name or descriptive text for filename.
 * @returns {Promise<object>} - Upload result with url key and expires_at timestamp.
 * @throws {Error} - If S3 upload or presigned URL generation fails.
 */
async function UploadCsvToS3({ csvContent, nameSource }) {
  try {
    // *************** Validate csvContent parameter
    if (!csvContent) {
      throw new Error('CSV content is required for upload');
    }

    if (typeof csvContent !== 'string') {
      throw new Error('CSV content must be a string');
    }

    // *************** Validate nameSource parameter
    if (!nameSource) {
      throw new Error('Name source is required for filename generation');
    }

    // *************** Generate filename following v3 pattern
    const filename = GenerateCsvFilename(nameSource);

    // *************** Convert CSV string to Buffer for S3 upload
    const csvBuffer = Buffer.from(csvContent, 'utf-8');

    // *************** Prepare S3 upload parameters with proper metadata
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: filename,
      Body: csvBuffer,
      ContentType: 'text/csv; charset=utf-8',
      ContentDisposition: `attachment; filename="${filename}"`,
    };

    // *************** Upload CSV file to S3
    const putCommand = new PutObjectCommand(uploadParams);
    await s3bucket.send(putCommand);

    // *************** Generate presigned URL with 72 hour expiry
    const expiresInSeconds = 72 * 3600;
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: filename,
    });
    const presignedUrl = await getSignedUrl(s3bucket, getCommand, {
      expiresIn: expiresInSeconds,
    });

    // *************** Calculate expiration timestamp
    const expiresAt = moment.utc().add(72, 'hours').toDate();

    // *************** Construct result object with upload details
    const uploadResult = {
      url: presignedUrl,
      key: filename,
      expires_at: expiresAt,
    };

    return uploadResult;
  } catch (error) {
    // *************** Log error with safe metadata no CSV content
    await ErrorLogModel.create({
      name_function: 'UploadCsvToS3',
      parameter_input: JSON.stringify({
        nameSource: nameSource,
        csvContentLength: csvContent ? csvContent.length : 0,
      }),
      path: 'src/utils/s3.uploader.js',
      error: String(error.stack),
    });

    throw new Error('Failed to upload CSV to S3');
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  UploadCsvToS3,
  GenerateCsvFilename,
  SanitizeFilenameSlug,
};
