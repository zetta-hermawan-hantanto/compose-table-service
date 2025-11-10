/**
 * Demo: Computed Columns with Joined Fields
 * 
 * Tests the new computed expression feature that concatenates fields
 * from both base entity (students) and joined entities (school, rncp_title).
 */

const ComputedExpression = require('./src/utils/computed.expression');
const PlanValidator = require('./src/validators/plan.validator');
const JoinPlanner = require('./src/services/join.planner');
const AggregationBuilderV2 = require('./src/utils/aggregation.builder.v2');
const CatalogService = require('./src/services/catalog.service');

console.log('='.repeat(80));
console.log('BILIP V4.2 - Computed Columns Test Demo');
console.log('='.repeat(80));
console.log('');

// *************** TEST 1: Parse Simple Computed Expression (Base Fields)
console.log('TEST 1: Parse simple computed expression (base fields)');
console.log('-'.repeat(80));

const expr1 = "first_name + ' ' + last_name";
console.log(`Expression: ${expr1}`);

const parseResult1 = ComputedExpression.ParseComputedExpression(expr1);
console.log('Parse Result:', JSON.stringify(parseResult1, null, 2));

if (parseResult1.valid) {
  const mongoExpr1 = ComputedExpression.BuildMongoExpression(parseResult1.tokens);
  console.log('MongoDB Expression:', JSON.stringify(mongoExpr1, null, 2));
}

console.log('');

// *************** TEST 2: Parse Computed Expression with Joined Fields
console.log('TEST 2: Parse computed expression with joined fields');
console.log('-'.repeat(80));

const expr2 = "school.short_name + ' - ' + school.long_name";
console.log(`Expression: ${expr2}`);

const parseResult2 = ComputedExpression.ParseComputedExpression(expr2);
console.log('Parse Result:', JSON.stringify(parseResult2, null, 2));

if (parseResult2.valid) {
  const mongoExpr2 = ComputedExpression.BuildMongoExpression(parseResult2.tokens);
  console.log('MongoDB Expression:', JSON.stringify(mongoExpr2, null, 2));
  
  const requiredJoins = ComputedExpression.GetRequiredJoins(parseResult2.tokens.filter(t => t.type === 'field').map(t => t.value));
  console.log('Required Joins:', requiredJoins);
}

console.log('');

// *************** TEST 3: Parse Mixed Expression (Base + Joined)
console.log('TEST 3: Parse mixed expression (base + joined fields)');
console.log('-'.repeat(80));

const expr3 = "first_name + ' from ' + school.city";
console.log(`Expression: ${expr3}`);

const parseResult3 = ComputedExpression.ParseComputedExpression(expr3);
console.log('Parse Result:', JSON.stringify(parseResult3, null, 2));

if (parseResult3.valid) {
  const mongoExpr3 = ComputedExpression.BuildMongoExpression(parseResult3.tokens);
  console.log('MongoDB Expression:', JSON.stringify(mongoExpr3, null, 2));
  
  const requiredJoins = ComputedExpression.GetRequiredJoins(parseResult3.tokens.filter(t => t.type === 'field').map(t => t.value));
  console.log('Required Joins:', requiredJoins);
}

console.log('');

// *************** TEST 4: Validate Computed Expression
console.log('TEST 4: Validate computed expression against catalog');
console.log('-'.repeat(80));

const expr4 = "school.short_name + ' - ' + school.long_name";
console.log(`Expression: ${expr4}`);

const validateResult = ComputedExpression.ValidateComputedExpression(expr4);
console.log('Validation Result:', JSON.stringify(validateResult, null, 2));

console.log('');

// *************** TEST 5: Complete Plan with Computed Columns
console.log('TEST 5: Complete plan with computed columns');
console.log('-'.repeat(80));

const plan = {
  entry: 'students',
  columns: [
    { path: 'first_name', alias: 'first_name' },
    { path: 'last_name', alias: 'last_name' },
    { 
      path: "school.short_name + ' - ' + school.long_name", 
      alias: 'full_school_name' 
    }
  ],
  filters: [
    { path: 'status', op: 'eq', value: 'active' }
  ],
  sort: [
    { path: 'last_name', dir: 'asc' }
  ],
  limit: 100
};

console.log('Plan:', JSON.stringify(plan, null, 2));
console.log('');

// Validate plan
const validation = PlanValidator.ValidatePlan(plan);
console.log('Plan Validation:', validation.isValid ? '✅ VALID' : '❌ INVALID');
if (!validation.isValid) {
  console.log('Errors:', validation.errors);
}
console.log('');

// Plan joins
if (validation.isValid) {
  const joinPlan = JoinPlanner.PlanJoins(plan);
  console.log('Join Plan:', JSON.stringify(joinPlan, null, 2));
  console.log('');

  // Build pipeline
  const pipeline = AggregationBuilderV2.BuildPipeline(plan, joinPlan);
  console.log('Generated Pipeline:');
  console.log(JSON.stringify(pipeline, null, 2));
  console.log('');

  // Explain pipeline
  const explanation = AggregationBuilderV2.ExplainPipeline(pipeline);
  console.log('Pipeline Explanation:');
  console.log(explanation);
  console.log('');

  // Check $project stage for computed expression
  const projectStage = pipeline.find(stage => stage.$project);
  if (projectStage) {
    console.log('Project Stage (computed columns):');
    console.log(JSON.stringify(projectStage, null, 2));
  }
}

console.log('');

// *************** TEST 6: Complex Multi-Field Computed Expression
console.log('TEST 6: Complex multi-field computed expression');
console.log('-'.repeat(80));

const expr6 = "rncp_title.short_name + ' (' + rncp_title.rncp_level + ') - ' + rncp_title.long_name";
console.log(`Expression: ${expr6}`);

const parseResult6 = ComputedExpression.ParseComputedExpression(expr6);
console.log('Parse Result:', JSON.stringify(parseResult6, null, 2));

if (parseResult6.valid) {
  const mongoExpr6 = ComputedExpression.BuildMongoExpression(parseResult6.tokens);
  console.log('MongoDB Expression:', JSON.stringify(mongoExpr6, null, 2));
}

console.log('');
console.log('='.repeat(80));
console.log('Demo Complete! All computed column features tested.');
console.log('='.repeat(80));
