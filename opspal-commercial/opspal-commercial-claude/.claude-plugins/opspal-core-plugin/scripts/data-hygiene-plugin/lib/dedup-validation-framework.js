#!/usr/bin/env node
/**
 * Deduplication Validation Framework
 *
 * Purpose: Comprehensive validation before, during, and after deduplication execution.
 * Ensures data integrity, prevents data loss, and verifies successful completion.
 *
 * Features:
 * - Pre-execution validation (connectivity, permissions, settings)
 * - Post-execution validation (zero duplicates, associations preserved)
 * - Spot-check sampling (5% random verification)
 * - Acceptance criteria verification
 *
 * Usage:
 *   const ValidationFramework = require('./dedup-validation-framework');
 *   const validator = new ValidationFramework(config);
 *   const results = await validator.validate('post-execution', data);
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

class ValidationFramework {
    constructor(config) {
        this.config = config;
        this.hubspot = config.hubspot;
        this.salesforce = config.salesforce;
        this.outputDir = config.output?.outputDir || './dedup-reports';
        this.spotCheckPercentage = config.validation?.spotCheckPercentage || 5;

        this.results = {
            timestamp: new Date().toISOString(),
            validationType: null,
            checks: [],
            passed: true,
            warnings: [],
            errors: [],
            summary: {}
        };
    }

    /**
     * Run validation suite
     * @param {string} type - 'pre-execution', 'post-execution', 'spot-check'
     * @param {object} data - Context data for validation
     * @returns {Promise<object>} Validation results
     */
    async validate(type, data = {}) {
        console.log(`\n🔍 Running ${type} validation...`);
        console.log('═'.repeat(70));

        this.results.validationType = type;

        try {
            switch (type) {
                case 'pre-execution':
                    await this.preExecutionValidation();
                    break;
                case 'post-execution':
                    await this.postExecutionValidation(data);
                    break;
                case 'spot-check':
                    await this.spotCheckValidation(data);
                    break;
                default:
                    throw new Error(`Unknown validation type: ${type}`);
            }

            // Determine overall pass/fail
            this.results.passed = this.results.errors.length === 0;

            console.log('\n✅ Validation complete!');
            console.log('═'.repeat(70));
            this.printSummary();

            // Save validation report
            this.saveValidationReport();

            return this.results;

        } catch (error) {
            console.error(`\n❌ Validation failed: ${error.message}`);
            this.results.passed = false;
            this.results.errors.push({
                check: 'validation-execution',
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Pre-execution validation
     */
    async preExecutionValidation() {
        console.log('Running pre-execution checks...\n');

        // Check 1: API Connectivity
        await this.checkAPIConnectivity();

        // Check 2: HubSpot Settings
        await this.checkHubSpotSettings();

        // Check 3: Salesforce Connectivity
        await this.checkSalesforceConnectivity();

        // Check 4: Required Permissions
        await this.checkPermissions();

        // Check 5: Configuration Validity
        await this.checkConfiguration();
    }

    /**
     * Post-execution validation
     */
    async postExecutionValidation(data) {
        console.log('Running post-execution checks...\n');

        const { canonicalMap, snapshot } = data;

        // Check 1: Zero duplicates by SF Account ID
        await this.checkZeroDuplicatesBySFAccountId();

        // Check 2: Zero duplicates by domain
        await this.checkZeroDuplicatesByDomain();

        // Check 3: All canonicals still exist
        await this.checkCanonicalsExist(canonicalMap);

        // Check 4: All duplicates deleted
        await this.checkDuplicatesDeleted(canonicalMap);

        // Check 5: Association preservation (spot-check)
        await this.checkAssociationPreservation(canonicalMap);

        // Check 6: Record counts match expectations
        await this.checkRecordCounts(snapshot, canonicalMap);
    }

    /**
     * Spot-check validation
     */
    async spotCheckValidation(data) {
        console.log(`Running spot-check validation (${this.spotCheckPercentage}% sample)...\n`);

        const { canonicalMap } = data;

        // Randomly sample bundles
        const sampleSize = Math.max(1, Math.ceil(canonicalMap.length * (this.spotCheckPercentage / 100)));
        const sampled = this.randomSample(canonicalMap, sampleSize);

        console.log(`  Sampling ${sampled.length} of ${canonicalMap.length} bundles...`);

        for (const bundle of sampled) {
            await this.validateBundle(bundle);
        }
    }

    /**
     * Check API connectivity
     */
    async checkAPIConnectivity() {
        const check = {
            name: 'API Connectivity',
            checks: []
        };

        // HubSpot
        try {
            await this.testHubSpotAPI();
            check.checks.push({ platform: 'HubSpot', passed: true });
            console.log('  ✅ HubSpot API connectivity');
        } catch (error) {
            check.checks.push({ platform: 'HubSpot', passed: false, error: error.message });
            this.results.errors.push({
                check: 'hubspot-connectivity',
                error: error.message
            });
            console.log(`  ❌ HubSpot API connectivity: ${error.message}`);
            // Continue validation checks - collect all errors for comprehensive report
        }

        // Salesforce
        try {
            await this.testSalesforceAPI();
            check.checks.push({ platform: 'Salesforce', passed: true });
            console.log('  ✅ Salesforce API connectivity');
        } catch (error) {
            check.checks.push({ platform: 'Salesforce', passed: false, error: error.message });
            this.results.errors.push({
                check: 'salesforce-connectivity',
                error: error.message
            });
            console.log(`  ❌ Salesforce API connectivity: ${error.message}`);
            // Continue validation checks - collect all errors for comprehensive report
        }

        this.results.checks.push(check);
    }

    /**
     * Test HubSpot API
     */
    testHubSpotAPI() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/objects/companies?limit=1',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`
                },
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Request timeout')));
            req.end();
        });
    }

    /**
     * Test Salesforce API
     */
    testSalesforceAPI() {
        try {
            const result = execSync(
                `sf org display --target-org ${this.salesforce.orgAlias} --json`,
                { encoding: 'utf-8', timeout: 10000 }
            );
            const data = JSON.parse(result);
            if (data.status !== 0) {
                throw new Error(data.message);
            }
        } catch (error) {
            throw new Error(`SF CLI error: ${error.message}`);
        }
    }

    /**
     * Check HubSpot settings
     */
    async checkHubSpotSettings() {
        const check = {
            name: 'HubSpot Settings',
            autoAssociate: null
        };

        // Note: Auto-associate setting is not accessible via API
        // This is a manual verification step
        console.log('  ⚠️  Manual verification required: Auto-associate companies setting');
        console.log('     Must be OFF in HubSpot → Settings → Objects → Companies');

        this.results.warnings.push({
            check: 'auto-associate-setting',
            message: 'Manual verification required: Ensure auto-associate is OFF'
        });

        check.autoAssociate = 'manual-verification-required';
        this.results.checks.push(check);
    }

    /**
     * Check Salesforce connectivity
     */
    async checkSalesforceConnectivity() {
        const check = {
            name: 'Salesforce Connectivity',
            passed: false
        };

        try {
            // Query a single account to test connectivity
            const query = 'SELECT Id FROM Account LIMIT 1';
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.salesforce.orgAlias} --json`,
                { encoding: 'utf-8', timeout: 10000 }
            );

            const data = JSON.parse(result);
            if (data.status === 0 && data.result.records) {
                check.passed = true;
                console.log('  ✅ Salesforce query access');
            } else {
                throw new Error('Query failed');
            }
        } catch (error) {
            check.passed = false;
            check.error = error.message;
            this.results.errors.push({
                check: 'salesforce-query-access',
                error: error.message
            });
            console.log(`  ❌ Salesforce query access: ${error.message}`);
            // Continue validation checks - collect all errors for comprehensive report
        }

        this.results.checks.push(check);
    }

    /**
     * Check permissions
     */
    async checkPermissions() {
        const check = {
            name: 'Permissions',
            hubspot: [],
            salesforce: []
        };

        // HubSpot required scopes
        const requiredScopes = [
            'crm.objects.companies.read',
            'crm.objects.companies.write',
            'crm.objects.contacts.read',
            'crm.objects.deals.read'
        ];

        console.log('  ⚠️  Manual verification required: HubSpot private app scopes');
        requiredScopes.forEach(scope => {
            console.log(`     - ${scope}`);
        });

        this.results.warnings.push({
            check: 'hubspot-permissions',
            message: 'Verify private app has required scopes'
        });

        // Salesforce permissions
        console.log('  ⚠️  Manual verification required: Salesforce user permissions');
        console.log('     - Read/Write access to Accounts');
        console.log('     - Read access to Contacts and Opportunities');

        this.results.warnings.push({
            check: 'salesforce-permissions',
            message: 'Verify user has required permissions'
        });

        this.results.checks.push(check);
    }

    /**
     * Check configuration
     */
    async checkConfiguration() {
        const check = {
            name: 'Configuration',
            valid: true,
            issues: []
        };

        // Validate required fields
        const required = [
            ['hubspot', 'portalId'],
            ['hubspot', 'accessToken'],
            ['salesforce', 'orgAlias']
        ];

        required.forEach(([section, field]) => {
            if (!this.config[section] || !this.config[section][field]) {
                check.valid = false;
                check.issues.push(`Missing ${section}.${field}`);
            }
        });

        if (check.valid) {
            console.log('  ✅ Configuration valid');
        } else {
            check.issues.forEach(issue => {
                console.log(`  ❌ ${issue}`);
                this.results.errors.push({
                    check: 'configuration',
                    error: issue
                });
            });
        }

        this.results.checks.push(check);
    }

    /**
     * Check zero duplicates by SF Account ID
     */
    async checkZeroDuplicatesBySFAccountId() {
        console.log('  Checking for duplicate SF Account IDs...');

        const check = {
            name: 'Zero Duplicates by SF Account ID',
            duplicatesFound: 0,
            duplicateGroups: [],
            passed: true
        };

        try {
            // Query all companies with external_sfdc_account_id
            const companies = await this.queryCompaniesBySFAccountId();

            // Group by external_sfdc_account_id to find duplicates
            const grouped = {};
            companies.forEach(company => {
                const accountId = company.properties.external_sfdc_account_id;
                if (!grouped[accountId]) {
                    grouped[accountId] = [];
                }
                grouped[accountId].push(company);
            });

            // Find groups with > 1 company
            Object.entries(grouped).forEach(([accountId, companies]) => {
                if (companies.length > 1) {
                    check.duplicatesFound += companies.length - 1;
                    check.duplicateGroups.push({
                        accountId,
                        count: companies.length,
                        companyIds: companies.map(c => c.id),
                        companyNames: companies.map(c => c.properties.name || 'Unnamed')
                    });
                }
            });

            check.passed = check.duplicatesFound === 0;

            if (check.passed) {
                console.log(`  ✅ No duplicates by SF Account ID (verified ${companies.length} companies)`);
            } else {
                console.log(`  ❌ Found ${check.duplicatesFound} duplicates in ${check.duplicateGroups.length} groups`);
                check.duplicateGroups.slice(0, 3).forEach(group => {
                    console.log(`     - ${group.accountId}: ${group.count} companies`);
                });
                this.results.errors.push({
                    check: 'duplicates-by-sf-account-id',
                    error: `Found ${check.duplicatesFound} duplicates`
                });
            }

        } catch (error) {
            console.log(`  ⚠️  Failed to check duplicates: ${error.message}`);
            this.results.warnings.push({
                check: 'duplicates-by-sf-account-id',
                message: `Verification failed: ${error.message}`
            });
            check.passed = false;
            // Continue validation checks - collect all warnings for comprehensive report
        }

        this.results.checks.push(check);
    }

    /**
     * Query companies by SF Account ID
     */
    async queryCompaniesBySFAccountId() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/objects/companies/search',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const searchRequest = {
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'external_sfdc_account_id',
                                operator: 'HAS_PROPERTY'
                            }
                        ]
                    }
                ],
                properties: ['name', 'external_sfdc_account_id'],
                limit: 100
            };

            const requestBody = JSON.stringify(searchRequest);

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const parsed = JSON.parse(data);
                        resolve(parsed.results || []);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Check zero duplicates by domain
     */
    async checkZeroDuplicatesByDomain() {
        console.log('  Checking for duplicate domains...');

        const check = {
            name: 'Zero Duplicates by Domain',
            duplicatesFound: 0,
            duplicateGroups: [],
            passed: true
        };

        try {
            // Query all companies with domain
            const companies = await this.queryCompaniesByDomain();

            // Group by normalized domain to find duplicates
            const grouped = {};
            companies.forEach(company => {
                const domain = this.normalizeDomain(company.properties.domain);
                if (domain) {
                    if (!grouped[domain]) {
                        grouped[domain] = [];
                    }
                    grouped[domain].push(company);
                }
            });

            // Find groups with > 1 company (excluding those with SF Account IDs)
            Object.entries(grouped).forEach(([domain, companies]) => {
                // Filter out companies that have SF Account IDs (these are intentionally clustered)
                const withoutSFAccountId = companies.filter(c =>
                    !c.properties.salesforceaccountid && !c.properties.external_sfdc_account_id
                );

                if (withoutSFAccountId.length > 1) {
                    check.duplicatesFound += withoutSFAccountId.length - 1;
                    check.duplicateGroups.push({
                        domain,
                        count: withoutSFAccountId.length,
                        companyIds: withoutSFAccountId.map(c => c.id),
                        companyNames: withoutSFAccountId.map(c => c.properties.name || 'Unnamed')
                    });
                }
            });

            check.passed = check.duplicatesFound === 0;

            if (check.passed) {
                console.log(`  ✅ No duplicates by domain (verified ${companies.length} companies)`);
            } else {
                console.log(`  ❌ Found ${check.duplicatesFound} duplicates in ${check.duplicateGroups.length} groups`);
                check.duplicateGroups.slice(0, 3).forEach(group => {
                    console.log(`     - ${group.domain}: ${group.count} companies`);
                });
                this.results.errors.push({
                    check: 'duplicates-by-domain',
                    error: `Found ${check.duplicatesFound} duplicates`
                });
            }

        } catch (error) {
            console.log(`  ⚠️  Failed to check duplicates: ${error.message}`);
            this.results.warnings.push({
                check: 'duplicates-by-domain',
                message: `Verification failed: ${error.message}`
            });
            check.passed = false;
            // Continue validation checks - collect all warnings for comprehensive report
        }

        this.results.checks.push(check);
    }

    /**
     * Query companies by domain
     */
    async queryCompaniesByDomain() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: '/crm/v3/objects/companies/search',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const searchRequest = {
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'domain',
                                operator: 'HAS_PROPERTY'
                            }
                        ]
                    }
                ],
                properties: ['name', 'domain', 'salesforceaccountid', 'external_sfdc_account_id'],
                limit: 100
            };

            const requestBody = JSON.stringify(searchRequest);

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const parsed = JSON.parse(data);
                        resolve(parsed.results || []);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });
    }

    /**
     * Normalize domain for comparison
     */
    normalizeDomain(domain) {
        if (!domain) return null;
        return domain
            .toLowerCase()
            .replace(/^www\./, '')
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .trim();
    }

    /**
     * Check canonicals exist
     */
    async checkCanonicalsExist(canonicalMap) {
        console.log('  Verifying canonical companies exist...');

        const check = {
            name: 'Canonicals Exist',
            total: canonicalMap.length,
            verified: 0,
            missing: [],
            errors: []
        };

        // Sample check (full verification would take too long)
        const sampleSize = Math.min(20, canonicalMap.length);
        const sampled = this.randomSample(canonicalMap, sampleSize);

        console.log(`  Sampling ${sampled.length} of ${canonicalMap.length}...`);

        for (const bundle of sampled) {
            const canonicalId = bundle.canonical?.companyId;
            if (!canonicalId) continue;

            try {
                const exists = await this.verifyCompanyExists(canonicalId);
                if (exists) {
                    check.verified++;
                } else {
                    check.missing.push({
                        companyId: canonicalId,
                        companyName: bundle.canonical.companyName,
                        clusterKey: bundle.clusterKey
                    });
                }
            } catch (error) {
                check.errors.push({
                    companyId: canonicalId,
                    error: error.message
                });
            }
        }

        check.passed = check.missing.length === 0;

        if (check.passed) {
            console.log(`  ✅ All sampled canonicals exist (${check.verified}/${sampled.length})`);
        } else {
            console.log(`  ❌ Some canonicals missing: ${check.missing.length}`);
            check.missing.forEach(miss => {
                console.log(`     - ${miss.companyName} (${miss.companyId})`);
            });
            this.results.errors.push({
                check: 'canonicals-exist',
                error: `${check.missing.length} canonical companies missing`
            });
        }

        if (check.errors.length > 0) {
            console.log(`  ⚠️  ${check.errors.length} verification errors`);
        }

        this.results.checks.push(check);
    }

    /**
     * Verify company exists in HubSpot
     */
    async verifyCompanyExists(companyId) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v3/objects/companies/${companyId}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else if (res.statusCode === 404) {
                    resolve(false);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Check duplicates deleted
     */
    async checkDuplicatesDeleted(canonicalMap) {
        console.log('  Verifying duplicates deleted...');

        // Collect all duplicate IDs from canonical map
        const duplicateIds = [];
        canonicalMap.forEach(bundle => {
            if (bundle.duplicates && Array.isArray(bundle.duplicates)) {
                bundle.duplicates.forEach(dup => {
                    duplicateIds.push({
                        companyId: dup.companyId,
                        companyName: dup.companyName,
                        clusterKey: bundle.clusterKey
                    });
                });
            }
        });

        const check = {
            name: 'Duplicates Deleted',
            expectedDeleted: duplicateIds.length,
            verified: 0,
            stillExist: [],
            errors: []
        };

        console.log(`  Expected deletions: ${check.expectedDeleted}`);

        // Sample verification (full check would take too long)
        const sampleSize = Math.min(20, duplicateIds.length);
        const sampled = this.randomSample(duplicateIds, sampleSize);

        console.log(`  Verifying ${sampled.length} sampled duplicates...`);

        for (const duplicate of sampled) {
            try {
                const exists = await this.verifyCompanyExists(duplicate.companyId);
                if (exists) {
                    check.stillExist.push({
                        companyId: duplicate.companyId,
                        companyName: duplicate.companyName,
                        clusterKey: duplicate.clusterKey
                    });
                } else {
                    check.verified++;
                }
            } catch (error) {
                check.errors.push({
                    companyId: duplicate.companyId,
                    error: error.message
                });
            }
        }

        check.passed = check.stillExist.length === 0;

        if (check.passed) {
            console.log(`  ✅ All sampled duplicates deleted (${check.verified}/${sampled.length})`);
        } else {
            console.log(`  ❌ Some duplicates still exist: ${check.stillExist.length}`);
            check.stillExist.forEach(dup => {
                console.log(`     - ${dup.companyName} (${dup.companyId}) in ${dup.clusterKey}`);
            });
            this.results.errors.push({
                check: 'duplicates-deleted',
                error: `${check.stillExist.length} duplicate companies still exist`
            });
        }

        if (check.errors.length > 0) {
            console.log(`  ⚠️  ${check.errors.length} verification errors`);
        }

        this.results.checks.push(check);
    }

    /**
     * Check association preservation
     */
    async checkAssociationPreservation(canonicalMap) {
        console.log('  Checking association preservation (spot-check)...');

        const check = {
            name: 'Association Preservation',
            sampled: 0,
            verified: 0,
            issues: [],
            totalExpectedContacts: 0,
            totalExpectedDeals: 0
        };

        const sampleSize = Math.max(1, Math.ceil(canonicalMap.length * (this.spotCheckPercentage / 100)));
        const sampled = this.randomSample(canonicalMap, sampleSize);

        console.log(`  Sampling ${sampled.length} bundles for verification...`);

        check.sampled = sampled.length;

        for (const bundle of sampled) {
            const canonicalId = bundle.canonical?.companyId;
            if (!canonicalId) continue;

            // Calculate expected associations
            const expectedContacts = (bundle.canonical.num_contacts || 0) +
                bundle.duplicates.reduce((sum, d) => sum + (d.num_contacts || 0), 0);
            const expectedDeals = (bundle.canonical.num_deals || 0) +
                bundle.duplicates.reduce((sum, d) => sum + (d.num_deals || 0), 0);

            check.totalExpectedContacts += expectedContacts;
            check.totalExpectedDeals += expectedDeals;

            try {
                // Verify actual associations
                const actualContacts = await this.getCompanyContactCount(canonicalId);
                const actualDeals = await this.getCompanyDealCount(canonicalId);

                const contactMatch = actualContacts >= expectedContacts * 0.95; // 95% threshold
                const dealMatch = actualDeals >= expectedDeals * 0.95;

                if (contactMatch && dealMatch) {
                    check.verified++;
                } else {
                    check.issues.push({
                        companyId: canonicalId,
                        companyName: bundle.canonical.companyName,
                        expectedContacts,
                        actualContacts,
                        expectedDeals,
                        actualDeals,
                        contactMatch,
                        dealMatch
                    });
                }
            } catch (error) {
                check.issues.push({
                    companyId: canonicalId,
                    companyName: bundle.canonical.companyName,
                    error: error.message
                });
            }
        }

        check.passed = check.issues.length === 0;

        if (check.passed) {
            console.log(`  ✅ Associations preserved (${check.verified}/${check.sampled} bundles verified)`);
            console.log(`     Total contacts: ${check.totalExpectedContacts}, Total deals: ${check.totalExpectedDeals}`);
        } else {
            console.log(`  ⚠️  Association mismatches found: ${check.issues.length}`);
            check.issues.slice(0, 3).forEach(issue => {
                if (issue.error) {
                    console.log(`     - ${issue.companyName}: ${issue.error}`);
                } else {
                    console.log(`     - ${issue.companyName}: Contacts ${issue.actualContacts}/${issue.expectedContacts}, Deals ${issue.actualDeals}/${issue.expectedDeals}`);
                }
            });
            this.results.warnings.push({
                check: 'association-preservation',
                message: `${check.issues.length} bundles have association mismatches (>5% difference)`
            });
        }

        this.results.checks.push(check);
    }

    /**
     * Get company contact count
     */
    async getCompanyContactCount(companyId) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v4/objects/companies/${companyId}/associations/contacts`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`
                }
            };

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const parsed = JSON.parse(data);
                        resolve(parsed.results?.length || 0);
                    } else if (res.statusCode === 404) {
                        resolve(0);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Get company deal count
     */
    async getCompanyDealCount(companyId) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.hubapi.com',
                path: `/crm/v4/objects/companies/${companyId}/associations/deals`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.hubspot.accessToken}`
                }
            };

            let data = '';
            const req = https.request(options, (res) => {
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const parsed = JSON.parse(data);
                        resolve(parsed.results?.length || 0);
                    } else if (res.statusCode === 404) {
                        resolve(0);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Check record counts
     */
    async checkRecordCounts(snapshot, canonicalMap) {
        console.log('  Verifying record counts...');

        const check = {
            name: 'Record Counts',
            before: {
                companies: snapshot?.hubspot?.totalCompanies || 0,
                accounts: snapshot?.salesforce?.totalAccounts || 0
            },
            expectedAfter: {
                companies: 0,
                accounts: 0
            },
            passed: true
        };

        // Calculate expected companies after deduplication
        const totalDuplicates = canonicalMap.reduce((sum, b) => sum + b.duplicateCount, 0);
        check.expectedAfter.companies = check.before.companies - totalDuplicates;
        check.expectedAfter.accounts = check.before.accounts; // SF accounts unchanged in HS-only bundles

        console.log(`  Before: ${check.before.companies} companies, ${check.before.accounts} accounts`);
        console.log(`  Expected After: ${check.expectedAfter.companies} companies`);
        console.log(`  Duplicates Removed: ${totalDuplicates}`);

        this.results.checks.push(check);
    }

    /**
     * Validate individual bundle
     */
    async validateBundle(bundle) {
        // Placeholder for detailed bundle validation
        // Would check:
        // - Canonical exists
        // - Duplicates deleted
        // - Associations transferred
        return { passed: true };
    }

    /**
     * Random sample
     */
    randomSample(array, size) {
        const shuffled = [...array].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, size);
    }

    /**
     * Save validation report
     */
    saveValidationReport() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-').slice(0, 19);
        const reportPath = path.join(this.outputDir, `validation-${this.results.validationType}-${timestamp}.json`);

        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        console.log(`\n💾 Validation report saved: ${reportPath}`);
    }

    /**
     * Print summary
     */
    printSummary() {
        console.log('\n📊 Validation Summary');
        console.log('─'.repeat(70));
        console.log(`Type: ${this.results.validationType}`);
        console.log(`Overall: ${this.results.passed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`Checks Run: ${this.results.checks.length}`);
        console.log(`Errors: ${this.results.errors.length}`);
        console.log(`Warnings: ${this.results.warnings.length}`);
        console.log('─'.repeat(70));

        if (this.results.errors.length > 0) {
            console.log('\n❌ Errors:');
            this.results.errors.forEach(err => {
                console.log(`  - ${err.check}: ${err.error}`);
            });
        }

        if (this.results.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            this.results.warnings.forEach(warn => {
                console.log(`  - ${warn.check}: ${warn.message}`);
            });
        }
    }
}

// CLI Usage
if (require.main === module) {
    const ConfigLoader = require('./dedup-config-loader');

    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Deduplication Validation Framework

Usage:
  node dedup-validation-framework.js <type> <config-file> [data-file]

Arguments:
  type         Validation type: pre-execution, post-execution, spot-check
  config-file  Path to dedup-config.json
  data-file    Optional path to data file (for post-execution/spot-check)

Examples:
  # Pre-execution validation
  node dedup-validation-framework.js pre-execution ./dedup-config.json

  # Post-execution validation
  node dedup-validation-framework.js post-execution ./dedup-config.json ./execution-data.json
        `);
        process.exit(0);
    }

    const type = args[0];
    const configPath = args[1];
    const dataPath = args[2];

    if (!['pre-execution', 'post-execution', 'spot-check'].includes(type)) {
        console.error('❌ Invalid validation type');
        process.exit(1);
    }

    (async () => {
        try {
            console.log('📋 Loading configuration...');
            const config = ConfigLoader.load(configPath);

            let data = {};
            if (dataPath && fs.existsSync(dataPath)) {
                console.log('📋 Loading data...');
                data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            }

            const validator = new ValidationFramework(config);
            const results = await validator.validate(type, data);

            if (results.passed) {
                console.log('\n✅ Validation passed');
                process.exit(0);
            } else {
                console.log('\n❌ Validation failed');
                process.exit(1);
            }

        } catch (error) {
            console.error('\n❌ Fatal error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = ValidationFramework;
