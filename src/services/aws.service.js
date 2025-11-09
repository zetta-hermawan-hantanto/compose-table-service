// *************** IMPORT LIBRARY ***************
const { S3, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

// *************** IMPORT MODULES ***************
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
 * Uploads a file to AWS S3 bucket.
 *
 * @function UploadFileToS3Service
 * @param {Object} file - The file object containing buffer and originalname.
 * @throws {AppError} Throws error if upload fails.
 */
async function UploadFileToS3Service({ file }) {
  try {
    // *************** Sanitize and normalize the file name
    let sanitizedOriginalName = file.originalname
      .normalize('NFD') // *************** Normalize Unicode characters
      .replace(/[\u0300-\u036f]/g, '') // *************** Remove diacritics
      .replace(/[\/:*?"<>|]/g, '-') // *************** Replace illegal filename characters with '-'
      .replace('—', '-') // *************** Replace em dash with '-'
      .replace("'", '') // *************** Remove single quote
      .replace('’', '') // *************** Remove right single quotation mark
      .replace('ł', 'l'); // *************** Replace 'ł' with 'l'

    const uniqueKey = `${randomUUID()}-${sanitizedOriginalName}`;

    // *************** Prepare S3 upload parameters
    let params = {
      Bucket: BUCKET_NAME,
      Key: uniqueKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    // *************** Create and send the PutObjectCommand
    const command = new PutObjectCommand(params);
    await s3bucket.send(command);

    // *************** Generate presigned GET URL with 72h expiry (WHY: secure time-limited access)
    const expiresInSeconds = 72 * 3600;
    const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: uniqueKey });
    const signedUrl = await getSignedUrl(s3bucket, getCmd, { expiresIn: expiresInSeconds });

    const fileUploadedResult = {
      url: signedUrl,
      key: uniqueKey,
    };

    return fileUploadedResult;
  } catch (error) {
    // *************** Log error to ErrorLogModel for debugging
    ErrorLogModel.create({
      name_function: 'UploadFileToS3Service',
      parameter_input: JSON.stringify({
        file: file
          ? {
              originalname: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
            }
          : null,
      }),
      path: 'src/service/aws.js',
      error: String(error.stack),
    });

    // *************** Throw application error for upstream handling
    throw new Error('Error uploading file to S3');
  }
}

// *************** EXPORT MODULES ***************
module.exports = {
  UploadFileToS3Service,
};
