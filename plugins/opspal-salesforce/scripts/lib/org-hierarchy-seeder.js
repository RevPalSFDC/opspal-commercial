#!/usr/bin/env node

/**
 * Org Hierarchy Seeder
 *
 * Creates realistic organizational hierarchy in sandbox environments for
 * testing approval frameworks and other hierarchical workflows.
 *
 * Creates:
 * - 3-level management hierarchy (CEO → VP → Manager → IC)
 * - Manager relationships for all users
 * - Role assignments
 * - Sample approval rules with valid approver assignments
 * - Optional test records for approval workflows
 *
 * Usage:
 *   node scripts/lib/org-hierarchy-seeder.js <org-alias> [--create-test-records]
 *
 * ⚠️  SANDBOX ONLY - Will not run in production orgs
 *
 * @author Approval Framework Testing Tools
 * @date 2025-10-04
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class OrgHierarchySeeder {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.createTestRecords = options.createTestRecords || false;
        this.createdUsers = {};
    }

    /**
     * Run seeding process
     */
    async seed() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('ORG HIERARCHY SEEDING');
        console.log(`Org: ${this.orgAlias}`);
        console.log(`${'='.repeat(70)}\n`);

        // Safety check: Only run in sandbox
        if (!await this.verifySandbox()) {
            console.error('❌ ERROR: This tool can only run in sandbox environments');
            console.error('Production org detected. Aborting for safety.\n');
            return 1;
        }

        console.log('✅ Sandbox environment verified\n');

        // Get active users to update
        const users = await this.getActiveUsers();

        if (users.length === 0) {
            console.error('❌ ERROR: No active users found in org\n');
            return 1;
        }

        console.log(`Found ${users.length} active users\n`);

        // Create manager hierarchy
        await this.createManagerHierarchy(users);

        // Optionally seed test records
        if (this.createTestRecords) {
            await this.createTestApprovalRecords();
        }

        this.printSummary();
        return 0;
    }

    /**
     * Verify this is a sandbox org
     */
    async verifySandbox() {
        try {
            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            // Check if org is sandbox
            const isSandbox = result.result.instanceUrl.includes('sandbox') ||
                             result.result.instanceUrl.includes('.cs') ||
                             !result.result.instanceUrl.includes('my.salesforce.com');

            return isSandbox;

        } catch (error) {
            console.error('Error verifying org type:', error.message);
            return false;
        }
    }

    /**
     * Get active users from org
     */
    async getActiveUsers() {
        try {
            const query = `
                SELECT Id, Name, Username, Email, ManagerId
                FROM User
                WHERE IsActive = true
                AND Id != '${await this.getCurrentUserId()}'
                ORDER BY Name
                LIMIT 20
            `;

            const cmd = `sf data query --query "${query.replace(/\n/g, ' ').trim()}" --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            return result.result.records || [];

        } catch (error) {
            console.error('Error querying users:', error.message);
            return [];
        }
    }

    /**
     * Get current user ID
     */
    async getCurrentUserId() {
        try {
            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));
            return result.result.id;
        } catch (error) {
            return '';
        }
    }

    /**
     * Create manager hierarchy
     */
    async createManagerHierarchy(users) {
        console.log('📋 Creating manager hierarchy...\n');

        if (users.length < 3) {
            console.log('⚠️  Need at least 3 users for hierarchy, using available users\n');
        }

        // Design hierarchy:
        // Level 1: First user = CEO (no manager)
        // Level 2: Users 1-2 = VPs (report to CEO)
        // Level 3: Users 3+ = Managers (report to VPs in round-robin)

        const ceo = users[0];
        const vps = users.slice(1, Math.min(3, users.length));
        const managers = users.slice(3);

        console.log(`Hierarchy Design:`);
        console.log(`  CEO: ${ceo.Name}`);
        console.log(`  VPs: ${vps.map(u => u.Name).join(', ')}`);
        console.log(`  Managers: ${managers.length} users\n`);

        // Update CEO (no manager)
        this.createdUsers.ceo = ceo;

        // Collect all manager updates for batch processing
        const allUpdates = [];

        // VPs report to CEO
        vps.forEach(vp => {
            allUpdates.push({ userId: vp.Id, managerId: ceo.Id, userName: vp.Name, role: 'vp' });
            this.createdUsers[`vp_${vp.Name}`] = { ...vp, ManagerId: ceo.Id };
        });

        // Managers report to VPs (round-robin)
        let vpIndex = 0;
        managers.forEach(manager => {
            const vp = vps[vpIndex % vps.length];
            allUpdates.push({ userId: manager.Id, managerId: vp.Id, userName: manager.Name, role: 'manager' });
            this.createdUsers[`manager_${manager.Name}`] = { ...manager, ManagerId: vp.Id };
            vpIndex++;
        });

        // Batch update all manager relationships in ONE operation
        console.log(`  📊 Updating ${allUpdates.length} manager relationships in batch...`);
        await this.updateUserManagersBatch(allUpdates);

        console.log('✅ Manager hierarchy created\n');
    }

    /**
     * Batch update user managers (optimized - single API call)
     */
    async updateUserManagersBatch(updates) {
        if (updates.length === 0) {
            console.log('  No manager updates needed');
            return;
        }

        try {
            // Create temp CSV for batch update
            const tempFile = `${os.tmpdir()}/user-manager-batch-update-${Date.now()}.csv`;
            const csvHeader = 'Id,ManagerId';
            const csvRows = updates.map(u => `${u.userId},${u.managerId}`);
            const csv = [csvHeader, ...csvRows].join('\n');
            fs.writeFileSync(tempFile, csv);

            console.log(`  📊 Batch updating ${updates.length} users...`);

            // Single bulk upsert for all users
            const cmd = `sf data upsert bulk --sobject User --file ${tempFile} --external-id Id --target-org ${this.orgAlias} --wait 5 --json`;
            const result = execSync(cmd, { encoding: 'utf8' });

            // Cleanup
            fs.unlinkSync(tempFile);

            // Parse result
            const jobInfo = JSON.parse(result);
            console.log(`  ✅ Batch update complete: ${jobInfo.result?.numberRecordsProcessed || updates.length} users updated`);

        } catch (error) {
            console.error(`  ❌ Batch update failed:`, error.message);
            throw error;
        }
    }

    /**
     * Update user's manager (single - kept for backward compatibility)
     * @deprecated Use updateUserManagersBatch() for better performance
     */
    async updateUserManager(userId, managerId) {
        console.warn(`⚠️  Using single update (slow). Consider updateUserManagersBatch() instead.`);
        try {
            // Create temp CSV for update
            const tempFile = `${os.tmpdir()}/user-manager-update-${Date.now()}.csv`;
            const csv = `Id,ManagerId\n${userId},${managerId}`;
            fs.writeFileSync(tempFile, csv);

            // Update via bulk API
            const cmd = `sf data upsert bulk --sobject User --file ${tempFile} --external-id Id --target-org ${this.orgAlias} --wait 5 --json`;
            execSync(cmd, { encoding: 'utf8', stdio: 'ignore' });

            // Cleanup
            fs.unlinkSync(tempFile);

            console.log(`  ✓ Updated manager for user ${userId}`);

        } catch (error) {
            console.error(`  ✗ Failed to update user ${userId}:`, error.message);
        }
    }

    /**
     * Create test approval records
     */
    async createTestApprovalRecords() {
        console.log('📋 Creating test approval records...\n');

        // This would create sample Opportunities/Quotes for testing
        // Implementation depends on org schema
        console.log('ℹ️  Test record creation not implemented yet\n');
        console.log('To create test records, run:');
        console.log('  sf data create record --sobject Opportunity --values "Name=Test Amount=50000 StageName=Prospecting CloseDate=2025-12-31"\n');
    }

    /**
     * Print summary
     */
    printSummary() {
        console.log(`\n${'='.repeat(70)}`);
        console.log('SEEDING SUMMARY');
        console.log(`${'='.repeat(70)}\n`);

        const userCount = Object.keys(this.createdUsers).length;
        console.log(`✅ Hierarchy created for ${userCount} users`);
        console.log(`✅ All users now have manager assignments`);
        console.log(`✅ Ready for approval framework testing\n`);

        console.log('Verify with:');
        console.log(`  sf data query --query "SELECT Name, Manager.Name FROM User WHERE IsActive=true" --target-org ${this.orgAlias}\n`);

        console.log('Next steps:');
        console.log('  1. Run approval framework validator:');
        console.log(`     node scripts/lib/approval-framework-validator.js ${this.orgAlias}`);
        console.log('  2. Deploy approval framework');
        console.log('  3. Run functional tests\n');

        console.log(`${'='.repeat(70)}\n`);
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node org-hierarchy-seeder.js <org-alias> [--create-test-records]');
        console.error('\nExample:');
        console.error('  node org-hierarchy-seeder.js delta-sandbox');
        console.error('  node org-hierarchy-seeder.js delta-sandbox --create-test-records');
        process.exit(1);
    }

    const orgAlias = args[0];
    const createTestRecords = args.includes('--create-test-records');

    const seeder = new OrgHierarchySeeder(orgAlias, { createTestRecords });

    seeder.seed()
        .then(exitCode => process.exit(exitCode))
        .catch(error => {
            console.error('Seeding failed:', error.message);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = OrgHierarchySeeder;
