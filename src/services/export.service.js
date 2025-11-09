// *************** IMPORT CORE ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const ExportHistoryModel = require('../models/export.history.model');
const ErrorLogModel = require('../models/error_log.model');

// *************** IMPORT UTILITIES ***************
const { ValidateExportRequest } = require('../validators/export.validator');
const { BuildMongoFilter } = require('../utils/query.builders');
const { BuildCsvFromRows } = require('../utils/csv.builder');
const { UploadCsvToS3 } = require('../utils/s3.uploader');
const { SendExportEmail } = require('../utils/email');
const { GetExportSuccessMessage, GetExportFailureMessage } = require('../utils/export.messages');

/**
 * ProcessExportTurn handles CSV export request from chat conversation.
 * Validates export parameters builds CSV from ad-hoc query uploads to S3 and sends email.
 * Does not write to DynamicTable or DynamicRowTable for export-only flows.
 * Returns success envelope with human message or clarification or failure envelope.
 * @param {object} params - Export turn parameters.
 * @param {string} params.user_id - MongoDB ObjectId of requesting user.
 * @param {string} params.conversation_id - Session chat ID for tracking.
 * @param {object} params.export_config - Export configuration from AI response.
 * @param {Array<string>} params.export_config.columns - Column names to export.
 * @param {Array} params.export_config.filters - Optional filter conditions.
 * @param {string} params.export_config.delimiter - Delimiter name comma semicolon or tab.
 * @param {string} params.lang - Language code en or fr.
 * @param {object} StudentModel - Mongoose model for students collection.
 * @returns {Promise<object>} - Envelope response with status intent and messages.
 * @throws {Error} - If export processing fails.
 */
async function ProcessExportTurn({ user_id, conversation_id, export_config, lang, StudentModel }) {
  try {
    // *************** Validate user_id parameter
    if (!user_id) {
      throw new Error('User ID is required for export');
    }

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      throw new Error('Invalid user ID format');
    }

    // *************** Validate StudentModel parameter
    if (!StudentModel) {
      throw new Error('StudentModel is required for export');
    }

    // *************** Validate export_config parameter
    if (!export_config) {
      throw new Error('Export config is required');
    }

    // *************** Validate language parameter default to en
    const effectiveLang = lang === 'fr' ? 'fr' : 'en';

    // *************** Extract export parameters
    const { columns, filters, delimiter } = export_config;

    // *************** Validate export request parameters
    const validationResult = ValidateExportRequest({
      columns: columns,
      filters: filters,
      delimiter: delimiter,
      lang: effectiveLang,
    });

    // *************** Handle validation clarification
    if (validationResult.needsClarification) {
      return {
        status: 'need_clarification',
        conversation_id: conversation_id,
        messages: [
          {
            role: 'assistant',
            message: validationResult.clarificationMessage,
          },
        ],
      };
    }

    // *************** Handle validation failure
    if (validationResult.failed) {
      return {
        status: 'failed',
        conversation_id: conversation_id,
        messages: [
          {
            role: 'assistant',
            message: validationResult.failureMessage,
          },
        ],
        explanation: validationResult.failureMessage,
        options: ['Try with valid columns and filters'],
      };
    }

    // *************** Extract validated configuration
    const validatedConfig = validationResult.config;
    const validatedColumns = validatedConfig.columns;
    const validatedFilters = validatedConfig.filters;
    const validatedDelimiter = validatedConfig.delimiter;

    // *************** Build MongoDB filter from validated filters
    const mongoFilter = BuildMongoFilter(validatedFilters);

    // *************** Query students collection with filter and projection
    const projection = {};
    for (let i = 0; i < validatedColumns.length; i++) {
      const columnName = validatedColumns[i];
      projection[columnName] = 1;
    }

    // *************** Execute query with lean for performance
    const studentRecords = await StudentModel.find(mongoFilter).select(projection).lean();

    // *************** Build CSV content from query results
    const csvContent = BuildCsvFromRows({
      columns: validatedColumns,
      rows: studentRecords,
      delimiter: validatedDelimiter,
    });

    // *************** Determine name source for filename
    const nameSource = 'export-students';

    // *************** Upload CSV to S3 and get presigned URL
    const uploadResult = await UploadCsvToS3({
      csvContent: csvContent,
      nameSource: nameSource,
    });

    // *************** Send export email to user
    await SendExportEmail({
      userId: user_id,
      csvResultString: `Exported ${studentRecords.length} rows with ${validatedColumns.length} columns`,
      fileUrl: uploadResult.url,
      lang: effectiveLang,
    });

    // *************** Persist export history record
    await ExportHistoryModel.create({
      user_id: user_id,
      conversation_id: conversation_id || null,
      columns: validatedColumns,
      filters: validatedFilters,
      delimiter: validatedDelimiter,
      row_count: studentRecords.length,
      file_key: uploadResult.key,
      file_expires_at: uploadResult.expires_at,
      lang: effectiveLang,
      status: 'success',
    });

    // *************** Construct success envelope with human message
    const successMessage = GetExportSuccessMessage(effectiveLang);

    const successEnvelope = {
      status: 'ready',
      intent: 'export_table',
      conversation_id: conversation_id,
      messages: [
        {
          role: 'assistant',
          message: successMessage,
        },
      ],
      result: {
        summary: `Exported ${studentRecords.length} rows`,
      },
    };

    return successEnvelope;
  } catch (error) {
    // *************** Log error with safe metadata
    await ErrorLogModel.create({
      name_function: 'ProcessExportTurn',
      parameter_input: JSON.stringify({
        user_id: user_id,
        conversation_id: conversation_id,
        columnsCount: export_config?.columns?.length || 0,
        filtersCount: export_config?.filters?.length || 0,
      }),
      path: 'src/services/export.service.js',
      error: String(error.stack),
    });

    // *************** Persist failed export history record
    try {
      await ExportHistoryModel.create({
        user_id: user_id,
        conversation_id: conversation_id || null,
        columns: export_config?.columns || [],
        filters: export_config?.filters || [],
        delimiter: export_config?.delimiter || 'comma',
        row_count: 0,
        file_key: 'failed',
        file_expires_at: new Date(),
        lang: lang || 'en',
        status: 'failed',
        error_message: error.message,
      });
    } catch (historyError) {
      // *************** Log history persistence failure but do not throw
      await ErrorLogModel.create({
        name_function: 'ProcessExportTurn-HistoryFallback',
        parameter_input: JSON.stringify({ user_id: user_id }),
        path: 'src/services/export.service.js',
        error: String(historyError.stack),
      });
    }

    // *************** Return runtime failure envelope
    const effectiveLang = lang === 'fr' ? 'fr' : 'en';
    const failureMessage = GetExportFailureMessage('runtime_error', effectiveLang);

    return {
      status: 'failed',
      conversation_id: conversation_id,
      messages: [
        {
          role: 'assistant',
          message: failureMessage,
        },
      ],
      explanation: failureMessage,
      options: ['Try again in a moment'],
    };
  }
}

// *************** EXPORT MODULE ***************
module.exports = {
  ProcessExportTurn,
};
