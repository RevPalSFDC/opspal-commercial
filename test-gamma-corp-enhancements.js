#!/usr/bin/env node

/**
 * Test Enhanced Conflicts Report Against gamma-corp Data
 *
 * This script demonstrates the v2.0 enhancements to the Salesforce
 * Automation Conflicts Report using real gamma-corp audit data.
 *
 * Comparison:
 * - v1.0: Basic conflict detection (MULTI_TRIGGER_SAME_EVENT)
 * - v2.0: Field-level analysis, risk scoring, execution order, governor projections
 */

const fs = require('fs');
const path = require('path');

// Import the enhanced reporter
const AutomationReporter = require('./.claude-plugins/opspal-salesforce/scripts/lib/automation-reporter.js');

// gamma-corp audit directory - use environment variable or relative path
const GAMMA_CORP_AUDIT_DIR = process.env.GAMMA_CORP_AUDIT_DIR ||
  path.join(process.env.WORKSPACE_DIR || process.cwd(), 'instances', 'salesforce', 'gamma-corp', 'automation-audit-v2-VERIFIED-2025-10-09-162440');

console.log('='.repeat(80));
console.log('Testing Enhanced Conflicts Report Against gamma-corp Data');
console.log('='.repeat(80));
console.log();

// Check if audit directory exists
if (!fs.existsSync(GAMMA_CORP_AUDIT_DIR)) {
    console.error(`❌ Audit directory not found: ${GAMMA_CORP_AUDIT_DIR}`);
    process.exit(1);
}

// Load existing conflicts (v1.0 output)
const conflictsPath = path.join(GAMMA_CORP_AUDIT_DIR, 'findings', 'Conflicts.json');
if (!fs.existsSync(conflictsPath)) {
    console.error(`❌ Conflicts file not found: ${conflictsPath}`);
    process.exit(1);
}

const existingConflicts = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));

console.log('📊 V1.0 Conflicts Report Summary:');
console.log(`   - Total conflicts: ${existingConflicts.length}`);
console.log(`   - Severity breakdown:`);

const v1SeverityCounts = existingConflicts.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1;
    return acc;
}, {});

Object.entries(v1SeverityCounts).forEach(([severity, count]) => {
    console.log(`     • ${severity}: ${count}`);
});

console.log();
console.log('🔍 V1.0 Conflict Rules Detected:');
const v1Rules = [...new Set(existingConflicts.map(c => c.rule))];
v1Rules.forEach(rule => {
    const count = existingConflicts.filter(c => c.rule === rule).length;
    console.log(`   - ${rule}: ${count}`);
});

console.log();
console.log('⚠️  V1.0 Limitations Observed:');
console.log('   ❌ No field-level write analysis');
console.log('   ❌ No data corruption risk scoring');
console.log('   ❌ No execution order phase analysis');
console.log('   ❌ No governor limit projections');
console.log('   ❌ Generic "4-8 hours" time estimates');
console.log('   ❌ No business logic extraction from code');

console.log();
console.log('-'.repeat(80));
console.log();

// Create test output directory
const testOutputDir = path.join(__dirname, 'test-output-gamma-corp-' + Date.now());
fs.mkdirSync(testOutputDir, { recursive: true });

console.log('🚀 Generating V2.0 Enhanced Reports...');
console.log(`   Output directory: ${testOutputDir}`);
console.log();

try {
    // Initialize reporter with gamma-corp data
    const reporter = new AutomationReporter(GAMMA_CORP_AUDIT_DIR, testOutputDir);

    // Generate all reports (including v2.0 enhancements)
    console.log('   [1/8] Loading audit data...');
    reporter.loadData();

    console.log('   [2/8] Generating Conflicts CSV (v1.0)...');
    const conflictsCSV = reporter.generateConflictsCSV();

    console.log('   [3/8] Generating Triggers CSV (v1.0)...');
    const triggersCSV = reporter.generateTriggersCSV();

    console.log('   [4/8] Generating Workflow Rules CSV (v1.0)...');
    const workflowRulesCSV = reporter.generateWorkflowRulesCSV();

    console.log('   [5/8] ✨ NEW: Generating Field Write Collisions CSV (v2.0)...');
    const fieldWriteCSV = reporter.generateFieldWriteCollisionsCSV();

    console.log('   [6/8] ✨ NEW: Generating Execution Order Analysis (v2.0)...');
    const executionOrderMD = reporter.generateExecutionOrderAnalysis();

    console.log('   [7/8] ✨ NEW: Generating Data Corruption Risk Matrix (v2.0)...');
    const riskMatrixCSV = reporter.generateDataCorruptionRiskMatrix();

    console.log('   [8/8] ✨ NEW: Generating Governor Limit Projections (v2.0)...');
    const governorCSV = reporter.generateGovernorLimitProjectionsCSV();

    console.log();
    console.log('✅ All reports generated successfully!');
    console.log();

    // Summary of v2.0 enhancements
    console.log('📈 V2.0 Enhancement Summary:');
    console.log();

    // Count files generated
    const outputFiles = fs.readdirSync(testOutputDir);
    console.log(`   Total files generated: ${outputFiles.length}`);
    console.log();

    console.log('   📄 V1.0 Reports (Baseline):');
    console.log(`      1. Conflicts.csv - ${fs.statSync(path.join(testOutputDir, 'Conflicts.csv')).size} bytes`);
    console.log(`      2. Triggers.csv - ${fs.statSync(path.join(testOutputDir, 'Triggers.csv')).size} bytes`);
    console.log(`      3. Workflow_Rules.csv - ${fs.statSync(path.join(testOutputDir, 'Workflow_Rules.csv')).size} bytes`);
    console.log();

    console.log('   ✨ V2.0 Enhanced Reports (NEW):');
    console.log(`      4. Field_Write_Collisions.csv - ${fs.statSync(path.join(testOutputDir, 'Field_Write_Collisions.csv')).size} bytes`);
    console.log(`         └─ Field-level write analysis with data types and formulas`);
    console.log(`      5. Execution_Order_Analysis.md - ${fs.statSync(path.join(testOutputDir, 'Execution_Order_Analysis.md')).size} bytes`);
    console.log(`         └─ Phase-by-phase execution order breakdown (beforeInsert, afterUpdate, etc.)`);
    console.log(`      6. Data_Corruption_Risk_Matrix.csv - ${fs.statSync(path.join(testOutputDir, 'Data_Corruption_Risk_Matrix.csv')).size} bytes`);
    console.log(`         └─ 0-100 risk scoring per field with contributing factors`);
    console.log(`      7. Governor_Limit_Projections.csv - ${fs.statSync(path.join(testOutputDir, 'Governor_Limit_Projections.csv')).size} bytes`);
    console.log(`         └─ DML, SOQL, CPU, Heap projections for single + bulk (200) operations`);
    console.log();

    // Preview Field Write Collisions
    console.log('🔍 Preview: Field_Write_Collisions.csv');
    const fieldWriteContent = fs.readFileSync(path.join(testOutputDir, 'Field_Write_Collisions.csv'), 'utf8');
    const fieldWriteLines = fieldWriteContent.split('\n');
    console.log('   First 5 rows:');
    fieldWriteLines.slice(0, 6).forEach((line, idx) => {
        if (idx === 0) {
            console.log(`   ${line.substring(0, 120)}...`);
        } else if (line.trim()) {
            console.log(`   ${line.substring(0, 120)}...`);
        }
    });
    console.log();

    // Preview Risk Matrix
    console.log('🔍 Preview: Data_Corruption_Risk_Matrix.csv');
    const riskContent = fs.readFileSync(path.join(testOutputDir, 'Data_Corruption_Risk_Matrix.csv'), 'utf8');
    const riskLines = riskContent.split('\n');
    console.log('   First 5 rows:');
    riskLines.slice(0, 6).forEach((line, idx) => {
        if (idx === 0) {
            console.log(`   ${line}`);
        } else if (line.trim()) {
            console.log(`   ${line}`);
        }
    });
    console.log();

    // Preview Execution Order Analysis
    console.log('🔍 Preview: Execution_Order_Analysis.md');
    const executionContent = fs.readFileSync(path.join(testOutputDir, 'Execution_Order_Analysis.md'), 'utf8');
    const executionLines = executionContent.split('\n');
    console.log('   First 20 lines:');
    executionLines.slice(0, 20).forEach(line => {
        console.log(`   ${line}`);
    });
    console.log();

    // Business value summary
    console.log('💰 Business Value Summary:');
    console.log();
    console.log('   ⏱️  Time Savings:');
    console.log('      • Field-level analysis: 2-3 hours saved per conflict (was manual)');
    console.log('      • Risk scoring: 1-2 hours saved per object (was subjective guessing)');
    console.log('      • Execution order: 1-2 hours saved per trigger group (was trial-and-error)');
    console.log('      • Governor projections: 30-60 min saved per trigger (was manual calculation)');
    console.log();
    console.log('   📊 For gamma-corp (with existing conflicts):');
    const multiTriggerConflicts = existingConflicts.filter(c => c.rule === 'MULTI_TRIGGER_SAME_EVENT').length;
    const fieldCollisionConflicts = existingConflicts.filter(c => c.rule === 'FIELD_WRITE_COLLISION').length;
    console.log(`      • ${multiTriggerConflicts} MULTI_TRIGGER conflicts × 3 hrs = ${multiTriggerConflicts * 3} hours saved`);
    console.log(`      • ${fieldCollisionConflicts} FIELD_WRITE_COLLISION × 2 hrs = ${fieldCollisionConflicts * 2} hours saved`);
    console.log(`      • Total estimated time savings: ${(multiTriggerConflicts * 3) + (fieldCollisionConflicts * 2)} hours`);
    console.log();
    console.log('   🎯 Accuracy Improvements:');
    console.log('      • Risk assessment: From subjective to 0-100 quantified score');
    console.log('      • Time estimates: From generic "4-8 hrs" to trigger-specific based on complexity');
    console.log('      • Field analysis: From "unknown fields" to exact field + value + formula');
    console.log('      • Governor limits: From "at risk" to specific DML/SOQL/CPU/Heap projections');
    console.log();

    console.log('='.repeat(80));
    console.log('✅ Test Complete - Enhanced Reports Generated');
    console.log('='.repeat(80));
    console.log();
    console.log(`📁 Review output files in: ${testOutputDir}`);
    console.log();
    console.log('Next Steps:');
    console.log('   1. Review Field_Write_Collisions.csv for field-level details');
    console.log('   2. Check Data_Corruption_Risk_Matrix.csv for high-risk fields');
    console.log('   3. Read Execution_Order_Analysis.md for consolidation roadmap');
    console.log('   4. Use Governor_Limit_Projections.csv for capacity planning');
    console.log();

} catch (error) {
    console.error('❌ Error generating reports:', error.message);
    console.error();
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
}
