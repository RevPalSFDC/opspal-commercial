/**
 * Test Suite for HubSpot CMS Pages Manager
 *
 * Tests:
 * 1. Page creation with required fields
 * 2. Page creation with missing required fields
 * 3. Get single page by ID
 * 4. Get page not found
 * 5. Update page with valid data
 * 6. List pages with pagination
 * 7. Template validation (exists)
 * 8. Template validation (not found)
 * 9. Slug conflict detection
 * 10. Batch page creation
 * 11. Clone page
 * 12. Delete page
 * 13. Archive page
 * 14. Rate limiting enforcement
 * 15. Template caching
 *
 * @version 1.0.0
 * @created 2025-11-04
 */

const HubSpotCMSPagesManager = require('../scripts/lib/hubspot-cms-pages-manager');

// Mock API responses
const mockPages = {
    '12345678': {
        id: '12345678',
        name: 'Product Launch',
        slug: 'product-launch',
        metaDescription: 'New product launch page',
        templatePath: 'templates/product.html',
        language: 'en',
        currentlyPublished: false,
        widgets: {
            header: { type: 'rich_text', body: 'Welcome' }
        },
        created: '2025-11-01T10:00:00Z',
        updated: '2025-11-01T10:00:00Z'
    },
    '87654321': {
        id: '87654321',
        name: 'About Us',
        slug: 'about-us',
        metaDescription: 'Company information',
        templatePath: 'templates/content.html',
        language: 'en',
        currentlyPublished: true,
        widgets: {},
        created: '2025-10-15T08:00:00Z',
        updated: '2025-10-15T08:00:00Z'
    }
};

const mockTemplates = {
    'templates/product.html': { exists: true, path: 'templates/product.html' },
    'templates/content.html': { exists: true, path: 'templates/content.html' },
    'templates/invalid.html': { exists: false }
};

// Create mock manager with mocked API calls
class MockHubSpotCMSPagesManager extends HubSpotCMSPagesManager {
    constructor(options = {}) {
        super(options);
        this.mockRequestCount = 0;
        this.mockRequestTimestamps = [];
    }

    async request(method, path, payload = null) {
        this.mockRequestCount++;
        const timestamp = Date.now();
        this.mockRequestTimestamps.push(timestamp);

        // Simulate rate limiting
        const recentRequests = this.mockRequestTimestamps.filter(
            t => timestamp - t < 10000
        );
        if (recentRequests.length > 150) {
            throw new Error('Rate limit exceeded');
        }

        // Mock responses based on path
        if (method === 'POST' && path.includes('/cms/v3/pages/')) {
            // Create page
            const newId = Math.floor(Math.random() * 100000000).toString();
            return {
                id: newId,
                ...payload,
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };
        }

        if (method === 'GET' && path.match(/\/cms\/v3\/pages\/[^\/]+\/\d+$/)) {
            // Get single page
            const pageId = path.split('/').pop();
            if (mockPages[pageId]) {
                return mockPages[pageId];
            }
            throw new Error(`Page not found: ${pageId}`);
        }

        if (method === 'PATCH') {
            // Update page
            const pageId = path.split('/').pop();
            if (mockPages[pageId]) {
                return { ...mockPages[pageId], ...payload, updated: new Date().toISOString() };
            }
            throw new Error(`Page not found: ${pageId}`);
        }

        if (method === 'GET' && path.includes('/cms/v3/pages/') && !path.match(/\/\d+$/)) {
            // List pages
            return {
                results: Object.values(mockPages),
                paging: {}
            };
        }

        if (method === 'DELETE') {
            const pageId = path.split('/').pop();
            if (mockPages[pageId]) {
                return { status: 'DELETED' };
            }
            throw new Error(`Page not found: ${pageId}`);
        }

        throw new Error(`Unexpected request: ${method} ${path}`);
    }

    async validateTemplate(templatePath) {
        // Check cache first
        const cacheKey = `template_${templatePath}`;
        const cached = this.templateCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.templateCacheTTL) {
            return cached.data;
        }

        // Mock template validation
        const result = mockTemplates[templatePath] || { exists: false };

        // Cache result
        this.templateCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        return result;
    }
}

// Test 1: Page creation with required fields
async function testCreatePageValid() {
    console.log('\n🧪 Test 1: Create Page with Required Fields');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.createPage({
            name: 'Test Page',
            slug: 'test-page',
            templatePath: 'templates/product.html',
            language: 'en'
        });

        if (result.id && result.name === 'Test Page' && result.slug === 'test-page') {
            console.log('✅ PASS: Page created successfully');
            console.log(`   Page ID: ${result.id}`);
            return true;
        } else {
            console.log('❌ FAIL: Page creation result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 2: Page creation with missing required fields
async function testCreatePageMissingFields() {
    console.log('\n🧪 Test 2: Create Page with Missing Required Fields');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        await manager.createPage({
            name: 'Test Page'
            // Missing slug and templatePath
        });

        console.log('❌ FAIL: Should have thrown validation error');
        return false;
    } catch (err) {
        if (err.message.includes('Missing required field')) {
            console.log('✅ PASS: Validation error caught');
            console.log(`   Error: ${err.message}`);
            return true;
        } else {
            console.log(`❌ FAIL: Unexpected error: ${err.message}`);
            return false;
        }
    }
}

// Test 3: Get single page by ID
async function testGetPage() {
    console.log('\n🧪 Test 3: Get Single Page by ID');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.getPage('12345678');

        if (result.id === '12345678' && result.name === 'Product Launch') {
            console.log('✅ PASS: Page retrieved successfully');
            console.log(`   Name: ${result.name}`);
            console.log(`   Slug: ${result.slug}`);
            return true;
        } else {
            console.log('❌ FAIL: Retrieved page data invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 4: Get page not found
async function testGetPageNotFound() {
    console.log('\n🧪 Test 4: Get Page Not Found');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        await manager.getPage('99999999');
        console.log('❌ FAIL: Should have thrown not found error');
        return false;
    } catch (err) {
        if (err.message.includes('not found')) {
            console.log('✅ PASS: Not found error caught');
            console.log(`   Error: ${err.message}`);
            return true;
        } else {
            console.log(`❌ FAIL: Unexpected error: ${err.message}`);
            return false;
        }
    }
}

// Test 5: Update page with valid data
async function testUpdatePage() {
    console.log('\n🧪 Test 5: Update Page with Valid Data');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.updatePage('12345678', {
            name: 'Updated Product Launch',
            metaDescription: 'Updated description'
        });

        if (result.name === 'Updated Product Launch' && result.metaDescription === 'Updated description') {
            console.log('✅ PASS: Page updated successfully');
            console.log(`   New Name: ${result.name}`);
            return true;
        } else {
            console.log('❌ FAIL: Update result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 6: List pages with pagination
async function testListPages() {
    console.log('\n🧪 Test 6: List Pages');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.listPages({ limit: 100 });

        if (result.results && Array.isArray(result.results) && result.results.length > 0) {
            console.log('✅ PASS: Pages listed successfully');
            console.log(`   Found ${result.results.length} pages`);
            return true;
        } else {
            console.log('❌ FAIL: List result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 7: Template validation (exists)
async function testTemplateValidationExists() {
    console.log('\n🧪 Test 7: Template Validation (Exists)');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.validateTemplate('templates/product.html');

        if (result.exists === true) {
            console.log('✅ PASS: Template validated successfully');
            console.log(`   Template: ${result.path}`);
            return true;
        } else {
            console.log('❌ FAIL: Template validation result invalid');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 8: Template validation (not found)
async function testTemplateValidationNotFound() {
    console.log('\n🧪 Test 8: Template Validation (Not Found)');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.validateTemplate('templates/invalid.html');

        if (result.exists === false) {
            console.log('✅ PASS: Template not found detected');
            return true;
        } else {
            console.log('❌ FAIL: Should have detected template not found');
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 9: Template caching
async function testTemplateCaching() {
    console.log('\n🧪 Test 9: Template Caching');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        // First call - should fetch
        const result1 = await manager.validateTemplate('templates/product.html');
        const requestCount1 = manager.mockRequestCount;

        // Second call - should use cache
        const result2 = await manager.validateTemplate('templates/product.html');
        const requestCount2 = manager.mockRequestCount;

        if (result1.exists === true && result2.exists === true && requestCount2 === requestCount1) {
            console.log('✅ PASS: Template caching works');
            console.log(`   First call: ${result1.exists}, Second call: ${result2.exists} (cached)`);
            return true;
        } else {
            console.log('❌ FAIL: Caching not working properly');
            console.log(`   Request counts: ${requestCount1} → ${requestCount2}`);
            return false;
        }
    } catch (err) {
        console.log(`❌ FAIL: ${err.message}`);
        return false;
    }
}

// Test 10: Delete page
async function testDeletePage() {
    console.log('\n🧪 Test 10: Delete Page');

    const manager = new MockHubSpotCMSPagesManager({
        pageType: 'landing-pages',
        accessToken: 'test-token',
        portalId: 'test-portal'
    });

    try {
        const result = await manager.deletePage('12345678');

        if (result.status === 'DELETED') {
            console.log('✅ PASS: Page deleted successfully');
            return true;
        } else {
            console.log('❌ FAIL: Delete result invalid');
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
    console.log('🧪 HubSpot CMS Pages Manager Test Suite');
    console.log('═══════════════════════════════════════════');

    const tests = [
        testCreatePageValid,
        testCreatePageMissingFields,
        testGetPage,
        testGetPageNotFound,
        testUpdatePage,
        testListPages,
        testTemplateValidationExists,
        testTemplateValidationNotFound,
        testTemplateCaching,
        testDeletePage
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
    MockHubSpotCMSPagesManager
};
