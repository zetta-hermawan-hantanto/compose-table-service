// *************** BILIP v4.2 Engine Demonstration ***************
// This file demonstrates the complete v4.2 catalog-driven pipeline engine
// Run with: node demo_v4.2_engine.js

const CatalogService = require('./src/services/catalog.service');
const PlanValidator = require('./src/validators/plan.validator');
const JoinPlanner = require('./src/services/join.planner');
const AggregationBuilder = require('./src/utils/aggregation.builder.v2');

console.log('='.repeat(80));
console.log('BILIP v4.2 Catalog-Driven Aggregation Engine Demo');
console.log('='.repeat(80));
console.log('');

// *************** Test Plan 1: Students Only (No Joins) ***************
console.log('📋 TEST 1: Students Only (No Joins - v3 Compatible)');
console.log('-'.repeat(80));

const plan1 = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'first_name' },
    { path: 'last_name', alias: 'last_name' },
    { path: 'email', alias: 'email' }
  ],
  filters: [
    { path: 'status', op: 'eq', value: 'active' }
  ],
  sort: [
    { path: 'last_name', dir: 'asc' }
  ],
  limit: 100
};

console.log('\n📝 Plan:', JSON.stringify(plan1, null, 2));

// Validate plan
const validation1 = PlanValidator.ValidatePlan(plan1);
console.log('\n✅ Validation:', validation1.isValid ? 'PASSED' : 'FAILED');
if (!validation1.isValid) {
  console.log('❌ Errors:', validation1.errors);
}

// Plan joins
const joinPlan1 = JoinPlanner.PlanJoins(plan1);
console.log('\n🔗 Joins Required:', joinPlan1.joinCount);
console.log('   Join Aliases:', joinPlan1.requiredAliases.join(', ') || 'NONE');

// Build pipeline
const pipeline1 = AggregationBuilder.BuildPipeline(plan1, joinPlan1);
console.log('\n🔧 Generated Pipeline:');
console.log(AggregationBuilder.ExplainPipeline(pipeline1));
console.log('\n📦 Full Pipeline:', JSON.stringify(pipeline1, null, 2));

console.log('\n' + '='.repeat(80));
console.log('');

// *************** Test Plan 2: Students + School Join ***************
console.log('📋 TEST 2: Students with School Join');
console.log('-'.repeat(80));

const plan2 = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'first_name' },
    { path: 'last_name', alias: 'last_name' },
    { path: 'school.short_name', alias: 'school_name' },
    { path: 'school.city', alias: 'school_city' }
  ],
  filters: [
    { path: 'status', op: 'eq', value: 'active' },
    { path: 'school.country', op: 'eq', value: 'France' }
  ],
  sort: [
    { path: 'school.city', dir: 'asc' }
  ],
  limit: 100
};

console.log('\n📝 Plan:', JSON.stringify(plan2, null, 2));

// Validate plan
const validation2 = PlanValidator.ValidatePlan(plan2);
console.log('\n✅ Validation:', validation2.isValid ? 'PASSED' : 'FAILED');
if (!validation2.isValid) {
  console.log('❌ Errors:', validation2.errors);
}

// Plan joins
const joinPlan2 = JoinPlanner.PlanJoins(plan2);
console.log('\n🔗 Joins Required:', joinPlan2.joinCount);
console.log('   Join Aliases:', joinPlan2.requiredAliases.join(', '));

// Build pipeline
const pipeline2 = AggregationBuilder.BuildPipeline(plan2, joinPlan2);
console.log('\n🔧 Generated Pipeline:');
console.log(AggregationBuilder.ExplainPipeline(pipeline2));
console.log('\n📦 Full Pipeline:', JSON.stringify(pipeline2, null, 2));

console.log('\n' + '='.repeat(80));
console.log('');

// *************** Test Plan 3: Students + Multiple Joins ***************
console.log('📋 TEST 3: Students with Multiple Joins (School + RNCP + Class)');
console.log('-'.repeat(80));

const plan3 = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'first_name' },
    { path: 'last_name', alias: 'last_name' },
    { path: 'school.city', alias: 'school_city' },
    { path: 'rncp_title.rncp_level', alias: 'rncp_level' },
    { path: 'class.name', alias: 'class_name' }
  ],
  filters: [
    { path: 'status', op: 'eq', value: 'active' },
    { path: 'school.status', op: 'eq', value: 'active' },
    { path: 'class.class_active', op: 'eq', value: true }
  ],
  sort: [
    { path: 'school.city', dir: 'asc' },
    { path: 'last_name', dir: 'asc' }
  ],
  limit: 1000
};

console.log('\n📝 Plan:', JSON.stringify(plan3, null, 2));

// Validate plan
const validation3 = PlanValidator.ValidatePlan(plan3);
console.log('\n✅ Validation:', validation3.isValid ? 'PASSED' : 'FAILED');
if (!validation3.isValid) {
  console.log('❌ Errors:', validation3.errors);
}

// Plan joins
const joinPlan3 = JoinPlanner.PlanJoins(plan3);
console.log('\n🔗 Joins Required:', joinPlan3.joinCount);
console.log('   Join Aliases:', joinPlan3.requiredAliases.join(', '));

// Build pipeline
const pipeline3 = AggregationBuilder.BuildPipeline(plan3, joinPlan3);
console.log('\n🔧 Generated Pipeline:');
console.log(AggregationBuilder.ExplainPipeline(pipeline3));

console.log('\n' + '='.repeat(80));
console.log('');

// *************** Test Plan 4: Invalid Plan (Too Many Joins) ***************
console.log('📋 TEST 4: Invalid Plan - Too Many Joins (Should Fail)');
console.log('-'.repeat(80));

const plan4 = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'first_name' },
    { path: 'school.city', alias: 'school_city' },
    { path: 'rncp_title.rncp_level', alias: 'rncp_level' },
    { path: 'class.name', alias: 'class_name' },
    { path: 'user.email', alias: 'user_email' } // 4th join - should fail
  ],
  filters: [
    { path: 'status', op: 'eq', value: 'active' }
  ],
  limit: 100
};

console.log('\n📝 Plan:', JSON.stringify(plan4, null, 2));

// Validate plan
const validation4 = PlanValidator.ValidatePlan(plan4);
console.log('\n✅ Validation:', validation4.isValid ? 'PASSED' : '❌ FAILED (Expected)');
if (!validation4.isValid) {
  console.log('❌ Errors:', validation4.errors);
}

console.log('\n' + '='.repeat(80));
console.log('');

// *************** Test Plan 5: Invalid Operation ***************
console.log('📋 TEST 5: Invalid Operation (Should Fail)');
console.log('-'.repeat(80));

const plan5 = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'first_name' }
  ],
  filters: [
    { path: 'status', op: 'gte', value: 'active' } // gte not allowed for string enum
  ],
  limit: 100
};

console.log('\n📝 Plan:', JSON.stringify(plan5, null, 2));

// Validate plan
const validation5 = PlanValidator.ValidatePlan(plan5);
console.log('\n✅ Validation:', validation5.isValid ? 'PASSED' : '❌ FAILED (Expected)');
if (!validation5.isValid) {
  console.log('❌ Errors:', validation5.errors);
}

console.log('\n' + '='.repeat(80));
console.log('');

// *************** Catalog Summary ***************
console.log('📚 Catalog Summary');
console.log('-'.repeat(80));

const catalog = CatalogService.LoadCatalog();
console.log('\n📖 Catalog Version:', catalog.version);
console.log('📅 Version Date:', catalog.version_date);
console.log('🏠 Default Entry:', catalog.default_entry);

console.log('\n🗂️  Entities:');
const entities = CatalogService.ListEntities();
entities.forEach((entityName) => {
  const entity = CatalogService.GetEntity(entityName);
  const entryMark = entity.is_entry ? '✅' : '  ';
  console.log(`  ${entryMark} ${entityName} (${entity.fields.length} fields, collection: ${entity.collection})`);
});

console.log('\n🔗 Relations:');
catalog.relations.forEach((rel) => {
  console.log(`  • ${rel.alias}: ${rel.from} → ${rel.to} (${rel.type})`);
});

console.log('\n⚙️  Constraints:');
Object.entries(catalog.constraints).forEach(([key, value]) => {
  console.log(`  • ${key}: ${value}`);
});

console.log('\n' + '='.repeat(80));
console.log('');

// *************** Summary ***************
console.log('✅ BILIP v4.2 Engine Demo Complete!');
console.log('');
console.log('🎯 Key Features Demonstrated:');
console.log('  ✅ Catalog-driven validation');
console.log('  ✅ Type-aware operation checking');
console.log('  ✅ Automatic join detection');
console.log('  ✅ Filter separation (PreMatch/PostMatch)');
console.log('  ✅ Dynamic pipeline generation');
console.log('  ✅ Join limit enforcement');
console.log('  ✅ Backward compatibility (v3 plans work)');
console.log('');
console.log('🚀 Next Steps:');
console.log('  1. Integrate into chat/export services');
console.log('  2. Add MCP clarification flow');
console.log('  3. Support nested joins');
console.log('  4. Create comprehensive test suite');
console.log('');
console.log('='  .repeat(80));
