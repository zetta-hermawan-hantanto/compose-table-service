// *************** IMPORT CORE ***************
const fs = require('fs');
const path = require('path');

// *************** CONSTANTS ***************
const CATALOG_PATH = path.join(__dirname, '..', 'shared', 'catalog', 'schema.catalog.json');

/**
 * loadCatalogJson reads the catalog file once per invocation.
 * @returns {object} Parsed catalog JSON.
 */
function loadCatalogJson() {
  const catalogRaw = fs.readFileSync(CATALOG_PATH, 'utf8');
  return JSON.parse(catalogRaw);
}

/**
 * buildFieldIndex produces a flattened field list for students and joined entities.
 * Adds both entity-prefixed and relation-alias-prefixed keys so validators can
 * recognise paths like school.short_name or current_class.name.
 * @param {object} catalog - Parsed catalog json.
 * @returns {Array<object>} Field metadata array.
 */
function buildFieldIndex(catalog) {
  if (!catalog || !Array.isArray(catalog.entities)) {
    throw new Error('Catalog entities missing');
  }

  const studentsEntity = catalog.entities.find((entity) => entity.name === 'students');
  if (!studentsEntity) {
    throw new Error('Students entity not found in catalog');
  }

  const relationAliasMap = new Map();
  if (Array.isArray(catalog.relations)) {
    catalog.relations.forEach((relation) => {
      if (!relation.from || !relation.to) {
        return;
      }

      if (!relation.from.startsWith('students.')) {
        return;
      }

      const [, alias] = relation.from.split('.');
      const [targetEntity] = relation.to.split('.');
      if (alias && targetEntity) {
        relationAliasMap.set(alias, targetEntity);
      }
    });
  }

  const entityMap = new Map();
  catalog.entities.forEach((entity) => {
    entityMap.set(entity.name, entity);
  });

  const fieldIndex = new Map();

  const addField = ({ key, label, data_type, enumValues, entity }) => {
    if (!key || fieldIndex.has(key)) {
      return;
    }

    fieldIndex.set(key, {
      key,
      label: label || key,
      data_type,
      enum: enumValues || null,
      entity,
    });
  };

  // Students fields (legacy keys without prefix)
  studentsEntity.fields.forEach((field) => {
    addField({
      key: field.name,
      label: field.name,
      data_type: field.type,
      enumValues: field.enum,
      entity: 'students',
    });
  });

  // Global entity-prefixed fields
  catalog.entities.forEach((entity) => {
    if (!entity.fields) {
      return;
    }

    if (entity.name === 'students') {
      return;
    }

    entity.fields.forEach((field) => {
      const prefixedKey = `${entity.name}.${field.name}`;
      addField({
        key: prefixedKey,
        label: prefixedKey,
        data_type: field.type,
        enumValues: field.enum,
        entity: entity.name,
      });
    });
  });

  // Relation alias-prefixed fields (e.g., current_class.name)
  relationAliasMap.forEach((targetEntityName, alias) => {
    const targetEntity = entityMap.get(targetEntityName);
    if (!targetEntity || !targetEntity.fields) {
      return;
    }

    targetEntity.fields.forEach((field) => {
      const aliasKey = `${alias}.${field.name}`;
      addField({
        key: aliasKey,
        label: aliasKey,
        data_type: field.type,
        enumValues: field.enum,
        entity: targetEntityName,
      });
    });
  });

  return Array.from(fieldIndex.values());
}

module.exports = {
  CATALOG_PATH,
  loadCatalogJson,
  buildFieldIndex,
};
