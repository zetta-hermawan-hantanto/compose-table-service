// *************** IMPORT UTILITIES ***************
const { BuildMongoFilter } = require('./query.builders');
const { DetectRequiredJoins } = require('./aggregation.builder');

/**
 * EstimateRowCount performs fast document count for filter validation.
 * Supports both simple filters and aggregation pipelines for v4 joined queries.
 * Enforces v4 max_row_cap of 10000 rows to maintain performance.
 * @param {Array|object} filtersOrPipeline - Array of filters or aggregation pipeline.
 * @param {object} StudentModel - Mongoose model for students collection.
 * @param {boolean} isAggregation - Flag indicating if input is aggregation pipeline.
 * @returns {Promise<number>} - Promise resolving to document count.
 * @throws {Error} - If parameters are invalid or count exceeds limit.
 */
async function EstimateRowCount(filtersOrPipeline, StudentModel, isAggregation = false) {
  // *************** Validate StudentModel parameter
  if (!StudentModel) {
    throw new Error('StudentModel is required');
  }

  // *************** Validate filtersOrPipeline parameter
  if (!filtersOrPipeline) {
    throw new Error('Filters or pipeline is required');
  }

  let count;

  if (isAggregation) {
    // *************** Handle aggregation pipeline counting
    if (!Array.isArray(filtersOrPipeline)) {
      throw new Error('Aggregation pipeline must be an array');
    }

    // *************** Add count stage to pipeline
    const countPipeline = [...filtersOrPipeline, { $count: 'total' }];

    // *************** Execute aggregation count
    const result = await StudentModel.aggregate(countPipeline);

    count = result.length > 0 ? result[0].total : 0;
  } else {
    // *************** Handle simple filter counting (backward compatible)
    if (!Array.isArray(filtersOrPipeline)) {
      throw new Error('Filters must be an array');
    }

    // *************** Build MongoDB filter from contract filters
    const mongoFilter = BuildMongoFilter(filtersOrPipeline);

    // *************** Count documents matching filter without retrieving data
    count = await StudentModel.countDocuments(mongoFilter);
  }

  return count;
}

/**
 * EnforceRowCap validates estimated row count against v4 max_row_cap constraint.
 * Returns error object if count exceeds limit with actionable message.
 * Used to prevent memory issues and maintain performance for large datasets.
 * @param {number} estimatedCount - Estimated row count from query.
 * @param {number} maxRowCap - Maximum allowed rows (default 10000 for v4).
 * @returns {object} - Object with isValid flag and optional error message.
 */
function EnforceRowCap(estimatedCount, maxRowCap = 10000) {
  // *************** Validate estimatedCount parameter
  if (typeof estimatedCount !== 'number') {
    return { isValid: false, error: 'Estimated count must be a number' };
  }

  // *************** Check if count exceeds cap
  if (estimatedCount > maxRowCap) {
    return {
      isValid: false,
      error: `Your request would return approximately ${estimatedCount} rows (maximum is ${maxRowCap}). Please narrow your filters.`,
      estimatedCount: estimatedCount,
      maxRowCap: maxRowCap,
    };
  }

  return { isValid: true };
}

// *************** EXPORT MODULE ***************
module.exports = { EstimateRowCount, EnforceRowCap };
