/**
 * Integration Test Suite for HubSpot CMS Pages API
 *
 * Tests end-to-end workflows combining pages manager and publishing controller:
 * 1. Create page → Validate → Publish
 * 2. Create page → Create snapshot → Update → Rollback
 * 3. Batch create → Batch validate → Batch publish
 * 4. Template validation → Create with valid template
 * 5. Slug conflict detection → Create with unique slug
 *
 * @version 1.0.0
 * @created 2025-11-04
 */

const { MockHubSpotCMSPagesManager } = require('./hubspot-cms-pages-manager.manual');
const { MockHubSpotCMSPublishingController } = require('./hubspot-cms-publishing-controller.manual');

// Test 1: Create page → Validate → Publish
async function testCreateValidatePublishWorkflow() {
    console.log('\n🧪 Integration Test 1: Create → Validate → Publish');

    const pagesManager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // Step 1: Create page
        console.log('   Step 1: Creating page...');
        const newPage = await pagesManager.createPage({
            name: 'Integration Test Page',
            slug: 'integration-test-page',
            templatePath: 'templates/product.html',
            language: 'en',
            metaDescription: 'Integration test page'
        });

        console.log(`   ✓ Page created: ${newPage.id}`);

        // Step 2: Validate before publish
        console.log('   Step 2: Validating page...');

        // Mock the validation to use our created page
        const originalGetPage = controller.pagesManager.getPage;
        controller.pagesManager.getPage = async (pageId) => {
            if (pageId === newPage.id) return newPage;
            return originalGetPage.call(controller.pagesManager, pageId);
        };

        const validation = await controller.validateBeforePublish(newPage.id);
        console.log(`   ✓ Validation result: ${validation.valid ? 'PASSED' : 'FAILED'}`);

        if (!validation.valid) {
            console.log(`   Errors: ${validation.errors.join(', ')}`);
            return false;
        }

        // Step 3: Publish
        console.log('   Step 3: Publishing page...');
        const publishResult = await controller.publishPageNow(newPage.id);
        console.log(`   ✓ Published: ${publishResult.status}`);

        if (newPage.id && validation.valid && publishResult.status === 'PUBLISHED') {
            console.log('✅ PASS: Complete workflow succeeded');
            return true;
        } else {
            console.log('❌ FAIL: Workflow incomplete');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 2: Create page → Create snapshot → Update → Rollback
async function testCreateSnapshotUpdateRollbackWorkflow() {
    console.log('\n🧪 Integration Test 2: Create → Snapshot → Update → Rollback');

    const pagesManager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // Step 1: Create page
        console.log('   Step 1: Creating page...');
        const newPage = await pagesManager.createPage({
            name: 'Rollback Test Page',
            slug: 'rollback-test-page',
            templatePath: 'templates/product.html',
            language: 'en',
            metaDescription: 'Original description'
        });
        console.log(`   ✓ Page created: ${newPage.id}`);

        // Step 2: Create snapshot
        console.log('   Step 2: Creating snapshot...');

        // Mock getPage for controller
        const originalGetPage = controller.pagesManager.getPage;
        controller.pagesManager.getPage = async (pageId) => {
            if (pageId === newPage.id) return newPage;
            return originalGetPage.call(controller.pagesManager, pageId);
        };

        const snapshot = await controller.createPublishSnapshot(newPage.id);
        console.log(`   ✓ Snapshot created: ${snapshot.snapshotId}`);

        // Step 3: Update page
        console.log('   Step 3: Updating page...');
        const updatedPage = await pagesManager.updatePage(newPage.id, {
            metaDescription: 'UPDATED description'
        });
        console.log(`   ✓ Page updated: ${updatedPage.metaDescription}`);

        // Step 4: Rollback
        console.log('   Step 4: Rolling back to snapshot...');
        const rollbackResult = await controller.rollbackToSnapshot(newPage.id, snapshot.snapshotId);
        console.log(`   ✓ Rollback: ${rollbackResult.success ? 'SUCCESS' : 'FAILED'}`);

        if (snapshot.snapshotId && rollbackResult.success) {
            console.log('✅ PASS: Snapshot and rollback workflow succeeded');
            return true;
        } else {
            console.log('❌ FAIL: Workflow incomplete');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 3: Batch create → Batch validate → Batch publish
async function testBatchOperationsWorkflow() {
    console.log('\n🧪 Integration Test 3: Batch Create → Validate → Publish');

    const pagesManager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // Step 1: Batch create pages
        console.log('   Step 1: Batch creating 3 pages...');
        const pageData = [
            {
                name: 'Batch Test Page 1',
                slug: 'batch-test-1',
                templatePath: 'templates/product.html',
                language: 'en',
                metaDescription: 'Batch test 1'
            },
            {
                name: 'Batch Test Page 2',
                slug: 'batch-test-2',
                templatePath: 'templates/product.html',
                language: 'en',
                metaDescription: 'Batch test 2'
            },
            {
                name: 'Batch Test Page 3',
                slug: 'batch-test-3',
                templatePath: 'templates/product.html',
                language: 'en',
                metaDescription: 'Batch test 3'
            }
        ];

        const createdPages = [];
        for (const data of pageData) {
            const page = await pagesManager.createPage(data);
            createdPages.push(page);
        }
        console.log(`   ✓ Created ${createdPages.length} pages`);

        // Step 2: Validate all pages
        console.log('   Step 2: Validating all pages...');

        // Mock getPage for validation
        const originalGetPage = controller.pagesManager.getPage;
        controller.pagesManager.getPage = async (pageId) => {
            const found = createdPages.find(p => p.id === pageId);
            if (found) return found;
            return originalGetPage.call(controller.pagesManager, pageId);
        };

        let allValid = true;
        for (const page of createdPages) {
            const validation = await controller.validateBeforePublish(page.id);
            if (!validation.valid) {
                allValid = false;
                console.log(`   ✗ Page ${page.id} validation failed`);
            }
        }
        console.log(`   ✓ All pages validated: ${allValid ? 'PASSED' : 'FAILED'}`);

        // Step 3: Batch publish
        console.log('   Step 3: Batch publishing...');
        const pageIds = createdPages.map(p => p.id);
        const publishResults = await controller.batchPublishPages(pageIds);
        console.log(`   ✓ Published ${publishResults.length} pages`);

        if (createdPages.length === 3 && allValid && publishResults.length === 3) {
            console.log('✅ PASS: Batch operations workflow succeeded');
            return true;
        } else {
            console.log('❌ FAIL: Batch workflow incomplete');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 4: Template validation before page creation
async function testTemplateValidationWorkflow() {
    console.log('\n🧪 Integration Test 4: Template Validation → Create Page');

    const pagesManager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // Step 1: Validate template exists
        console.log('   Step 1: Validating template...');
        const templateValidation = await pagesManager.validateTemplate('templates/product.html');
        console.log(`   ✓ Template validation: ${templateValidation.exists ? 'EXISTS' : 'NOT FOUND'}`);

        if (!templateValidation.exists) {
            console.log('❌ FAIL: Template should exist');
            return false;
        }

        // Step 2: Create page with validated template
        console.log('   Step 2: Creating page with validated template...');
        const newPage = await pagesManager.createPage({
            name: 'Template Test Page',
            slug: 'template-test-page',
            templatePath: 'templates/product.html',
            language: 'en'
        });
        console.log(`   ✓ Page created: ${newPage.id}`);

        // Step 3: Verify template caching (second call should be cached)
        console.log('   Step 3: Verifying template caching...');
        const requestCount1 = pagesManager.mockRequestCount;
        await pagesManager.validateTemplate('templates/product.html');
        const requestCount2 = pagesManager.mockRequestCount;
        const cached = requestCount2 === requestCount1;
        console.log(`   ✓ Caching working: ${cached ? 'YES' : 'NO'}`);

        if (templateValidation.exists && newPage.id && cached) {
            console.log('✅ PASS: Template validation workflow succeeded');
            return true;
        } else {
            console.log('❌ FAIL: Workflow incomplete');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 5: Scheduled publish workflow
async function testScheduledPublishWorkflow() {
    console.log('\n🧪 Integration Test 5: Create → Schedule Publish → Cancel');

    const pagesManager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // Step 1: Create page
        console.log('   Step 1: Creating page...');
        const newPage = await pagesManager.createPage({
            name: 'Scheduled Publish Test',
            slug: 'scheduled-publish-test',
            templatePath: 'templates/product.html',
            language: 'en',
            metaDescription: 'Scheduled publish test'
        });
        console.log(`   ✓ Page created: ${newPage.id}`);

        // Step 2: Schedule publish for future date
        console.log('   Step 2: Scheduling publish...');
        const publishDate = '2025-12-01T15:00:00Z';
        const scheduleResult = await controller.schedulePagePublish(newPage.id, publishDate);
        console.log(`   ✓ Scheduled for: ${scheduleResult.scheduledPublishDate}`);

        // Step 3: Cancel scheduled publish
        console.log('   Step 3: Cancelling scheduled publish...');
        const cancelResult = await controller.cancelScheduledPublish(newPage.id);
        console.log(`   ✓ Cancelled: ${cancelResult.success ? 'YES' : 'NO'}`);

        if (scheduleResult.status === 'SCHEDULED' && cancelResult.success) {
            console.log('✅ PASS: Scheduled publish workflow succeeded');
            return true;
        } else {
            console.log('❌ FAIL: Workflow incomplete');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Run all integration tests
async function runAllTests() {
    console.log('═══════════════════════════════════════════');
    console.log('🧪 HubSpot CMS Pages API Integration Test Suite');
    console.log('═══════════════════════════════════════════');

    const tests = [
        testCreateValidatePublishWorkflow,
        testCreateSnapshotUpdateRollbackWorkflow,
        testBatchOperationsWorkflow,
        testTemplateValidationWorkflow,
        testScheduledPublishWorkflow
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            const result = await test();
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (err) {
            console.log(`\n❌ EXCEPTION: ${err.message}`);
            console.error(err.stack);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('📊 Integration Test Results');
    console.log('═══════════════════════════════════════════');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
}

// Run tests if executed directly
if (require.main === module) {
    runAllTests().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    runAllTests
};
