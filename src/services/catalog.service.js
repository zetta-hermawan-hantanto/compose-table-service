// *************** IMPORT CORE ***************
const fs = require('fs');
const path = require('path');

// *************** CATALOG CACHE ***************
let catalogCache = null;

/**
 * LoadCatalog reads and parses the v4.2 catalog JSON file.
 * Caches result in memory to avoid repeated file reads.
 * This is the single source of truth for all entities fields and relations.
 * @returns {object} - Parsed catalog object with version entities relations constraints.
 * @throws {Error} - If catalog file cannot be read or parsed.
 */
function LoadCatalog() {
  // *************** Return cached catalog if available
  if (catalogCache) {
    return catalogCache;
  }

  // *************** Construct absolute path to catalog file
  const catalogPath = path.join(__dirname, '..', 'shared', 'catalog', 'schema.catalog.json');

  // *************** Read and parse catalog file
  const catalogRaw = fs.readFileSync(catalogPath, 'utf8');
  const catalog = JSON.parse(catalogRaw);

  // *************** Validate catalog structure
  if (!catalog.version) {
    throw new Error('Catalog missing version field');
  }

  if (!Array.isArray(catalog.entities)) {
    throw new Error('Catalog missing entities array');
  }

  if (!Array.isArray(catalog.relations)) {
    throw new Error('Catalog missing relations array');
  }

  // *************** Cache and return
  catalogCache = catalog;
  return catalog;
}

/**
 * GetEntity retrieves entity metadata by name from catalog.
 * Used to lookup entity collection name fields and configuration.
 * @param {string} entityName - Name of entity to retrieve (e.g. students school).
 * @returns {object|null} - Entity object or null if not found.
 */
function GetEntity(entityName) {
  // *************** Validate entity name parameter
  if (!entityName) {
    throw new Error('Entity name is required');
  }

  if (typeof entityName !== 'string') {
    throw new Error('Entity name must be a string');
  }

  // *************** Load catalog
  const catalog = LoadCatalog();

  // *************** Find entity by name
  const entity = catalog.entities.find((e) => e.name === entityName);

  return entity || null;
}

/**
 * GetField retrieves field metadata from specified entity.
 * Returns field configuration including type allowed_ops and enum values.
 * @param {string} entityName - Name of entity containing the field.
 * @param {string} fieldName - Name of field to retrieve.
 * @returns {object|null} - Field object or null if not found.
 */
function GetField(entityName, fieldName) {
  // *************** Validate parameters
  if (!entityName || !fieldName) {
    throw new Error('Entity name and field name are required');
  }

  // *************** Get entity
  const entity = GetEntity(entityName);

  if (!entity) {
    return null;
  }

  // *************** Find field in entity
  const field = entity.fields.find((f) => f.name === fieldName);

  return field || null;
}

/**
 * GetRelation retrieves relation metadata by alias from catalog.
 * Used to resolve join requirements and build $lookup stages.
 * @param {string} alias - Relation alias (e.g. school rncp_title class).
 * @returns {object|null} - Relation object with collection foreign_field local_field or null.
 */
function GetRelation(alias) {
  // *************** Validate alias parameter
  if (!alias) {
    throw new Error('Relation alias is required');
  }

  // *************** Load catalog
  const catalog = LoadCatalog();

  // *************** Find relation by alias
  const relation = catalog.relations.find((r) => r.alias === alias);

  return relation || null;
}

/**
 * ResolveFieldPath parses a field path and returns entity and field names.
 * Handles both simple paths (first_name) and joined paths (school.city).
 * Assumes simple paths belong to default entry entity.
 * @param {string} fieldPath - Field path in format entity.field or just field.
 * @returns {object} - Object with entityName and fieldName properties.
 */
function ResolveFieldPath(fieldPath) {
  // *************** Validate field path parameter
  if (!fieldPath) {
    throw new Error('Field path is required');
  }

  if (typeof fieldPath !== 'string') {
    throw new Error('Field path must be a string');
  }

  // *************** Check if path contains dot notation
  if (fieldPath.includes('.')) {
    // *************** Split into entity and field
    const parts = fieldPath.split('.');

    if (parts.length !== 2) {
      throw new Error(`Invalid field path format: ${fieldPath}. Expected entity.field`);
    }

    return {
      entityName: parts[0],
      fieldName: parts[1],
    };
  }

  // *************** Simple path assume default entry entity
  const catalog = LoadCatalog();
  const defaultEntry = catalog.default_entry || 'students';

  return {
    entityName: defaultEntry,
    fieldName: fieldPath,
  };
}

/**
 * ValidateFieldPath validates that a field path exists in catalog.
 * Resolves path to entity and field then checks if field exists.
 * @param {string} fieldPath - Field path to validate.
 * @returns {boolean} - True if field path is valid false otherwise.
 */
function ValidateFieldPath(fieldPath) {
  // *************** Resolve path to entity and field
  const { entityName, fieldName } = ResolveFieldPath(fieldPath);

  // *************** Check if entity exists
  const entity = GetEntity(entityName);

  if (!entity) {
    return false;
  }

  // *************** Check if field exists in entity
  const field = entity.fields.find((f) => f.name === fieldName);

  return !!field;
}

/**
 * GetAllowedOps retrieves allowed operations for a field.
 * Returns array of operation names (eq ne in contains gte lte).
 * Used to validate filter operations against field type.
 * @param {string} fieldPath - Field path in format entity.field or field.
 * @returns {Array<string>} - Array of allowed operation names.
 * @throws {Error} - If field not found in catalog.
 */
function GetAllowedOps(fieldPath) {
  // *************** Resolve path to entity and field
  const { entityName, fieldName } = ResolveFieldPath(fieldPath);

  // *************** Get field metadata
  const field = GetField(entityName, fieldName);

  if (!field) {
    throw new Error(`Field not found in catalog: ${fieldPath}`);
  }

  // *************** Return allowed operations or default set
  return field.allowed_ops || ['eq', 'ne', 'in'];
}

/**
 * GetFieldType retrieves data type for a field.
 * Returns type string (string number boolean date objectId).
 * @param {string} fieldPath - Field path in format entity.field or field.
 * @returns {string} - Field data type.
 * @throws {Error} - If field not found in catalog.
 */
function GetFieldType(fieldPath) {
  // *************** Resolve path to entity and field
  const { entityName, fieldName } = ResolveFieldPath(fieldPath);

  // *************** Get field metadata
  const field = GetField(entityName, fieldName);

  if (!field) {
    throw new Error(`Field not found in catalog: ${fieldPath}`);
  }

  return field.type;
}

/**
 * GetConstraints retrieves global catalog constraints.
 * Returns object with max_joins max_filters max_columns max_row_cap.
 * @returns {object} - Constraints object.
 */
function GetConstraints() {
  // *************** Load catalog
  const catalog = LoadCatalog();

  return catalog.constraints || {};
}

/**
 * GetDefaultEntry retrieves the default entry entity name.
 * Used when no explicit entry is specified in plan.
 * @returns {string} - Default entry entity name (usually students).
 */
function GetDefaultEntry() {
  // *************** Load catalog
  const catalog = LoadCatalog();

  return catalog.default_entry || 'students';
}

/**
 * ListEntities retrieves all entity names from catalog.
 * Returns array of entity name strings.
 * Used for validation and error messages.
 * @returns {Array<string>} - Array of entity names.
 */
function ListEntities() {
  // *************** Load catalog
  const catalog = LoadCatalog();

  return catalog.entities.map((e) => e.name);
}

/**
 * IsEntryEntity checks if entity can be used as entry point.
 * Returns true if entity has is_entry flag set to true.
 * @param {string} entityName - Name of entity to check.
 * @returns {boolean} - True if entity is valid entry point.
 */
function IsEntryEntity(entityName) {
  // *************** Get entity
  const entity = GetEntity(entityName);

  if (!entity) {
    return false;
  }

  return entity.is_entry === true;
}

/**
 * ResetCache clears the catalog cache.
 * Used for testing or when catalog file is updated.
 * Forces next LoadCatalog call to re-read file.
 */
function ResetCache() {
  catalogCache = null;
}

// *************** EXPORT MODULE ***************
module.exports = {
  LoadCatalog,
  GetEntity,
  GetField,
  GetRelation,
  ResolveFieldPath,
  ValidateFieldPath,
  GetAllowedOps,
  GetFieldType,
  GetConstraints,
  GetDefaultEntry,
  ListEntities,
  IsEntryEntity,
  ResetCache,
};
