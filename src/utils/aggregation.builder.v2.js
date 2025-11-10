// *************** IMPORT SERVICES ***************
const CatalogService = require('../services/catalog.service');
const JoinPlanner = require('../services/join.planner');

/**
 * BuildPipeline constructs a MongoDB aggregation pipeline from plan and join metadata.
 * Pipeline stages execute in strict order: PreMatch Lookups Unwind PostMatch Project Sort Limit.
 * This is the centralized builder used by all services (generate modify export).
 * @param {object} plan - Validated plan object with columns filters sort limit.
 * @param {object} joinPlan - Join metadata from JoinPlanner.
 * @returns {Array} - MongoDB aggregation pipeline array.
 */
function BuildPipeline(plan, joinPlan) {
  const pipeline = [];

  // *************** Get entry entity for base collection
  const entry = plan.entry || CatalogService.GetDefaultEntry();
  const entryEntity = CatalogService.GetEntity(entry);

  if (!entryEntity) {
    throw new Error(`Entry entity not found in catalog: ${entry}`);
  }

  // *************** Separate filters into base and joined
  const joinedAliases = new Set(joinPlan.requiredAliases || []);
  const { baseFilters, joinedFilters } = JoinPlanner.SeparateFilters(plan.filters, joinedAliases);

  // *************** Stage 1: PreMatch (base entity filters)
  if (baseFilters && baseFilters.length > 0) {
    const preMatchStage = BuildPreMatchStage(baseFilters);
    if (preMatchStage) {
      pipeline.push(preMatchStage);
    }
  }

  // *************** Stage 2: Lookups (join stages)
  if (joinPlan.joins && joinPlan.joins.length > 0) {
    const lookupStages = BuildLookupStages(joinPlan.joins);
    pipeline.push(...lookupStages);
  }

  // *************** Stage 3: Unwind (flatten joined arrays)
  if (joinPlan.joins && joinPlan.joins.length > 0) {
    const unwindStages = BuildUnwindStages(joinPlan.joins);
    pipeline.push(...unwindStages);
  }

  // *************** Stage 4: PostMatch (joined entity filters)
  if (joinedFilters && joinedFilters.length > 0) {
    const postMatchStage = BuildPostMatchStage(joinedFilters);
    if (postMatchStage) {
      pipeline.push(postMatchStage);
    }
  }

  // *************** Stage 5: Project (select columns)
  if (plan.columns && plan.columns.length > 0) {
    const projectStage = BuildProjectStage(plan.columns, joinPlan.joins);
    if (projectStage) {
      pipeline.push(projectStage);
    }
  }

  // *************** Stage 6: Sort (ordering)
  if (plan.sort) {
    const sortStage = BuildSortStage(plan.sort);
    if (sortStage) {
      pipeline.push(sortStage);
    }
  }

  // *************** Stage 7: Limit (row cap)
  if (plan.limit) {
    const limitStage = BuildLimitStage(plan.limit);
    pipeline.push(limitStage);
  } else {
    // *************** Apply default max row cap if no limit specified
    const constraints = CatalogService.GetConstraints();
    pipeline.push({ $limit: constraints.max_row_cap });
  }

  return pipeline;
}

/**
 * BuildPreMatchStage constructs $match stage for base entity filters.
 * Applies before joins for optimal performance.
 * @param {Array} filters - Array of filter objects for base entity.
 * @returns {object|null} - $match stage or null if no filters.
 */
function BuildPreMatchStage(filters) {
  if (!filters || filters.length === 0) {
    return null;
  }

  const matchConditions = {};

  // *************** Build match conditions for each filter
  for (const filter of filters) {
    const fieldPath = BuildFieldPath(filter.path);
    const condition = BuildFilterCondition(filter.op, filter.value);

    matchConditions[fieldPath] = condition;
  }

  return { $match: matchConditions };
}

/**
 * BuildLookupStages constructs $lookup stages for all joins.
 * Each join becomes a separate $lookup with optional pipeline extensions.
 * @param {Array} joins - Array of join metadata objects.
 * @returns {Array} - Array of $lookup stages.
 */
function BuildLookupStages(joins) {
  const lookupStages = [];

  for (const join of joins) {
    const lookupStage = {
      $lookup: {
        from: join.collection,
        localField: join.localField,
        foreignField: join.foreignField,
        as: join.alias,
      },
    };

    // *************** Add pipeline extensions if defined (e.g. school address resolution)
    if (join.pipelineExtensions && join.pipelineExtensions.length > 0) {
      lookupStage.$lookup.pipeline = [...join.pipelineExtensions];
    }

    lookupStages.push(lookupStage);
  }

  return lookupStages;
}

/**
 * BuildUnwindStages constructs $unwind stages for all joins.
 * Flattens joined arrays to single documents.
 * Uses preserveNullAndEmptyArrays for 1:1 joins.
 * @param {Array} joins - Array of join metadata objects.
 * @returns {Array} - Array of $unwind stages.
 */
function BuildUnwindStages(joins) {
  const unwindStages = [];

  for (const join of joins) {
    const unwindStage = {
      $unwind: {
        path: `$${join.alias}`,
        preserveNullAndEmptyArrays: join.preserveNulls !== false,
      },
    };

    unwindStages.push(unwindStage);
  }

  return unwindStages;
}

/**
 * BuildPostMatchStage constructs $match stage for joined entity filters.
 * Applies after joins to filter on joined data.
 * @param {Array} filters - Array of filter objects for joined entities.
 * @returns {object|null} - $match stage or null if no filters.
 */
function BuildPostMatchStage(filters) {
  if (!filters || filters.length === 0) {
    return null;
  }

  const matchConditions = {};

  // *************** Build match conditions for each filter
  for (const filter of filters) {
    const fieldPath = BuildFieldPath(filter.path);
    const condition = BuildFilterCondition(filter.op, filter.value);

    matchConditions[fieldPath] = condition;
  }

  return { $match: matchConditions };
}

/**
 * BuildProjectStage constructs $project stage for column selection.
 * Maps column paths to projection fields with optional aliases.
 * @param {Array} columns - Array of column objects with path and alias.
 * @param {Array} joins - Array of join metadata for field path resolution.
 * @returns {object|null} - $project stage or null if no columns.
 */
function BuildProjectStage(columns, joins) {
  if (!columns || columns.length === 0) {
    return null;
  }

  const projection = { _id: 0 };

  // *************** Build projection for each column
  for (const column of columns) {
    const fieldPath = BuildFieldPath(column.path);
    const outputField = column.alias || column.path.replace('.', '_');

    projection[outputField] = `$${fieldPath}`;
  }

  return { $project: projection };
}

/**
 * BuildSortStage constructs $sort stage for ordering results.
 * Supports multi-key sorting with asc and desc directions.
 * @param {Array|object} sort - Sort configuration (array or single object).
 * @returns {object|null} - $sort stage or null if no sort.
 */
function BuildSortStage(sort) {
  if (!sort) {
    return null;
  }

  // *************** Normalize sort to array
  const sortArray = Array.isArray(sort) ? sort : [sort];

  const sortSpec = {};

  // *************** Build sort specification
  for (const sortItem of sortArray) {
    const fieldPath = BuildFieldPath(sortItem.path);
    const direction = sortItem.dir === 'desc' ? -1 : 1;

    sortSpec[fieldPath] = direction;
  }

  return { $sort: sortSpec };
}

/**
 * BuildLimitStage constructs $limit stage for row cap.
 * Enforces maximum row count per query.
 * @param {number} limit - Maximum number of rows to return.
 * @returns {object} - $limit stage.
 */
function BuildLimitStage(limit) {
  // *************** Enforce max row cap from constraints
  const constraints = CatalogService.GetConstraints();
  const effectiveLimit = Math.min(limit, constraints.max_row_cap);

  return { $limit: effectiveLimit };
}

/**
 * BuildFieldPath constructs MongoDB field path from plan field path.
 * Converts entity.field notation to aggregation field reference.
 * @param {string} path - Field path from plan (e.g. school.city).
 * @returns {string} - MongoDB field path (e.g. school.city).
 */
function BuildFieldPath(path) {
  // *************** Check if path contains entity prefix
  if (path.includes('.')) {
    // *************** Return as-is for joined paths
    return path;
  }

  // *************** Simple field path
  return path;
}

/**
 * BuildFilterCondition constructs MongoDB query condition for filter operation.
 * Maps filter operations to MongoDB operators.
 * @param {string} op - Filter operation (eq ne in contains gte lte).
 * @param {*} value - Filter value.
 * @returns {*} - MongoDB query condition.
 */
function BuildFilterCondition(op, value) {
  switch (op) {
    case 'eq':
      return value;

    case 'ne':
      return { $ne: value };

    case 'in':
      return { $in: Array.isArray(value) ? value : [value] };

    case 'contains':
      // *************** Case-insensitive regex for string contains
      return { $regex: value, $options: 'i' };

    case 'gte':
      return { $gte: value };

    case 'lte':
      return { $lte: value };

    case 'gt':
      return { $gt: value };

    case 'lt':
      return { $lt: value };

    default:
      // *************** Default to equality
      return value;
  }
}

/**
 * ExplainPipeline generates human-readable explanation of pipeline stages.
 * Used for debugging and logging pipeline construction.
 * @param {Array} pipeline - MongoDB aggregation pipeline.
 * @returns {string} - Human-readable pipeline explanation.
 */
function ExplainPipeline(pipeline) {
  const explanations = [];

  for (let i = 0; i < pipeline.length; i++) {
    const stage = pipeline[i];
    const stageType = Object.keys(stage)[0];

    switch (stageType) {
      case '$match':
        const filterCount = Object.keys(stage.$match).length;
        explanations.push(`Stage ${i + 1}: Match (${filterCount} filter(s))`);
        break;

      case '$lookup':
        explanations.push(`Stage ${i + 1}: Lookup ${stage.$lookup.from} as ${stage.$lookup.as}`);
        break;

      case '$unwind':
        explanations.push(`Stage ${i + 1}: Unwind ${stage.$unwind.path}`);
        break;

      case '$project':
        const fieldCount = Object.keys(stage.$project).length;
        explanations.push(`Stage ${i + 1}: Project (${fieldCount} field(s))`);
        break;

      case '$sort':
        const sortCount = Object.keys(stage.$sort).length;
        explanations.push(`Stage ${i + 1}: Sort (${sortCount} key(s))`);
        break;

      case '$limit':
        explanations.push(`Stage ${i + 1}: Limit ${stage.$limit} rows`);
        break;

      default:
        explanations.push(`Stage ${i + 1}: ${stageType}`);
    }
  }

  return explanations.join('\n');
}

// *************** EXPORT MODULE ***************
module.exports = {
  BuildPipeline,
  BuildPreMatchStage,
  BuildLookupStages,
  BuildUnwindStages,
  BuildPostMatchStage,
  BuildProjectStage,
  BuildSortStage,
  BuildLimitStage,
  BuildFieldPath,
  BuildFilterCondition,
  ExplainPipeline,
};
