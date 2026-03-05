#!/usr/bin/env node
/**
 * User ID Resolver with Sandbox Suffix Handling
 *
 * Resolves user emails to Salesforce User IDs with automatic handling of
 * sandbox email suffixes (.invalid, .sandbox, .orgname).
 *
 * Usage:
 *   node user-id-resolver.js <orgAlias> <email>
 *   node user-id-resolver.js <orgAlias> <email> --cache
 *
 * Examples:
 *   node user-id-resolver.js rentable-sandbox john@example.com
 *   node user-id-resolver.js wedgewood-uat admin@company.com --cache
 *
 * Author: RevPal Operations
 * Date: 2025-10-06
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');

/**
 * Common sandbox email suffixes in order of prevalence
 */
const SANDBOX_SUFFIXES = [
    '.invalid',      // Most common Salesforce sandbox suffix
    '.sandbox',      // Generic sandbox suffix
    '.sandboxname',  // Placeholder for specific sandbox name
    '.revpalsb',     // RevPal specific
    '.uat',          // UAT environments
    '.dev',          // Development environments
    '.test',         // Test environments
    '.staging',      // Staging environments
    '.demo'          // Demo environments
];

/**
 * Cache directory for user mappings
 */
const CACHE_DIR = path.join(process.cwd(), '.cache', 'user-mappings');

/**
 * Initialize cache directory
 */
function initCache() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Get cache file path for org
 * @param {string} orgAlias - Target org
 * @returns {string} Cache file path
 */
function getCacheFile(orgAlias) {
    return path.join(CACHE_DIR, `${orgAlias}-users.json`);
}

/**
 * Load cached users for org
 * @param {string} orgAlias - Target org
 * @returns {Object} Cached user mappings
 */
function loadCache(orgAlias) {
    const cacheFile = getCacheFile(orgAlias);
    if (fs.existsSync(cacheFile)) {
        const stats = fs.statSync(cacheFile);
        const ageInHours = (Date.now() - stats.mtime) / (1000 * 60 * 60);

        // Cache expires after 24 hours
        if (ageInHours < 24) {
            return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        }
    }
    return {};
}

/**
 * Save user mapping to cache
 * @param {string} orgAlias - Target org
 * @param {Object} cache - User mappings to save
 */
function saveCache(orgAlias, cache) {
    initCache();
    const cacheFile = getCacheFile(orgAlias);
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

/**
 * Check if org is a sandbox
 * @param {string} orgAlias - Target org
 * @returns {Object} Sandbox info
 */
function checkSandboxStatus(orgAlias) {
    try {
        const cmd = `sf data query --query "SELECT IsSandbox, InstanceName, OrganizationType FROM Organization LIMIT 1" --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result && result.result.records.length > 0) {
            const org = result.result.records[0];
            return {
                isSandbox: org.IsSandbox,
                instanceName: org.InstanceName,
                organizationType: org.OrganizationType
            };
        }
        return { isSandbox: false };
    } catch (error) {
        console.error(colors.yellow('⚠️  Could not determine sandbox status, assuming production'));
        return { isSandbox: false };
    }
}

/**
 * Generate possible email variations for sandbox
 * @param {string} email - Base email address
 * @param {Object} sandboxInfo - Sandbox information
 * @returns {Array} Array of possible email variations
 */
function generateEmailVariations(email, sandboxInfo) {
    const variations = [email]; // Always try base email first

    if (sandboxInfo.isSandbox) {
        // Add common suffixes
        SANDBOX_SUFFIXES.forEach(suffix => {
            variations.push(email + suffix);
        });

        // Add instance-specific suffix if available
        if (sandboxInfo.instanceName) {
            const instanceSuffix = '.' + sandboxInfo.instanceName.toLowerCase();
            if (!variations.includes(email + instanceSuffix)) {
                variations.push(email + instanceSuffix);
            }
        }

        // Handle nested suffixes (e.g., .invalid.invalid)
        variations.push(email + '.invalid.invalid');
        variations.push(email + '.sandbox.invalid');
    }

    return variations;
}

/**
 * Query for user by email
 * @param {string} orgAlias - Target org
 * @param {string} email - Email to search
 * @returns {Object|null} User record if found
 */
function queryUserByEmail(orgAlias, email) {
    try {
        // Escape single quotes in email
        const escapedEmail = email.replace(/'/g, "\\'");

        const cmd = `sf data query --query "SELECT Id, Name, Email, Username, Profile.Name, IsActive FROM User WHERE Email = '${escapedEmail}' LIMIT 1" --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result && result.result.records.length > 0) {
            return result.result.records[0];
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Query for user by username
 * @param {string} orgAlias - Target org
 * @param {string} username - Username to search
 * @returns {Object|null} User record if found
 */
function queryUserByUsername(orgAlias, username) {
    try {
        // Escape single quotes in username
        const escapedUsername = username.replace(/'/g, "\\'");

        const cmd = `sf data query --query "SELECT Id, Name, Email, Username, Profile.Name, IsActive FROM User WHERE Username = '${escapedUsername}' LIMIT 1" --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result && result.result.records.length > 0) {
            return result.result.records[0];
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Search for users with partial match
 * @param {string} orgAlias - Target org
 * @param {string} emailPart - Part of email to search
 * @returns {Array} Array of matching users
 */
function searchUsersByEmailPart(orgAlias, emailPart) {
    try {
        // Extract the part before @ for searching
        const searchTerm = emailPart.split('@')[0];
        const escapedTerm = searchTerm.replace(/'/g, "\\'");

        const cmd = `sf data query --query "SELECT Id, Name, Email, Username, Profile.Name, IsActive FROM User WHERE Email LIKE '%${escapedTerm}%' AND IsActive = true ORDER BY LastLoginDate DESC NULLS LAST LIMIT 10" --target-org ${orgAlias} --json 2>/dev/null`;
        const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

        if (result.status === 0 && result.result && result.result.records.length > 0) {
            return result.result.records;
        }
        return [];
    } catch (error) {
        return [];
    }
}

/**
 * Resolves user email to User ID with sandbox suffix handling
 * @param {string} orgAlias - Target org
 * @param {string} email - User email
 * @param {boolean} useCache - Whether to use cache
 * @returns {Object} Resolution result
 */
async function resolveUserIdWithSandboxHandling(orgAlias, email, useCache = false) {
    console.log(colors.cyan(`\n🔍 Resolving user: ${email} in ${orgAlias}...\n`));

    // Check cache first
    if (useCache) {
        const cache = loadCache(orgAlias);
        if (cache[email]) {
            console.log(colors.green('✅ Found in cache'));
            return cache[email];
        }
    }

    // Check sandbox status
    const sandboxInfo = checkSandboxStatus(orgAlias);
    console.log(colors.gray(`📍 Org Type: ${sandboxInfo.isSandbox ? 'Sandbox' : 'Production'}`));

    if (sandboxInfo.isSandbox && sandboxInfo.instanceName) {
        console.log(colors.gray(`📍 Instance: ${sandboxInfo.instanceName}`));
    }

    // Generate email variations to try
    const emailVariations = generateEmailVariations(email, sandboxInfo);
    console.log(colors.gray(`\n🔄 Trying ${emailVariations.length} email variations...\n`));

    // Try each variation
    for (const emailVariant of emailVariations) {
        console.log(colors.gray(`   Trying: ${emailVariant}...`));
        const user = queryUserByEmail(orgAlias, emailVariant);

        if (user) {
            const result = {
                userId: user.Id,
                actualEmail: user.Email,
                username: user.Username,
                name: user.Name,
                profileName: user.Profile ? user.Profile.Name : null,
                isActive: user.IsActive,
                isSandbox: sandboxInfo.isSandbox,
                originalEmail: email,
                foundWithSuffix: emailVariant !== email,
                suffix: emailVariant.replace(email, '')
            };

            console.log(colors.green(`\n✅ User found!`));
            console.log(colors.green(`   User ID: ${result.userId}`));
            console.log(colors.green(`   Name: ${result.name}`));
            console.log(colors.green(`   Actual Email: ${result.actualEmail}`));
            console.log(colors.green(`   Username: ${result.username}`));
            console.log(colors.green(`   Profile: ${result.profileName}`));

            if (result.foundWithSuffix) {
                console.log(colors.yellow(`   📌 Found with suffix: ${result.suffix}`));
            }

            // Save to cache
            if (useCache) {
                const cache = loadCache(orgAlias);
                cache[email] = result;
                saveCache(orgAlias, cache);
                console.log(colors.gray(`   💾 Saved to cache`));
            }

            return result;
        }
    }

    // Try username search as fallback
    console.log(colors.yellow(`\n⚠️  Not found by email, trying username search...`));
    const userByUsername = queryUserByUsername(orgAlias, email);

    if (userByUsername) {
        const result = {
            userId: userByUsername.Id,
            actualEmail: userByUsername.Email,
            username: userByUsername.Username,
            name: userByUsername.Name,
            profileName: userByUsername.Profile ? userByUsername.Profile.Name : null,
            isActive: userByUsername.IsActive,
            isSandbox: sandboxInfo.isSandbox,
            originalEmail: email,
            foundByUsername: true
        };

        console.log(colors.green(`\n✅ User found by username!`));
        console.log(colors.green(`   User ID: ${result.userId}`));
        console.log(colors.green(`   Name: ${result.name}`));
        console.log(colors.green(`   Email: ${result.actualEmail}`));
        console.log(colors.green(`   Username: ${result.username}`));

        return result;
    }

    // Try partial search as last resort
    console.log(colors.yellow(`\n⚠️  Trying partial email search...`));
    const partialMatches = searchUsersByEmailPart(orgAlias, email);

    if (partialMatches.length > 0) {
        console.log(colors.yellow(`\n🔍 Found ${partialMatches.length} partial matches:`));
        partialMatches.forEach((user, idx) => {
            console.log(colors.gray(`   ${idx + 1}. ${user.Name}`));
            console.log(colors.gray(`      Email: ${user.Email}`));
            console.log(colors.gray(`      Username: ${user.Username}`));
            console.log(colors.gray(`      Profile: ${user.Profile ? user.Profile.Name : 'N/A'}`));
            console.log();
        });

        return {
            userId: null,
            actualEmail: null,
            isSandbox: sandboxInfo.isSandbox,
            originalEmail: email,
            partialMatches: partialMatches,
            message: `No exact match found. ${partialMatches.length} partial matches available.`
        };
    }

    // Not found
    return {
        userId: null,
        actualEmail: null,
        isSandbox: sandboxInfo.isSandbox,
        originalEmail: email,
        notFound: true,
        message: `User not found: ${email}`,
        triedVariations: emailVariations
    };
}

/**
 * Bulk resolve multiple users
 * @param {string} orgAlias - Target org
 * @param {Array} emails - Array of emails to resolve
 * @returns {Object} Map of email to resolution result
 */
async function bulkResolveUsers(orgAlias, emails) {
    console.log(colors.cyan(`\n🔍 Bulk resolving ${emails.length} users...\n`));

    const results = {};
    const cache = loadCache(orgAlias);
    let foundInCache = 0;

    for (const email of emails) {
        // Check cache first
        if (cache[email]) {
            results[email] = cache[email];
            foundInCache++;
            console.log(colors.gray(`✓ ${email} (cached)`));
        } else {
            // Resolve and add to results
            const result = await resolveUserIdWithSandboxHandling(orgAlias, email, false);
            results[email] = result;

            // Update cache if found
            if (result.userId) {
                cache[email] = result;
            }
        }
    }

    // Save updated cache
    saveCache(orgAlias, cache);

    // Summary
    console.log(colors.cyan('\n📊 Resolution Summary:'));
    console.log(colors.gray(`   Total: ${emails.length}`));
    console.log(colors.gray(`   From Cache: ${foundInCache}`));

    const resolved = Object.values(results).filter(r => r.userId).length;
    const notFound = Object.values(results).filter(r => !r.userId).length;

    console.log(colors.green(`   Resolved: ${resolved}`));
    if (notFound > 0) {
        console.log(colors.red(`   Not Found: ${notFound}`));
    }

    return results;
}

/**
 * Main execution function
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(colors.yellow('Usage: node user-id-resolver.js <orgAlias> <email> [--cache] [--bulk]'));
        console.log(colors.gray('\nExamples:'));
        console.log(colors.gray('  node user-id-resolver.js rentable-sandbox john@example.com'));
        console.log(colors.gray('  node user-id-resolver.js wedgewood-uat admin@company.com --cache'));
        console.log(colors.gray('  node user-id-resolver.js myorg emails.txt --bulk'));
        process.exit(1);
    }

    const orgAlias = args[0];
    const input = args[1];
    const useCache = args.includes('--cache');
    const bulkMode = args.includes('--bulk');

    try {
        if (bulkMode) {
            // Read emails from file
            if (!fs.existsSync(input)) {
                throw new Error(`File not found: ${input}`);
            }

            const emails = fs.readFileSync(input, 'utf8')
                .split('\n')
                .map(e => e.trim())
                .filter(e => e.length > 0);

            const results = await bulkResolveUsers(orgAlias, emails);

            // Write results to file
            const outputFile = input.replace(/\.[^.]+$/, '-resolved.json');
            fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
            console.log(colors.green(`\n✅ Results written to: ${outputFile}`));

        } else {
            // Single email resolution
            const result = await resolveUserIdWithSandboxHandling(orgAlias, input, useCache);

            // Output JSON for programmatic use
            if (process.env.JSON_OUTPUT) {
                console.log('\n' + JSON.stringify(result, null, 2));
            }

            // Exit with appropriate code
            process.exit(result.userId ? 0 : 1);
        }

    } catch (error) {
        console.error(colors.red('❌ Error:'), error.message);
        process.exit(1);
    }
}

// Export functions for use as library
module.exports = {
    resolveUserIdWithSandboxHandling,
    bulkResolveUsers,
    checkSandboxStatus,
    generateEmailVariations,
    queryUserByEmail,
    searchUsersByEmailPart
};

// Run if called directly
if (require.main === module) {
    main();
}