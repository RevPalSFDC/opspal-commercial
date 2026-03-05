# Agent Tool Usage Examples

**Version**: 1.0.0
**Date**: 2025-10-26
**Purpose**: Real-world examples of agents using newly wired tools, playbooks, and frameworks

This document provides concrete examples of how agents should use the tools, playbooks, and frameworks now available through the shared library pattern.

---

## Table of Contents

1. [DataAccessError Examples](#dataaccess-error-examples)
2. [PDF Generation Examples](#pdf-generation-examples)
3. [Validation Tool Examples](#validation-tool-examples)
4. [High-ROI Tracker Examples](#high-roi-tracker-examples)
5. [Playbook Integration Examples](#playbook-integration-examples)
6. [Asana Integration Examples](#asana-integration-examples)
7. [Complete Workflow Examples](#complete-workflow-examples)

---

## DataAccessError Examples

### Example 1: Query with Fail-Fast Pattern

**Scenario**: Agent querying Salesforce data that might not exist

```javascript
const { DataAccessError } = require('../../../opspal-core/scripts/lib/data-access-error');

async function getOpportunities(orgAlias) {
    try {
        const result = await sfQuery(orgAlias, 'SELECT Id, Name FROM Opportunity LIMIT 100');

        if (!result || !result.records) {
            throw new DataAccessError(
                'Salesforce_Query',
                'Failed to fetch opportunities - no data returned',
                {
                    orgAlias,
                    query: 'SELECT Id, Name FROM Opportunity',
                    workaround: 'Check org permissions and API access'
                }
            );
        }

        if (result.records.length === 0) {
            throw new DataAccessError(
                'Salesforce_Query',
                'No opportunities found in org',
                {
                    orgAlias,
                    recommendation: 'Create sample data or check filters'
                }
            );
        }

        return result.records;
    } catch (error) {
        if (error instanceof DataAccessError) {
            throw error; // Re-throw our structured error
        }
        throw new DataAccessError('Salesforce_API', error.message, { orgAlias });
    }
}
```

**Why This Works**: Fails explicitly instead of returning empty arrays, provides actionable workarounds

---

### Example 2: Unimplemented Feature Guard

**Scenario**: Agent has planned feature not yet implemented

```javascript
async function analyzeCustomObjects(orgAlias) {
    // Feature exists but custom object analysis not implemented yet
    throw new DataAccessError(
        'Custom_Object_Analysis',
        'Custom object analysis feature not yet implemented',
        {
            status: 'planned',
            tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/42',
            workaround: 'Use standard object analysis for now',
            eta: '2025-Q1'
        }
    );
}
```

**Why This Works**: Clear communication about feature status, provides tracking link and workaround

---

## PDF Generation Examples

### Example 1: Single Report PDF

**Scenario**: Assessment agent generating PDF deliverable

```javascript
const PDFGenerationHelper = require('../../../opspal-core/scripts/lib/pdf-generation-helper');

async function generateCPQAssessment(orgAlias) {
    // 1. Generate markdown report
    const reportPath = `./reports/${orgAlias}-cpq-assessment.md`;
    await generateMarkdownReport(reportPath);

    // 2. Generate professional PDF
    const pdfPath = await PDFGenerationHelper.generateSingleReportPDF({
        markdownPath: reportPath,
        outputDir: './reports',
        coverTemplate: 'salesforce-audit',
        metadata: {
            title: `Salesforce CPQ Assessment - ${orgAlias}`,
            subtitle: 'Comprehensive Analysis & Recommendations',
            author: 'RevPal CPQ Assessor',
            version: '1.0.0',
            date: new Date().toISOString().split('T')[0],
            orgAlias: orgAlias
        }
    });

    console.log(`✅ PDF generated: ${pdfPath}`);
    return pdfPath;
}
```

**Why This Works**: Professional branded PDF with metadata, ready for client delivery

---

### Example 2: Multi-Document PDF Compilation

**Scenario**: Agent generating comprehensive report with multiple sections

```javascript
async function generateRevOpsAudit(orgAlias) {
    const outputDir = `./reports/${orgAlias}-revops-audit`;

    // 1. Generate individual markdown sections
    await generateExecutiveSummary(`${outputDir}/1-executive-summary.md`);
    await generateDataQualityAnalysis(`${outputDir}/2-data-quality.md`);
    await generateProcessAnalysis(`${outputDir}/3-process-analysis.md`);
    await generateRecommendations(`${outputDir}/4-recommendations.md`);

    // 2. Compile into single professional PDF
    const pdfPath = await PDFGenerationHelper.generateMultiReportPDF({
        orgAlias,
        outputDir,
        documents: [
            { path: '1-executive-summary.md', title: 'Executive Summary', order: 0 },
            { path: '2-data-quality.md', title: 'Data Quality Analysis', order: 1 },
            { path: '3-process-analysis.md', title: 'Process Analysis', order: 2 },
            { path: '4-recommendations.md', title: 'Recommendations', order: 3 }
        ],
        coverTemplate: 'executive-report',
        metadata: {
            title: `RevOps Audit - ${orgAlias}`,
            version: '1.0.0',
            orgAlias
        }
    });

    console.log(`✅ Compiled PDF: ${pdfPath}`);
    return pdfPath;
}
```

**Why This Works**: Single cohesive PDF from multiple markdown files, automatically generates table of contents

---

## Validation Tool Examples

### Example 3: Pre-Deployment Validation

**Scenario**: Deployment agent validating before `sf project deploy`

```javascript
const DeploymentSourceValidator = require('../scripts/lib/deployment-source-validator');

async function deployMetadata(sourcePath, orgAlias) {
    const validator = new DeploymentSourceValidator();

    // 1. Validate source directory exists and has content
    console.log('Validating deployment sources...');
    try {
        const sourceValidation = await validator.validateSourceDir(sourcePath);
        if (!sourceValidation.valid) {
            console.error('❌ Source validation failed:');
            sourceValidation.errors.forEach(err => console.error(`  - ${err}`));
            throw new Error('Invalid deployment source');
        }
        console.log('✅ Source directory validated');
    } catch (error) {
        throw new DataAccessError(
            'Deployment_Validation',
            'Deployment source validation failed',
            {
                sourcePath,
                error: error.message,
                workaround: 'Check that force-app/main/default/ structure exists'
            }
        );
    }

    // 2. Proceed with deployment
    console.log('Deploying to org...');
    const deployResult = await runDeployment(sourcePath, orgAlias);

    return deployResult;
}
```

**Why This Works**: Catches ComponentSetError before execution, provides clear guidance

---

### Example 4: Bulk Operation Pre-Flight Check

**Scenario**: Data operation agent validating before bulk DML

```javascript
const BulkOperationValidator = require('../scripts/lib/bulk-operation-validator');

async function bulkInsertAccounts(accountData, orgAlias) {
    const validator = new BulkOperationValidator();

    // 1. Validate bulk operation feasibility
    const validation = await validator.validateBulkInsert({
        objectType: 'Account',
        records: accountData,
        orgAlias: orgAlias
    });

    if (!validation.valid) {
        console.error('❌ Bulk operation validation failed:');
        validation.errors.forEach(err => console.error(`  - ${err}`));

        // Provide alternatives
        if (validation.recordCount > 10000) {
            console.log('💡 Recommendation: Use Imports API for >10k records');
            console.log('   Script: async-bulk-ops.js');
        }

        throw new DataAccessError(
            'Bulk_Operation_Validation',
            'Bulk insert would fail',
            {
                recordCount: accountData.length,
                errors: validation.errors,
                recommendation: validation.recommendation
            }
        );
    }

    console.log(`✅ Validation passed - proceeding with ${accountData.length} records`);

    // 2. Execute bulk insert
    return await executeBulkInsert('Account', accountData, orgAlias);
}
```

**Why This Works**: Prevents governor limit errors, provides alternative approaches

---

## High-ROI Tracker Examples

### Example 5: Business Process Coverage Tracking

**Scenario**: QA agent tracking test coverage by business process

```javascript
const { BusinessProcessCoverageTracker } = require('../../../opspal-core/scripts/lib/business-process-coverage-tracker');

async function trackTestCoverage(orgAlias) {
    const tracker = new BusinessProcessCoverageTracker({
        dbPath: `./coverage/${orgAlias}-coverage.db`
    });

    await tracker.initialize();

    // 1. Record test coverage for Lead-to-Cash
    await tracker.recordCoverage(
        'Lead-to-Cash',
        'Lead Creation',
        'automated',
        'passed',
        { testName: 'test_lead_creation.apex', duration: 1.2 }
    );

    await tracker.recordCoverage(
        'Lead-to-Cash',
        'Lead Qualification',
        'manual',
        'passed',
        { tester: 'QA Team', date: '2025-10-26' }
    );

    await tracker.recordCoverage(
        'Lead-to-Cash',
        'Opportunity Conversion',
        'automated',
        'failed',
        { testName: 'test_opp_conversion.apex', failureReason: 'Field validation error' }
    );

    // 2. Generate heatmap
    const heatmap = await tracker.generateHeatmap('Lead-to-Cash');
    console.log(`Lead-to-Cash Coverage: ${heatmap.coveragePercentage}%`);
    console.log('Untested scenarios:', heatmap.untestedScenarios);

    // 3. Identify gaps
    const gaps = await tracker.getUncoveredProcesses();
    if (gaps.length > 0) {
        console.log('⚠️  Business processes with no test coverage:');
        gaps.forEach(gap => console.log(`  - ${gap}`));
    }

    await tracker.close();
    return heatmap;
}
```

**Why This Works**: Clear visibility into test gaps, prioritize QA efforts by business impact

---

### Example 6: User Expectation Tracking

**Scenario**: Assessment agent tracking user expectations vs reality

```javascript
const { UserExpectationTracker } = require('../../../opspal-core/scripts/lib/user-expectation-tracker');

async function trackExpectationGaps(orgAlias) {
    const tracker = new UserExpectationTracker({
        dbPath: `./expectations/${orgAlias}-expectations.db`
    });

    await tracker.initialize();

    // 1. Record user expectations from interviews
    await tracker.recordExpectation({
        feature: 'Quote Generation',
        userExpectation: 'Instant quote creation (<5 seconds)',
        actualOutcome: '30-second delay due to pricing calculations',
        satisfactionScore: 3,
        impactLevel: 'high',
        userRole: 'Sales Rep',
        frequency: 'daily'
    });

    await tracker.recordExpectation({
        feature: 'Opportunity Reporting',
        userExpectation: 'Real-time dashboard updates',
        actualOutcome: '15-minute refresh delay',
        satisfactionScore: 4,
        impactLevel: 'medium',
        userRole: 'Sales Manager',
        frequency: 'hourly'
    });

    // 2. Get top gaps to prioritize fixes
    const topGaps = await tracker.getTopGaps();
    console.log('Top 5 Expectation Gaps:');
    topGaps.forEach((gap, idx) => {
        console.log(`${idx + 1}. ${gap.feature} (Impact: ${gap.impactLevel}, Frequency: ${gap.frequency})`);
        console.log(`   Expected: ${gap.userExpectation}`);
        console.log(`   Actual: ${gap.actualOutcome}`);
        console.log(`   Satisfaction: ${gap.satisfactionScore}/10`);
    });

    // 3. Generate report
    const report = await tracker.generateReport();
    console.log(`\nOverall Satisfaction: ${report.averageSatisfaction}/10`);
    console.log(`High-Impact Gaps: ${report.highImpactGaps}`);

    await tracker.close();
    return topGaps;
}
```

**Why This Works**: Data-driven prioritization of fixes based on actual user pain

---

## Playbook Integration Examples

### Example 7: Using Picklist Dependency Playbook

**Scenario**: Field management agent creating picklist dependencies

```javascript
// Reference: @import agents/shared/playbook-reference.yaml -> PICKLIST_DEPENDENCY_PLAYBOOK

async function createIndustryAccountTypeeDependency(orgAlias) {
    const { PicklistDependencyManager } = require('../scripts/lib/picklist-dependency-manager');

    console.log('📖 Following PICKLIST_DEPENDENCY_PLAYBOOK workflow...');

    // Step 1: Analyze existing picklists (from playbook)
    console.log('Step 1: Analyzing existing picklists...');
    const industryField = await analyzeField(orgAlias, 'Account', 'Industry');
    const accountTypeField = await analyzeField(orgAlias, 'Account', 'Type');

    // Step 2: Design dependency matrix (from playbook best practices)
    console.log('Step 2: Designing dependency matrix...');
    const dependencyMatrix = {
        'Technology': ['SaaS', 'Hardware', 'Software', 'Consulting'],
        'Finance': ['Banking', 'Insurance', 'Investment', 'Fintech'],
        'Healthcare': ['Provider', 'Payer', 'Pharma', 'Medical Devices']
    };

    // Step 3: Create dependency (following playbook workflow)
    console.log('Step 3: Creating picklist dependency...');
    const manager = new PicklistDependencyManager({ org: orgAlias });

    const result = await manager.createDependency({
        objectName: 'Account',
        controllingField: 'Industry',
        dependentField: 'Type',
        dependencyMatrix: dependencyMatrix,
        validateBeforeCreate: true // Playbook best practice
    });

    console.log('✅ Dependency created successfully');
    console.log('   Controlling Field: Industry');
    console.log('   Dependent Field: Type');
    console.log(`   Matrix Entries: ${Object.keys(dependencyMatrix).length}`);

    return result;
}
```

**Why This Works**: Follows proven playbook workflow, includes validation

---

### Example 8: Using Quality Gate Framework

**Scenario**: Assessment agent validating deliverables before marking complete

```javascript
const QualityGateValidator = require('../../../opspal-core/scripts/lib/quality-gate-validator');

async function completeAutomationAudit(orgAlias, reportPath) {
    const validator = new QualityGateValidator();

    // 1. Define what "complete" means for this task
    const taskContext = {
        type: 'assessment',
        description: 'Complete automation audit with recommendations',
        requiredDeliverables: ['report', 'findings', 'recommendations']
    };

    // 2. Define actual deliverable
    const deliverable = {
        filePath: reportPath,
        status: 'success',
        verified: true
    };

    // 3. Validate against quality gates
    console.log('Running quality gate validation...');
    const result = await validator.validate(taskContext, deliverable);

    if (!result.passed) {
        console.error('❌ Quality gate failed - task incomplete:');
        result.failedChecks.forEach(check => {
            console.error(`  - ${check.name}: ${check.reason}`);
        });

        // Show recommendations
        console.log('\n💡 Recommendations:');
        result.recommendations.forEach(rec => console.log(`  - ${rec}`));

        // Block success message
        throw new Error('Quality gates not met - deliverable incomplete');
    }

    console.log('✅ Quality gates passed - deliverable complete');
    console.log(`   Score: ${result.score}/100`);

    return true;
}
```

**Why This Works**: Prevents premature success claims, ensures complete deliverables

---

## Asana Integration Examples

### Example 9: Reading Assigned Tasks

**Scenario**: Agent starting work on Asana-tracked task

```javascript
const { asanaTaskReader } = require('../../../opspal-core/scripts/lib/asana-task-reader');

async function startAsanaTask(taskId) {
    // 1. Read and parse task
    console.log('📖 Reading Asana task context...');
    const taskContext = await asanaTaskReader.parseTask(taskId, {
        includeComments: true,
        includeProject: true,
        includeDependencies: true
    });

    console.log(`Task: ${taskContext.name}`);
    console.log(`Status: ${taskContext.status}`);
    console.log(`Assignee: ${taskContext.assignee}`);
    console.log(`Due: ${taskContext.dueDate}`);
    console.log(`Priority: ${taskContext.priority}`);

    // 2. Check for blockers
    if (taskContext.dependencies.blocking.length > 0) {
        console.log('⚠️  This task is blocked by:');
        taskContext.dependencies.blocking.forEach(dep => {
            console.log(`  - ${dep.name} (${dep.status})`);
        });
        return { blocked: true, blockers: taskContext.dependencies.blocking };
    }

    // 3. Understand requirements from description
    console.log('\nRequirements:');
    console.log(taskContext.description);

    // 4. Review recent comments for context
    if (taskContext.comments.length > 0) {
        console.log('\nRecent Updates:');
        taskContext.comments.slice(-3).forEach(comment => {
            console.log(`  [${comment.createdAt}] ${comment.author}: ${comment.text}`);
        });
    }

    return taskContext;
}
```

**Why This Works**: Full context before starting work, identifies blockers early

---

### Example 10: Posting Progress Updates

**Scenario**: Long-running agent posting checkpoint update

```javascript
const formatter = require('../../../opspal-core/scripts/lib/asana-update-formatter');
const commentMgr = require('../../../opspal-core/scripts/lib/asana-comment-manager');

async function postProgressCheckpoint(taskId, progress) {
    // 1. Format update with brevity validation
    const update = formatter.formatProgressUpdate({
        taskName: 'Salesforce CPQ Assessment',
        completed: [
            'Product rules analyzed (142 rules)',
            'Pricing waterfall validated',
            'Quote generation tested (15 scenarios)'
        ],
        inProgress: [
            'Document analysis phase (50% complete, 2 hours remaining)'
        ],
        next: [
            'Complete documentation',
            'Generate executive summary PDF'
        ],
        status: 'On Track'
    });

    // 2. Validate word count (should be < 100 words)
    const wordCount = update.split(/\s+/).length;
    if (wordCount > 100) {
        console.warn(`⚠️  Update too long (${wordCount} words > 100 limit)`);
    }

    // 3. Post to Asana
    await commentMgr.postProgress(taskId, {
        text: update,
        isPinned: false
    });

    console.log('✅ Progress update posted to Asana');
    console.log(`   Word count: ${wordCount}`);
}
```

**Why This Works**: Structured, brief updates that are easy to scan

---

## Complete Workflow Examples

### Example 11: End-to-End Assessment Workflow

**Scenario**: CPQ assessment agent using multiple wired tools

```javascript
async function completeCPQAssessment(orgAlias, asanaTaskId) {
    console.log('🚀 Starting CPQ Assessment Workflow...\n');

    // STEP 1: Read Asana task for context
    console.log('1️⃣  Reading Asana task...');
    const taskContext = await asanaTaskReader.parseTask(asanaTaskId, {
        includeComments: true,
        includeProject: true
    });
    console.log(`   Task: ${taskContext.name}`);

    // STEP 2: Validate org context
    console.log('\n2️⃣  Validating org context...');
    const orgValidator = require('../scripts/lib/org-context-validator');
    await orgValidator.validateContext({
        orgAlias,
        requiredObjects: ['SBQQ__Quote__c', 'SBQQ__QuoteLine__c', 'SBQQ__ProductRule__c'],
        requiredFeatures: ['CPQ']
    });
    console.log('   ✅ CPQ objects and features validated');

    // STEP 3: Run assessment with progress updates
    console.log('\n3️⃣  Running CPQ assessment...');

    // 3a. Analyze product rules
    await postProgressCheckpoint(asanaTaskId, {
        completed: [],
        inProgress: ['Analyzing product rules'],
        status: 'On Track'
    });
    const productRules = await analyzeProductRules(orgAlias);

    // 3b. Validate pricing
    await postProgressCheckpoint(asanaTaskId, {
        completed: [`Product rules analyzed (${productRules.count} rules)`],
        inProgress: ['Validating pricing waterfall'],
        status: 'On Track'
    });
    const pricingAnalysis = await analyzePricing(orgAlias);

    // 3c. Test quote generation
    await postProgressCheckpoint(asanaTaskId, {
        completed: [
            `Product rules analyzed (${productRules.count} rules)`,
            'Pricing waterfall validated'
        ],
        inProgress: ['Testing quote generation'],
        status: 'On Track'
    });
    const quoteTests = await testQuoteGeneration(orgAlias);

    // STEP 4: Track user expectations vs reality
    console.log('\n4️⃣  Tracking user expectations...');
    const expectationTracker = new UserExpectationTracker({
        dbPath: `./expectations/${orgAlias}-expectations.db`
    });
    await expectationTracker.initialize();

    // Record expectation gaps found during assessment
    for (const gap of quoteTests.expectationGaps) {
        await expectationTracker.recordExpectation(gap);
    }

    const topGaps = await expectationTracker.getTopGaps();
    console.log(`   📊 Tracked ${topGaps.length} expectation gaps`);
    await expectationTracker.close();

    // STEP 5: Generate deliverables
    console.log('\n5️⃣  Generating deliverables...');
    const reportPath = `./reports/${orgAlias}-cpq-assessment.md`;
    await generateMarkdownReport(reportPath, {
        productRules,
        pricingAnalysis,
        quoteTests,
        expectationGaps: topGaps
    });

    // Generate PDF
    const pdfPath = await PDFGenerationHelper.generateSingleReportPDF({
        markdownPath: reportPath,
        outputDir: './reports',
        coverTemplate: 'salesforce-audit',
        metadata: {
            title: `CPQ Assessment - ${orgAlias}`,
            version: '1.0.0',
            orgAlias
        }
    });
    console.log(`   ✅ PDF generated: ${pdfPath}`);

    // STEP 6: Validate deliverable with quality gates
    console.log('\n6️⃣  Validating deliverable quality...');
    const qualityValidator = new QualityGateValidator();
    const validation = await qualityValidator.validate(
        { type: 'assessment', description: 'CPQ Assessment' },
        { filePath: pdfPath, status: 'success', verified: true }
    );

    if (!validation.passed) {
        // Post blocker to Asana
        const blockerUpdate = formatter.formatBlockerUpdate({
            issue: 'Quality gate validation failed',
            impact: 'Cannot mark assessment complete',
            needs: 'Address quality gate recommendations',
            timeline: 'Within 2 hours'
        });
        await commentMgr.postBlocker(asanaTaskId, { text: blockerUpdate });

        throw new Error('Quality gates not met');
    }
    console.log(`   ✅ Quality validation passed (${validation.score}/100)`);

    // STEP 7: Post completion update to Asana
    console.log('\n7️⃣  Posting completion update...');
    const completionUpdate = formatter.formatCompletionUpdate({
        taskName: 'CPQ Assessment',
        summary: `Analyzed ${productRules.count} product rules, validated pricing, tested quote generation`,
        metrics: {
            'Product Rules': productRules.count,
            'Pricing Issues': pricingAnalysis.issues.length,
            'Test Scenarios': quoteTests.scenarios.length,
            'Expectation Gaps': topGaps.length
        },
        deliverables: [pdfPath],
        nextSteps: ['Review findings with stakeholders', 'Prioritize fixes by ROI']
    });

    await commentMgr.postCompletion(asanaTaskId, {
        text: completionUpdate,
        isPinned: true
    });

    console.log('\n✅ CPQ Assessment Complete!');
    console.log(`   Report: ${pdfPath}`);
    console.log(`   Quality Score: ${validation.score}/100`);
    console.log(`   Asana Updated: Yes`);

    return {
        pdfPath,
        qualityScore: validation.score,
        expectationGaps: topGaps
    };
}
```

**Why This Works**:
- Complete workflow using 8+ wired tools
- Clear progress communication
- Quality validation before completion
- Professional deliverable
- Stakeholder visibility via Asana

---

## Best Practices Summary

### 1. Always Fail Fast with DataAccessError
- ❌ Don't return empty arrays when data unavailable
- ✅ Throw structured errors with workarounds
- ✅ Provide tracking links for unimplemented features

### 2. Generate Professional PDFs
- ❌ Don't deliver markdown-only reports
- ✅ Use branded PDF covers
- ✅ Include metadata (org, version, date)

### 3. Validate Before Execute
- ❌ Don't assume org state or data validity
- ✅ Use pre-flight validation tools
- ✅ Provide clear error messages and alternatives

### 4. Track Metrics That Matter
- ❌ Don't rely on anecdotal evidence
- ✅ Track business process coverage
- ✅ Record user expectations vs reality

### 5. Communicate Progress
- ❌ Don't go dark during long operations
- ✅ Post checkpoints to Asana (< 100 words)
- ✅ Use structured update templates

### 6. Validate Deliverables
- ❌ Don't claim success prematurely
- ✅ Use quality gate validation
- ✅ Address all findings before marking complete

---

## Next Steps

1. **Try These Examples** - Copy and adapt for your agent's use case
2. **Follow the Patterns** - Consistent tool usage across all agents
3. **Reference Playbooks** - Detailed guides in `@import agents/shared/playbook-reference.yaml`
4. **Monitor Adoption** - Track which patterns work best
5. **Provide Feedback** - Submit improvements via reflection system

---

**Questions?** Reference the shared library files:
- Tools: `agents/shared/library-reference.yaml`
- Playbooks: `agents/shared/playbook-reference.yaml`
- Asana: `../opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`
