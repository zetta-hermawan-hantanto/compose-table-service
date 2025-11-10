// *************** IMPORT SERVICES ***************
const CatalogService = require('./catalog.service');

/**
 * PlanJoins analyzes a plan and returns metadata for all required joins.
 * Extracts entity names from all field paths and resolves relations via catalog.
 * Returns join metadata array with collection names and pipeline configurations.
 * @param {object} plan - Plan object with columns filters and sort.
 * @returns {object} - Join metadata with joins array and joinCount.
 * @throws {Error} - If join limit exceeded or relation not found.
 */
function PlanJoins(plan) {
  // *************** Extract all field paths from plan
  const allPaths = ExtractAllPaths(plan);

  // *************** Detect required joins from paths
  const requiredJoins = DetectRequiredJoins(allPaths);

  // *************** Enforce join limit
  const constraints = CatalogService.GetConstraints();
  if (requiredJoins.size > constraints.max_joins_per_request) {
    const joinsList = Array.from(requiredJoins).join(', ');
    throw new Error(
      `Too many joins: ${requiredJoins.size}. Maximum allowed: ${constraints.max_joins_per_request}. Joins required: ${joinsList}`
    );
  }

  // *************** Build join metadata for each required join
  const joins = [];
  for (const alias of requiredJoins) {
    const joinMetadata = BuildJoinMetadata(alias);
    joins.push(joinMetadata);
  }

  // *************** Return join plan
  return {
    joins: joins,
    joinCount: joins.length,
    requiredAliases: Array.from(requiredJoins),
  };
}

/**
 * ExtractAllPaths extracts all field paths from columns filters and sort.
 * Returns deduplicated array of field paths used in plan.
 * @param {object} plan - Plan object with columns filters sort.
 * @returns {Array<string>} - Array of unique field paths.
 */
function ExtractAllPaths(plan) {
  const paths = new Set();

  // *************** Extract from columns
  if (plan.columns && Array.isArray(plan.columns)) {
    for (const column of plan.columns) {
      if (column.path) {
        paths.add(column.path);
      }
    }
  }

  // *************** Extract from filters
  if (plan.filters && Array.isArray(plan.filters)) {
    for (const filter of plan.filters) {
      if (filter.path) {
        paths.add(filter.path);
      }
    }
  }

  // *************** Extract from sort
  if (plan.sort) {
    const sortArray = Array.isArray(plan.sort) ? plan.sort : [plan.sort];
    for (const sortItem of sortArray) {
      if (sortItem.path) {
        paths.add(sortItem.path);
      }
    }
  }

  return Array.from(paths);
}

/**
 * DetectRequiredJoins identifies entity joins needed from field paths.
 * Analyzes paths containing dots and extracts entity names.
 * Filters out default entry entity to get only joined entities.
 * @param {Array<string>} paths - Array of field paths from plan.
 * @returns {Set<string>} - Set of entity aliases requiring joins.
 */
function DetectRequiredJoins(paths) {
  const joins = new Set();
  const defaultEntry = CatalogService.GetDefaultEntry();

  // *************** Analyze each path for entity prefix
  for (const path of paths) {
    // *************** Check if path contains dot notation
    if (path.includes('.')) {
      // *************** Extract entity name before first dot
      const entityName = path.split('.')[0];

      // *************** Only add if not default entry entity
      if (entityName !== defaultEntry) {
        joins.add(entityName);
      }
    }
  }

  return joins;
}

/**
 * BuildJoinMetadata creates join metadata for a specific entity alias.
 * Resolves relation from catalog and builds $lookup configuration.
 * Includes collection name foreign/local fields and pipeline extensions.
 * @param {string} alias - Entity alias to build join metadata for.
 * @returns {object} - Join metadata object for aggregation builder.
 * @throws {Error} - If relation not found in catalog.
 */
function BuildJoinMetadata(alias) {
  // *************** Get relation from catalog
  const relation = CatalogService.GetRelation(alias);

  if (!relation) {
    throw new Error(`Relation not found for alias: ${alias}. Check catalog relations configuration.`);
  }

  // *************** Build base join metadata
  const joinMetadata = {
    alias: relation.alias,
    collection: relation.collection,
    localField: relation.local_field,
    foreignField: relation.foreign_field,
    preserveNulls: relation.preserve_nulls || true,
    type: relation.type || 'one_to_one',
  };

  // *************** Add pipeline extensions if defined
  if (relation.pipeline_extensions && Array.isArray(relation.pipeline_extensions)) {
    joinMetadata.pipelineExtensions = relation.pipeline_extensions;
  }

  return joinMetadata;
}

/**
 * SeparateFilters splits filters into base entity and joined entity filters.
 * Base filters apply before joins (PreMatch).
 * Joined filters apply after joins (PostMatch).
 * @param {Array} filters - Array of filter objects from plan.
 * @param {Set<string>} joinedAliases - Set of entity aliases with joins.
 * @returns {object} - Object with baseFilters and joinedFilters arrays.
 */
function SeparateFilters(filters, joinedAliases) {
  const baseFilters = [];
  const joinedFilters = [];

  if (!filters || !Array.isArray(filters)) {
    return { baseFilters: [], joinedFilters: [] };
  }

  const defaultEntry = CatalogService.GetDefaultEntry();

  // *************** Classify each filter
  for (const filter of filters) {
    if (!filter.path) {
      continue;
    }

    // *************** Check if filter path is for joined entity
    if (filter.path.includes('.')) {
      const entityName = filter.path.split('.')[0];

      if (entityName === defaultEntry) {
        // *************** Explicit base entity path (students.status)
        baseFilters.push(filter);
      } else if (joinedAliases.has(entityName)) {
        // *************** Joined entity path (school.city)
        joinedFilters.push(filter);
      } else {
        // *************** Unknown entity default to base
        baseFilters.push(filter);
      }
    } else {
      // *************** Simple path assume base entity
      baseFilters.push(filter);
    }
  }

  return {
    baseFilters: baseFilters,
    joinedFilters: joinedFilters,
  };
}

/**
 * GetJoinedEntities returns list of entity names that require joins.
 * Used for determining which entities are referenced in plan.
 * @param {object} plan - Plan object with columns filters sort.
 * @returns {Array<string>} - Array of entity names requiring joins.
 */
function GetJoinedEntities(plan) {
  const allPaths = ExtractAllPaths(plan);
  const requiredJoins = DetectRequiredJoins(allPaths);
  return Array.from(requiredJoins);
}

/**
 * ValidateJoinConfiguration checks if all required joins exist in catalog.
 * Validates that relations are properly configured for all detected joins.
 * @param {object} plan - Plan object to validate.
 * @returns {object} - Validation result with isValid and errors.
 */
function ValidateJoinConfiguration(plan) {
  const result = { isValid: true, errors: [] };

  try {
    // *************** Extract required joins
    const allPaths = ExtractAllPaths(plan);
    const requiredJoins = DetectRequiredJoins(allPaths);

    // *************** Validate each join has relation in catalog
    for (const alias of requiredJoins) {
      const relation = CatalogService.GetRelation(alias);
      if (!relation) {
        result.isValid = false;
        result.errors.push(`No relation configured for alias: ${alias}`);
      }
    }
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Join validation error: ${error.message}`);
  }

  return result;
}

// *************** EXPORT MODULE ***************
module.exports = {
  PlanJoins,
  ExtractAllPaths,
  DetectRequiredJoins,
  BuildJoinMetadata,
  SeparateFilters,
  GetJoinedEntities,
  ValidateJoinConfiguration,
};
