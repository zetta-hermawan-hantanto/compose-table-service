// *************** IMPORT CORE ***************
const mongoose = require('mongoose');

// *************** IMPORT MODULE ***************
const ErrorLogModel = require('../models/error_log.model');
const PlanValidator = require('../validators/plan.validator');
const JoinPlanner = require('./join.planner');
const AggregationBuilderV2 = require('../utils/aggregation.builder.v2');

// *************** IMPORT UTILITIES ***************
const { ValidateExportRequest } = require('../validators/export.validator.v4.2');
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

    // *************** Convert export config to v4.2 plan format
    const plan = {
      entry: 'students',
      columns: validatedColumns.map((colName) => ({
        path: colName,
        alias: colName,
      })),
      filters: validatedFilters.map((filter) => ({
        path: filter.key,
        op: filter.operator,
        value: filter.value,
      })),
      sort: null,
      limit: 10000,
      metadata: {
        intent: 'export_table',
      },
    };

    // *************** Validate plan against catalog using v4.2 validator
    const validation = PlanValidator.ValidatePlan(plan);
    if (!validation.isValid) {
      return {
        status: 'failed',
        conversation_id: conversation_id,
        messages: [
          {
            role: 'assistant',
            message: `Export validation failed: ${validation.errors.join('; ')}`,
          },
        ],
        explanation: validation.errors.join('; '),
        options: ['Fix the columns or filters and try again'],
      };
    }

    // *************** Plan joins from field paths
    const joinPlan = JoinPlanner.PlanJoins(plan);

    // *************** Build aggregation pipeline using v4.2 engine
    const pipeline = AggregationBuilderV2.BuildPipeline(plan, joinPlan);

    // *************** Execute aggregation pipeline
    const studentRecords = await StudentModel.aggregate(pipeline);

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
