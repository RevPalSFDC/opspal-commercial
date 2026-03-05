#!/usr/bin/env node

/**
 * User Provisioner Library
 * Instance-agnostic Salesforce user provisioning with role/profile management
 *
 * Features:
 * - Extract user names from CSV/data sources
 * - Generate standardized email addresses
 * - Query existing Salesforce users
 * - Create users with profiles and roles
 * - Update user roles and profiles
 * - Batch operations with verification
 * - Backup before changes
 *
 * Usage:
 *   const { UserProvisioner } = require('./scripts/lib/user-provisioner');
 *   const provisioner = new UserProvisioner({ orgAlias: 'myorg' });
 *
 *   // Find users that need creation
 *   const analysis = await provisioner.analyzeUsers(names, emailDomain);
 *
 *   // Create missing users
 *   await provisioner.createUsers(toCreate, { profile: 'Customer Advocate', role: 'Customer Advocacy' });
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class UserProvisioner {
    constructor(options = {}) {
        this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG;

        if (!this.orgAlias) {
            throw new Error('Org alias required - provide via options.orgAlias or SF_TARGET_ORG env var');
        }

        this.emailDomain = options.emailDomain || null;
        this.backupDir = options.backupDir || 'backups';
    }

    /**
     * Execute SOQL query against Salesforce
     * @param {string} soql - SOQL query
     * @returns {Array} - Query results
     */
    executeQuery(soql) {
        try {
            const result = execSync(
                `sf data query --query "${soql}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
            );

            const parsed = JSON.parse(result);

            if (parsed.status !== 0) {
                throw new Error(parsed.message || 'Query failed');
            }

            return parsed.result.records || [];
        } catch (err) {
            throw new Error(`Query execution failed: ${err.message}`);
        }
    }

    /**
     * Extract user names from various data formats
     * @param {Array|Object|string} data - Data containing user names
     * @param {string} fieldName - Field name containing names
     * @returns {Set} - Unique user names
     */
    extractNames(data, fieldName = 'name') {
        const names = new Set();

        if (Array.isArray(data)) {
            data.forEach(item => {
                if (typeof item === 'string') {
                    names.add(item.trim());
                } else if (typeof item === 'object' && item[fieldName]) {
                    names.add(item[fieldName].trim());
                }
            });
        } else if (typeof data === 'object') {
            if (data[fieldName]) {
                names.add(data[fieldName].trim());
            }
        }

        return names;
    }

    /**
     * Generate standardized email from name
     * @param {string} fullName - Full name (First Last)
     * @param {string} domain - Email domain
     * @returns {Object} - { email, firstName, lastName }
     */
    generateEmail(fullName, domain) {
        const parts = fullName.trim().split(/\s+/);

        if (parts.length < 2) {
            throw new Error(`Invalid name format: ${fullName} - expected "First Last"`);
        }

        const firstName = parts[0];
        const lastName = parts.slice(1).join(' '); // Handle middle names
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '.')}@${domain}`;

        return {
            firstName,
            lastName,
            email,
            fullName
        };
    }

    /**
     * Query existing Salesforce users by email
     * @param {Array<string>} emails - Email addresses to query
     * @returns {Array} - Existing user records
     */
    async queryExistingUsers(emails) {
        if (!emails || emails.length === 0) {
            return [];
        }

        // Build SOQL with email list
        const emailList = emails.map(e => `'${e}'`).join(',');
        const soql = `SELECT Id, FirstName, LastName, Email, Username, Profile.Name, UserRole.Name, IsActive FROM User WHERE Email IN (${emailList})`;

        return this.executeQuery(soql);
    }

    /**
     * Analyze which users exist and which need creation
     * @param {Array<string>} names - Full names
     * @param {string} emailDomain - Email domain
     * @returns {Object} - { existing, toCreate, userData }
     */
    async analyzeUsers(names, emailDomain) {
        const domain = emailDomain || this.emailDomain;

        if (!domain) {
            throw new Error('Email domain required - provide via parameter or constructor options');
        }

        // Generate email data for all names
        const userData = Array.from(names).map(name => this.generateEmail(name, domain));

        // Query existing users
        const emails = userData.map(u => u.email);
        const existingUsers = await this.queryExistingUsers(emails);

        // Create lookup map
        const existingMap = {};
        existingUsers.forEach(user => {
            existingMap[user.Email.toLowerCase()] = user;
        });

        // Categorize users
        const existing = [];
        const toCreate = [];

        userData.forEach(user => {
            const existingUser = existingMap[user.email.toLowerCase()];

            if (existingUser) {
                existing.push({
                    ...user,
                    sfUser: existingUser
                });
            } else {
                toCreate.push(user);
            }
        });

        return {
            existing,
            toCreate,
            userData,
            summary: {
                total: userData.length,
                existing: existing.length,
                toCreate: toCreate.length
            }
        };
    }

    /**
     * Query Profile ID by name
     * @param {string} profileName - Profile name
     * @returns {string} - Profile ID
     */
    getProfileId(profileName) {
        const soql = `SELECT Id, Name FROM Profile WHERE Name = '${profileName}' LIMIT 1`;
        const results = this.executeQuery(soql);

        if (results.length === 0) {
            throw new Error(`Profile not found: ${profileName}`);
        }

        return results[0].Id;
    }

    /**
     * Query UserRole ID by name
     * @param {string} roleName - Role name
     * @returns {string} - Role ID
     */
    getRoleId(roleName) {
        const soql = `SELECT Id, Name FROM UserRole WHERE Name = '${roleName}' LIMIT 1`;
        const results = this.executeQuery(soql);

        if (results.length === 0) {
            throw new Error(`Role not found: ${roleName}`);
        }

        return results[0].Id;
    }

    /**
     * Create backup of current user state
     * @param {Array<string>} userIds - User IDs to backup
     * @param {string} reason - Backup reason
     * @returns {string} - Backup file path
     */
    createBackup(userIds, reason) {
        if (!userIds || userIds.length === 0) {
            return null;
        }

        // Query current user state
        const idList = userIds.map(id => `'${id}'`).join(',');
        const soql = `SELECT Id, FirstName, LastName, Email, Username, ProfileId, Profile.Name, UserRoleId, UserRole.Name, IsActive FROM User WHERE Id IN (${idList})`;
        const users = this.executeQuery(soql);

        // Create backup object
        const backup = {
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            reason,
            userCount: users.length,
            users
        };

        // Ensure backup directory exists
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        // Write backup file
        const filename = `user-backup-${new Date().toISOString().replace(/:/g, '-')}.json`;
        const filepath = path.join(this.backupDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));

        return filepath;
    }

    /**
     * Create new Salesforce users
     * @param {Array<Object>} users - User data objects
     * @param {Object} config - User configuration
     * @returns {Object} - Creation results
     */
    async createUsers(users, config = {}) {
        if (!users || users.length === 0) {
            return {
                success: true,
                created: 0,
                users: []
            };
        }

        const {
            profile,
            role,
            alias = null,
            timeZone = 'America/Los_Angeles',
            locale = 'en_US',
            language = 'en_US',
            emailEncoding = 'UTF-8'
        } = config;

        if (!profile) {
            throw new Error('Profile name required in config.profile');
        }

        // Get Profile and Role IDs
        const profileId = this.getProfileId(profile);
        const roleId = role ? this.getRoleId(role) : null;

        console.log(`Creating ${users.length} users with profile: ${profile}${role ? `, role: ${role}` : ''}`);

        const results = [];

        for (const user of users) {
            try {
                // Generate username and alias
                const username = user.email; // Use email as username
                const userAlias = alias || user.firstName.substring(0, 4) + user.lastName.substring(0, 4);

                // Build user creation command
                const userConfig = {
                    FirstName: user.firstName,
                    LastName: user.lastName,
                    Email: user.email,
                    Username: username,
                    Alias: userAlias.substring(0, 8), // Max 8 chars
                    ProfileId: profileId,
                    TimeZoneSidKey: timeZone,
                    LocaleSidKey: locale,
                    LanguageLocaleKey: language,
                    EmailEncodingKey: emailEncoding
                };

                if (roleId) {
                    userConfig.UserRoleId = roleId;
                }

                // Write temp file for user data
                const tempFile = `${os.tmpdir()}/user-create-${Date.now()}.json`;
                fs.writeFileSync(tempFile, JSON.stringify(userConfig));

                // Execute user creation
                const result = execSync(
                    `sf data create record --sobject User --values @${tempFile} --target-org ${this.orgAlias} --json`,
                    { encoding: 'utf-8' }
                );

                // Clean up temp file
                fs.unlinkSync(tempFile);

                const parsed = JSON.parse(result);

                if (parsed.status === 0) {
                    results.push({
                        success: true,
                        user,
                        userId: parsed.result.id,
                        message: 'User created successfully'
                    });
                } else {
                    results.push({
                        success: false,
                        user,
                        error: parsed.message
                    });
                }
            } catch (err) {
                results.push({
                    success: false,
                    user,
                    error: err.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;

        return {
            success: successCount === users.length,
            created: successCount,
            failed: users.length - successCount,
            results
        };
    }

    /**
     * Update user role
     * @param {string} userId - User ID
     * @param {string} roleName - New role name
     * @returns {Object} - Update result
     */
    async updateUserRole(userId, roleName) {
        // Create backup first
        this.createBackup([userId], `Pre-role-update to ${roleName}`);

        // Get role ID
        const roleId = this.getRoleId(roleName);

        // Update user
        try {
            const result = execSync(
                `sf data update record --sobject User --record-id ${userId} --values "UserRoleId=${roleId}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            );

            const parsed = JSON.parse(result);

            return {
                success: parsed.status === 0,
                userId,
                roleName,
                roleId,
                message: parsed.status === 0 ? 'Role updated successfully' : parsed.message
            };
        } catch (err) {
            return {
                success: false,
                userId,
                roleName,
                error: err.message
            };
        }
    }

    /**
     * Update user profile
     * @param {string} userId - User ID
     * @param {string} profileName - New profile name
     * @returns {Object} - Update result
     */
    async updateUserProfile(userId, profileName) {
        // Create backup first
        this.createBackup([userId], `Pre-profile-update to ${profileName}`);

        // Get profile ID
        const profileId = this.getProfileId(profileName);

        // Update user
        try {
            const result = execSync(
                `sf data update record --sobject User --record-id ${userId} --values "ProfileId=${profileId}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf-8' }
            );

            const parsed = JSON.parse(result);

            return {
                success: parsed.status === 0,
                userId,
                profileName,
                profileId,
                message: parsed.status === 0 ? 'Profile updated successfully' : parsed.message
            };
        } catch (err) {
            return {
                success: false,
                userId,
                profileName,
                error: err.message
            };
        }
    }

    /**
     * Batch update user roles
     * @param {Array<Object>} updates - Array of { userId, roleName }
     * @returns {Object} - Batch update results
     */
    async batchUpdateRoles(updates) {
        console.log(`📊 Updating ${updates.length} user roles in parallel...`);

        // Parallelize role updates - each update is independent
        const results = await Promise.all(
            updates.map(async (update) => {
                try {
                    return await this.updateUserRole(update.userId, update.roleName);
                } catch (error) {
                    console.error(`⚠️  Role update failed for user ${update.userId}:`, error.message);
                    return {
                        success: false,
                        userId: update.userId,
                        roleName: update.roleName,
                        error: error.message
                    };
                }
            })
        );

        const successCount = results.filter(r => r.success).length;
        console.log(`✅ Updated ${successCount}/${updates.length} user roles`);

        return {
            success: successCount === updates.length,
            updated: successCount,
            failed: updates.length - successCount,
            results
        };
    }

    /**
     * Get user provisioning report
     * @param {Object} analysis - Analysis from analyzeUsers()
     * @returns {string} - Formatted report
     */
    generateReport(analysis) {
        const { existing, toCreate, summary } = analysis;

        let report = '\n=== User Provisioning Analysis ===\n\n';
        report += `Total Users: ${summary.total}\n`;
        report += `Existing: ${summary.existing}\n`;
        report += `Need Creation: ${summary.toCreate}\n\n`;

        if (existing.length > 0) {
            report += '--- Existing Users ---\n';
            existing.forEach((user, i) => {
                const sf = user.sfUser;
                report += `${i + 1}. ${user.fullName} (${user.email})\n`;
                report += `   SF ID: ${sf.Id}\n`;
                report += `   Profile: ${sf.Profile?.Name || 'N/A'}\n`;
                report += `   Role: ${sf.UserRole?.Name || 'None'}\n`;
                report += `   Active: ${sf.IsActive}\n\n`;
            });
        }

        if (toCreate.length > 0) {
            report += '--- Users to Create ---\n';
            toCreate.forEach((user, i) => {
                report += `${i + 1}. ${user.fullName} (${user.email})\n`;
            });
        }

        return report;
    }
}

// Export for CommonJS
module.exports = { UserProvisioner };

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: user-provisioner.js <command> [options]');
        console.log('\nCommands:');
        console.log('  analyze <names-file> <domain> <org>  - Analyze which users exist');
        console.log('  create <users-file> <profile> <role> <org> - Create users');
        console.log('  update-role <user-id> <role> <org>   - Update user role');
        console.log('\nExamples:');
        console.log('  user-provisioner.js analyze names.txt acme-corp.io myorg');
        console.log('  user-provisioner.js create to-create.json "Customer Advocate" "Customer Advocacy" myorg');
        console.log('  user-provisioner.js update-role 005xxx000001234 "Customer Advocacy Leadership" myorg');
        process.exit(1);
    }

    const command = args[0];

    (async () => {
        try {
            switch (command) {
                case 'analyze': {
                    const [namesFile, domain, org] = args.slice(1);

                    if (!namesFile || !domain || !org) {
                        console.error('Error: analyze requires <names-file> <domain> <org>');
                        process.exit(1);
                    }

                    const names = fs.readFileSync(namesFile, 'utf-8')
                        .split('\n')
                        .map(n => n.trim())
                        .filter(n => n.length > 0);

                    const provisioner = new UserProvisioner({ orgAlias: org, emailDomain: domain });
                    const analysis = await provisioner.analyzeUsers(names, domain);

                    console.log(provisioner.generateReport(analysis));

                    // Save to-create list
                    if (analysis.toCreate.length > 0) {
                        fs.writeFileSync('to-create.json', JSON.stringify(analysis.toCreate, null, 2));
                        console.log('\n✓ Saved users to create: to-create.json');
                    }

                    break;
                }

                case 'create': {
                    const [usersFile, profile, role, org] = args.slice(1);

                    if (!usersFile || !profile || !org) {
                        console.error('Error: create requires <users-file> <profile> <org>');
                        process.exit(1);
                    }

                    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
                    const provisioner = new UserProvisioner({ orgAlias: org });

                    console.log(`Creating ${users.length} users...`);
                    const results = await provisioner.createUsers(users, { profile, role });

                    console.log(`\n✓ Created: ${results.created}`);
                    console.log(`✗ Failed: ${results.failed}`);

                    if (results.failed > 0) {
                        console.log('\nFailed users:');
                        results.results.filter(r => !r.success).forEach(r => {
                            console.log(`  ${r.user.fullName}: ${r.error}`);
                        });
                    }

                    break;
                }

                case 'update-role': {
                    const [userId, role, org] = args.slice(1);

                    if (!userId || !role || !org) {
                        console.error('Error: update-role requires <user-id> <role> <org>');
                        process.exit(1);
                    }

                    const provisioner = new UserProvisioner({ orgAlias: org });
                    const result = await provisioner.updateUserRole(userId, role);

                    if (result.success) {
                        console.log(`✓ ${result.message}`);
                    } else {
                        console.error(`✗ ${result.error}`);
                        process.exit(1);
                    }

                    break;
                }

                default:
                    console.error(`Error: Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    })();
}
