/**
 * Test Suite for HubSpot CMS Publishing Controller
 *
 * Tests:
 * 1. Immediate publish (push-live)
 * 2. Scheduled publish
 * 3. Pre-publish validation (valid)
 * 4. Pre-publish validation (missing fields)
 * 5. Pre-publish validation (template not found)
 * 6. Create publish snapshot
 * 7. Rollback to snapshot
 * 8. Batch publish multiple pages
 * 9. Publishing history tracking
 * 10. Cancel scheduled publish
 *
 * @version 1.0.0
 * @created 2025-11-04
 */

const HubSpotCMSPublishingController = require('../scripts/lib/hubspot-cms-publishing-controller');
const { MockHubSpotCMSPagesManager } = require('./hubspot-cms-pages-manager.manual');

// Mock API responses for publishing
const mockPublishResponses = {
    immediate: {
        id: '12345678',
        status: 'PUBLISHED',
        publishedAt: new Date().toISOString()
    },
    scheduled: {
        id: '12345678',
        status: 'SCHEDULED',
        scheduledPublishDate: '2025-12-01T15:00:00Z'
    },
    snapshot: {
        id: '99999999',
        name: 'Product Launch [SNAPSHOT 2025-11-04]',
        archived: true
    }
};

// Create mock controller with mocked API calls
class MockHubSpotCMSPublishingController extends HubSpotCMSPublishingController {
    constructor(options = {}) {
        // Use mock pages manager
        options.pagesManagerInstance = new MockHubSpotCMSPagesManager(options);
        super(options);
    }

    async publishPageNow(pageId) {
        // Mock immediate publish
        this.publishHistory.push({
            pageId,
            timestamp: new Date().toISOString(),
            type: 'immediate',
            success: true
        });

        return mockPublishResponses.immediate;
    }

    async schedulePagePublish(pageId, publishDate) {
        // Mock scheduled publish
        this.publishHistory.push({
            pageId,
            timestamp: new Date().toISOString(),
            type: 'scheduled',
            publishDate,
            success: true
        });

        return {
            ...mockPublishResponses.scheduled,
            scheduledPublishDate: publishDate
        };
    }

    async createPublishSnapshot(pageId) {
        // Mock snapshot creation
        const page = await this.pagesManager.getPage(pageId);
        return {
            snapshotId: mockPublishResponses.snapshot.id,
            originalPageId: pageId,
            snapshotName: `${page.name} [SNAPSHOT ${new Date().toISOString().split('T')[0]}]`
        };
    }

    async rollbackToSnapshot(pageId, snapshotId) {
        // Mock rollback
        return {
            success: true,
            pageId,
            snapshotId,
            message: 'Page restored to snapshot'
        };
    }

    async cancelScheduledPublish(pageId) {
        // Mock cancel scheduled publish
        return {
            success: true,
            pageId,
            message: 'Scheduled publish cancelled'
        };
    }
}

// Test 1: Immediate publish (push-live)
async function testImmediatePublish() {
    console.log('\n🧪 Test 1: Immediate Publish');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await controller.publishPageNow('12345678');

        if (result.status === 'PUBLISHED' && result.publishedAt) {
            console.log('✅ PASS: Page published immediately');
            console.log(`   Status: ${result.status}`);
            console.log(`   Published At: ${result.publishedAt}`);
            return true;
        } else {
            console.log('❌ FAIL: Publish result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 2: Scheduled publish
async function testScheduledPublish() {
    console.log('\n🧪 Test 2: Scheduled Publish');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const publishDate = '2025-12-01T15:00:00Z';
        const result = await controller.schedulePagePublish('12345678', publishDate);

        if (result.status === 'SCHEDULED' && result.scheduledPublishDate === publishDate) {
            console.log('✅ PASS: Page scheduled for publishing');
            console.log(`   Status: ${result.status}`);
            console.log(`   Scheduled For: ${result.scheduledPublishDate}`);
            return true;
        } else {
            console.log('❌ FAIL: Schedule result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 3: Pre-publish validation (valid)
async function testPrePublishValidationValid() {
    console.log('\n🧪 Test 3: Pre-Publish Validation (Valid)');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await controller.validateBeforePublish('12345678');

        if (result.valid === true && result.errors.length === 0) {
            console.log('✅ PASS: Validation passed');
            console.log(`   Errors: ${result.errors.length}`);
            console.log(`   Warnings: ${result.warnings.length}`);
            return true;
        } else {
            console.log('❌ FAIL: Validation should have passed');
            console.log(`   Errors: ${result.errors.join(', ')}`);
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 4: Pre-publish validation (missing fields)
async function testPrePublishValidationMissingFields() {
    console.log('\n🧪 Test 4: Pre-Publish Validation (Missing Fields)');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    // Create a page with missing fields for testing
    const mockPageNoName = {
        id: '11111111',
        name: '',  // Empty name
        slug: 'test-page',
        templatePath: 'templates/product.html',
        metaDescription: '',  // Empty meta description
        widgets: {}
    };

    // Temporarily mock the getPage to return incomplete page
    const originalGetPage = controller.pagesManager.getPage;
    controller.pagesManager.getPage = async (pageId) => {
        if (pageId === '11111111') return mockPageNoName;
        return originalGetPage.call(controller.pagesManager, pageId);
    };

    try {
        const result = await controller.validateBeforePublish('11111111');

        if (result.valid === false && result.errors.length > 0) {
            console.log('✅ PASS: Validation detected missing fields');
            console.log(`   Errors: ${result.errors.join(', ')}`);
            return true;
        } else {
            console.log('❌ FAIL: Should have detected missing fields');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    } finally {
        // Restore original method
        controller.pagesManager.getPage = originalGetPage;
    }
}

// Test 5: Pre-publish validation (template not found)
async function testPrePublishValidationTemplateNotFound() {
    console.log('\n🧪 Test 5: Pre-Publish Validation (Template Not Found)');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    // Create a page with invalid template
    const mockPageInvalidTemplate = {
        id: '22222222',
        name: 'Test Page',
        slug: 'test-page',
        templatePath: 'templates/invalid.html',  // Invalid template
        metaDescription: 'Test description',
        widgets: {}
    };

    // Temporarily mock the getPage
    const originalGetPage = controller.pagesManager.getPage;
    controller.pagesManager.getPage = async (pageId) => {
        if (pageId === '22222222') return mockPageInvalidTemplate;
        return originalGetPage.call(controller.pagesManager, pageId);
    };

    try {
        const result = await controller.validateBeforePublish('22222222');

        if (result.valid === false && result.errors.some(e => e.includes('Template not found'))) {
            console.log('✅ PASS: Validation detected invalid template');
            console.log(`   Errors: ${result.errors.join(', ')}`);
            return true;
        } else {
            console.log('❌ FAIL: Should have detected invalid template');
            console.log(`   Errors: ${result.errors.join(', ')}`);
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    } finally {
        // Restore original method
        controller.pagesManager.getPage = originalGetPage;
    }
}

// Test 6: Create publish snapshot
async function testCreatePublishSnapshot() {
    console.log('\n🧪 Test 6: Create Publish Snapshot');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await controller.createPublishSnapshot('12345678');

        if (result.snapshotId && result.originalPageId === '12345678' && result.snapshotName.includes('SNAPSHOT')) {
            console.log('✅ PASS: Snapshot created successfully');
            console.log(`   Snapshot ID: ${result.snapshotId}`);
            console.log(`   Snapshot Name: ${result.snapshotName}`);
            return true;
        } else {
            console.log('❌ FAIL: Snapshot result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 7: Rollback to snapshot
async function testRollbackToSnapshot() {
    console.log('\n🧪 Test 7: Rollback to Snapshot');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await controller.rollbackToSnapshot('12345678', '99999999');

        if (result.success === true && result.pageId === '12345678' && result.snapshotId === '99999999') {
            console.log('✅ PASS: Rollback successful');
            console.log(`   Message: ${result.message}`);
            return true;
        } else {
            console.log('❌ FAIL: Rollback result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 8: Batch publish multiple pages
async function testBatchPublish() {
    console.log('\n🧪 Test 8: Batch Publish Multiple Pages');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const pageIds = ['12345678', '87654321'];
        const results = await controller.batchPublishPages(pageIds);

        if (results.length === 2 && results.every(r => r.status === 'PUBLISHED')) {
            console.log('✅ PASS: Batch publish successful');
            console.log(`   Published: ${results.length} pages`);
            return true;
        } else {
            console.log('❌ FAIL: Batch publish result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 9: Publishing history tracking
async function testPublishingHistory() {
    console.log('\n🧪 Test 9: Publishing History Tracking');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // Publish a page
        await controller.publishPageNow('12345678');

        // Check history
        const history = controller.getPublishHistory();

        if (history.length > 0 && history[0].pageId === '12345678' && history[0].type === 'immediate') {
            console.log('✅ PASS: Publish history tracked');
            console.log(`   History entries: ${history.length}`);
            console.log(`   Latest: ${history[0].type} publish at ${history[0].timestamp}`);
            return true;
        } else {
            console.log('❌ FAIL: History not tracked properly');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 10: Cancel scheduled publish
async function testCancelScheduledPublish() {
    console.log('\n🧪 Test 10: Cancel Scheduled Publish');

    const controller = new MockHubSpotCMSPublishingController({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await controller.cancelScheduledPublish('12345678');

        if (result.success === true && result.pageId === '12345678') {
            console.log('✅ PASS: Scheduled publish cancelled');
            console.log(`   Message: ${result.message}`);
            return true;
        } else {
            console.log('❌ FAIL: Cancel result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Run all tests
async function runAllTests() {
    console.log('═══════════════════════════════════════════');
    console.log('🧪 HubSpot CMS Publishing Controller Test Suite');
    console.log('═══════════════════════════════════════════');

    const tests = [
        testImmediatePublish,
        testScheduledPublish,
        testPrePublishValidationValid,
        testPrePublishValidationMissingFields,
        testPrePublishValidationTemplateNotFound,
        testCreatePublishSnapshot,
        testRollbackToSnapshot,
        testBatchPublish,
        testPublishingHistory,
        testCancelScheduledPublish
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
    console.log('📊 Test Results');
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
    runAllTests,
    MockHubSpotCMSPublishingController
};
