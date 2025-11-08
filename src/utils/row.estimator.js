// *************** IMPORT UTILITIES ***************
const { BuildMongoFilter } = require('./query.builders');

/**
 * EstimateRowCount performs fast document count for filter validation.
 * Uses MongoDB countDocuments to check row count before expensive query execution.
 * Enforces demo environment limit of 5000 rows to maintain performance.
 * @param {Array} filters - Array of filter objects to count against.
 * @param {object} StudentModel - Mongoose model for students collection.
 * @returns {Promise<number>} - Promise resolving to document count.
 * @throws {Error} - If filters or StudentModel parameters are invalid.
 */
async function EstimateRowCount(filters, StudentModel) {
  // *************** Validate filters parameter
  if (!filters) {
    throw new Error('Filters array is required');
  }

  if (!Array.isArray(filters)) {
    throw new Error('Filters must be an array');
  }

  // *************** Validate StudentModel parameter
  if (!StudentModel) {
    throw new Error('StudentModel is required');
  }

  // *************** Build MongoDB filter from contract filters
  const mongoFilter = BuildMongoFilter(filters);

  // *************** Count documents matching filter without retrieving data
  const count = await StudentModel.countDocuments(mongoFilter);

  return count;
}

// *************** EXPORT MODULE ***************
module.exports = { EstimateRowCount };
