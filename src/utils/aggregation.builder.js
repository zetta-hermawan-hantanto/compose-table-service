// *************** IMPORT UTILITIES ***************
const { BuildMongoFilter } = require('./query.builders');

/**
 * DetectRequiredJoins analyzes contract to determine which joins are needed.
 * Scans columns filters and sort to extract entity references.
 * Returns set of entity names that require lookup stages.
 * @param {object} contract - Validated contract with columns filters and sort.
 * @returns {Set<string>} - Set of entity names requiring joins.
 */
function DetectRequiredJoins(contract) {
  // *************** Initialize empty set for join tracking
  const joinSet = new Set();

  // *************** Check columns for joined paths
  if (contract.columns && Array.isArray(contract.columns)) {
    for (let i = 0; i < contract.columns.length; i++) {
      const column = contract.columns[i];
      const sourcePath = column.source && column.source.field;

      if (sourcePath && typeof sourcePath === 'string') {
        // *************** Extract entity from path format entity.field
        if (sourcePath.includes('.')) {
          const entity = sourcePath.split('.')[0];
          if (entity !== 'students') {
            joinSet.add(entity);
          }
        }
      }
    }
  }

  // *************** Check filters for joined paths
  if (contract.filters && Array.isArray(contract.filters)) {
    for (let i = 0; i < contract.filters.length; i++) {
      const filter = contract.filters[i];
      if (filter.key && filter.key.includes('.')) {
        const entity = filter.key.split('.')[0];
        if (entity !== 'students') {
          joinSet.add(entity);
        }
      }
    }
  }

  // *************** Check sort for joined paths
  if (contract.sort && contract.sort.key) {
    if (contract.sort.key.includes('.')) {
      const entity = contract.sort.key.split('.')[0];
      if (entity !== 'students') {
        joinSet.add(entity);
      }
    }
  }

  return joinSet;
}

/**
 * BuildRncpTitleLookup creates lookup stage for rncp_title join.
 * Performs 1:1 join from students.rncp_title to rncp_title collection.
 * Projects only allowed fields and guards null references.
 * @returns {Array} - Array of aggregation stages for rncp_title lookup.
 */
function BuildRncpTitleLookup() {
  // *************** Build lookup stage with 1:1 join safety
  return [
    {
      $lookup: {
        from: 'rncp_titles',
        localField: 'rncp_title',
        foreignField: '_id',
        as: 'rncp_title_join',
        pipeline: [
          {
            $project: {
              short_name: 1,
              long_name: 1,
              rncp_code: 1,
              rncp_level: 1,
              status: 1,
              year_of_certification: 1,
            },
          },
          { $limit: 1 },
        ],
      },
    },
    {
      $addFields: {
        rncp_title_doc: { $arrayElemAt: ['$rncp_title_join', 0] },
      },
    },
    {
      $project: {
        rncp_title_join: 0,
      },
    },
  ];
}

/**
 * BuildSchoolLookup creates lookup stage for school join with address resolution.
 * Performs 1:1 join from students.school to school collection.
 * Extracts city and country from main school_address subdocument.
 * @returns {Array} - Array of aggregation stages for school lookup.
 */
function BuildSchoolLookup() {
  // *************** Build lookup with address resolution pipeline
  return [
    {
      $lookup: {
        from: 'schools',
        localField: 'school',
        foreignField: '_id',
        as: 'school_join',
        pipeline: [
          {
            $addFields: {
              main_address: {
                $filter: {
                  input: { $ifNull: ['$school_address', []] },
                  as: 'addr',
                  cond: { $eq: ['$$addr.is_main_address', true] },
                },
              },
            },
          },
          {
            $addFields: {
              main_addr_doc: {
                $cond: {
                  if: { $gt: [{ $size: '$main_address' }, 0] },
                  then: { $arrayElemAt: ['$main_address', 0] },
                  else: { $arrayElemAt: [{ $ifNull: ['$school_address', []] }, 0] },
                },
              },
            },
          },
          {
            $project: {
              short_name: 1,
              long_name: 1,
              status: 1,
              school_siret: 1,
              city: '$main_addr_doc.city',
              country: '$main_addr_doc.country',
            },
          },
          { $limit: 1 },
        ],
      },
    },
    {
      $addFields: {
        school_doc: { $arrayElemAt: ['$school_join', 0] },
      },
    },
    {
      $project: {
        school_join: 0,
      },
    },
  ];
}

/**
 * BuildClassLookup creates lookup stage for class join.
 * Performs 1:1 join from students.current_class to class collection.
 * Projects only allowed fields and guards null references.
 * @returns {Array} - Array of aggregation stages for class lookup.
 */
function BuildClassLookup() {
  // *************** Build lookup stage with 1:1 join safety
  return [
    {
      $lookup: {
        from: 'classes',
        localField: 'current_class',
        foreignField: '_id',
        as: 'class_join',
        pipeline: [
          {
            $project: {
              name: 1,
              status: 1,
              year_of_certification: 1,
              type_evaluation: 1,
              evaluation_step: 1,
              class_active: 1,
            },
          },
          { $limit: 1 },
        ],
      },
    },
    {
      $addFields: {
        class_doc: { $arrayElemAt: ['$class_join', 0] },
      },
    },
    {
      $project: {
        class_join: 0,
      },
    },
  ];
}

/**
 * BuildProjectionStage creates final projection for flat output document.
 * Maps column definitions to flat field names for consistent output.
 * Handles both direct student fields and joined entity fields.
 * @param {Array} columns - Array of column definitions with source paths.
 * @returns {object} - MongoDB projection object for aggregation.
 */
function BuildProjectionStage(columns) {
  // *************** Validate columns parameter
  if (!columns || !Array.isArray(columns)) {
    return { _id: 0 };
  }

  // *************** Initialize projection with _id exclusion
  const projection = { _id: 0 };

  // *************** Process each column to build projection
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];
    const sourcePath = column.source && column.source.field;

    if (!sourcePath) {
      continue;
    }

    // *************** Check if source is computed expression
    const isComputedExpression = sourcePath.includes('+');

    if (isComputedExpression) {
      // *************** Skip computed expressions in projection stage
      // Will be handled in post-processing
      continue;
    }

    // *************** Extract entity and field from path
    if (sourcePath.includes('.')) {
      const parts = sourcePath.split('.');
      const entity = parts[0];
      const field = parts[1];

      if (entity === 'students') {
        // *************** Direct student field
        projection[column.key] = `$${field}`;
      } else {
        // *************** Joined entity field with null guard
        projection[column.key] = `$${entity}_doc.${field}`;
      }
    } else {
      // *************** Legacy format without entity prefix
      projection[column.key] = `$${sourcePath}`;
    }
  }

  return projection;
}

/**
 * BuildStudentAggregation constructs MongoDB aggregation pipeline for joined queries.
 * Detects required joins and builds optimized pipeline with lookups filters and projection.
 * Maintains backward compatibility with students-only queries (no lookups).
 * @param {object} params - Parameters for aggregation construction.
 * @param {Array} params.columns - Column definitions with source paths.
 * @param {Array} params.filters - Filter conditions array.
 * @param {object} params.sort - Sort configuration with key and direction.
 * @returns {Array} - Complete MongoDB aggregation pipeline array.
 */
function BuildStudentAggregation({ columns, filters, sort }) {
  // *************** Initialize empty pipeline
  const pipeline = [];

  // *************** Detect which joins are required
  const requiredJoins = DetectRequiredJoins({ columns, filters, sort });

  // *************** Build initial match stage for student filters only
  const studentFilters = [];
  if (filters && Array.isArray(filters)) {
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (filter.key && filter.key.startsWith('students.')) {
        studentFilters.push(filter);
      }
    }
  }

  if (studentFilters.length > 0) {
    const mongoFilter = BuildMongoFilter(studentFilters);
    if (Object.keys(mongoFilter).length > 0) {
      pipeline.push({ $match: mongoFilter });
    }
  }

  // *************** Add lookup stages for required joins
  if (requiredJoins.has('rncp_title')) {
    pipeline.push(...BuildRncpTitleLookup());
  }

  if (requiredJoins.has('school')) {
    pipeline.push(...BuildSchoolLookup());
  }

  if (requiredJoins.has('class')) {
    pipeline.push(...BuildClassLookup());
  }

  // *************** Build match stage for joined entity filters
  const joinedFilters = [];
  if (filters && Array.isArray(filters)) {
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (filter.key && !filter.key.startsWith('students.')) {
        // *************** Transform joined filter to aggregation format
        const parts = filter.key.split('.');
        if (parts.length === 2) {
          const entity = parts[0];
          const field = parts[1];
          joinedFilters.push({
            key: `${entity}_doc.${field}`,
            op: filter.op,
            value: filter.value,
          });
        }
      }
    }
  }

  if (joinedFilters.length > 0) {
    const joinedMongoFilter = BuildMongoFilter(joinedFilters);
    if (Object.keys(joinedMongoFilter).length > 0) {
      pipeline.push({ $match: joinedMongoFilter });
    }
  }

  // *************** Add projection stage to flatten output
  if (columns && Array.isArray(columns)) {
    const projectionStage = BuildProjectionStage(columns);
    if (Object.keys(projectionStage).length > 1) {
      pipeline.push({ $project: projectionStage });
    }
  }

  // *************** Add sort stage if specified
  if (sort && sort.key && sort.dir) {
    const sortKey = sort.key.includes('.')
      ? sort.key.split('.').slice(-1)[0]
      : sort.key;
    const sortDir = sort.dir === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { [sortKey]: sortDir } });
  }

  return pipeline;
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildStudentAggregation,
  DetectRequiredJoins,
  BuildRncpTitleLookup,
  BuildSchoolLookup,
  BuildClassLookup,
};
