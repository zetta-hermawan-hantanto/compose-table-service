/**
 * BuildMongoFilter converts contract filters to MongoDB query format.
 * Maps filter operators to MongoDB query operators for students collection.
 * Reuses v1 logic from compose.controller.js for backward compatibility.
 * @param {Array} filters - Array of filter objects with key op and value.
 * @returns {object} - MongoDB query filter object.
 */
function BuildMongoFilter(filters) {
  // *************** Validate filters parameter
  if (!filters) {
    return {};
  }

  if (!Array.isArray(filters)) {
    return {};
  }

  // *************** Initialize empty filter object
  const mongoFilter = {};

  // *************** Process each filter and map to MongoDB syntax
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];

    // *************** Extract field name from students.field_name format
    const fieldName = filter.key.replace('students.', '');

    // *************** Map filter operator to MongoDB operator
    if (filter.op === 'eq') {
      mongoFilter[fieldName] = filter.value;
    }

    if (filter.op === 'ne') {
      mongoFilter[fieldName] = { $ne: filter.value };
    }

    if (filter.op === 'in') {
      mongoFilter[fieldName] = { $in: filter.value };
    }

    if (filter.op === 'contains') {
      mongoFilter[fieldName] = { $regex: filter.value, $options: 'i' };
    }

    if (filter.op === 'gte') {
      mongoFilter[fieldName] = { $gte: filter.value };
    }

    if (filter.op === 'lte') {
      mongoFilter[fieldName] = { $lte: filter.value };
    }
  }

  return mongoFilter;
}

/**
 * BuildProjection creates MongoDB projection object from column definitions.
 * Maps column source fields to projection format for selective field retrieval.
 * Handles computed expressions by projecting constituent fields.
 * @param {Array} columns - Array of column objects with source field information.
 * @returns {object} - MongoDB projection object with fields set to 1.
 */
function BuildProjection(columns) {
  // *************** Validate columns parameter
  if (!columns) {
    return {};
  }

  if (!Array.isArray(columns)) {
    return {};
  }

  // *************** Initialize empty projection object
  const projection = {};

  // *************** Process each column and extract source fields
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];

    if (!column.source || !column.source.field) {
      continue;
    }

    // *************** Check if source field is computed expression
    const isComputedExpression = column.source.field.includes('+');

    if (isComputedExpression) {
      // *************** Parse computed expression for field names
      const concatPattern = /^(\w+)\s*\+\s*'([^']*)'\s*\+\s*(\w+)$/;
      const matchResult = column.source.field.match(concatPattern);

      if (matchResult) {
        const firstField = matchResult[1];
        const secondField = matchResult[3];

        // *************** Project both constituent fields
        projection[firstField] = 1;
        projection[secondField] = 1;
      }
    } else {
      // *************** Project direct field
      const fieldName = column.source.field;
      projection[fieldName] = 1;
    }
  }

  return projection;
}

/**
 * BuildSort creates MongoDB sort object from sort configuration.
 * Maps sort direction to MongoDB sort format where asc is 1 and desc is -1.
 * Returns empty object if no sort configured to maintain default order.
 * @param {object} sortConfig - Sort configuration with key and dir properties.
 * @returns {object} - MongoDB sort object with field and direction.
 */
function BuildSort(sortConfig) {
  // *************** Validate sortConfig parameter
  if (!sortConfig) {
    return {};
  }

  if (!sortConfig.key) {
    return {};
  }

  if (!sortConfig.dir) {
    return {};
  }

  // *************** Map direction string to MongoDB sort value
  let sortValue = 1;

  if (sortConfig.dir === 'asc') {
    sortValue = 1;
  }

  if (sortConfig.dir === 'desc') {
    sortValue = -1;
  }

  // *************** Construct sort object with field and direction
  const sortObject = {
    [sortConfig.key]: sortValue,
  };

  return sortObject;
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildMongoFilter,
  BuildProjection,
  BuildSort,
};
