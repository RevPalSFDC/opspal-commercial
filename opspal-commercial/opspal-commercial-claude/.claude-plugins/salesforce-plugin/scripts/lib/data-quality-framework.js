#!/usr/bin/env node
/**
 * Data Quality Framework
 *
 * Purpose: Reusable duplicate detection, master record selection, and data
 * quality analysis. Implements shared email filtering, fuzzy matching, and
 * confidence scoring patterns from duplicate-analysis-v2.js.
 *
 * Key Features:
 * - Duplicate detection (email, name+account, fuzzy name)
 * - Shared email filtering with scoring system
 * - Master record selection with data completeness
 * - Confidence scoring (0-100)
 * - Clean Status classification (OK, Review, Merge, Delete)
 * - Bulk API v2 support for large datasets
 * - Extensible matching algorithms
 *
 * Usage Examples:
 *
 * // Detect duplicates
 * const framework = new DataQualityFramework('rentable-production');
 * const duplicates = await framework.detectDuplicates('Contact', {
 *   methods: ['email', 'nameAccount', 'fuzzyName'],
 *   filterSharedEmails: true
 * });
 *
 * // Filter shared emails
 * const { legitimate, shared } = framework.filterSharedEmails(emailMap);
 *
 * // Select master record from group
 * const master = framework.selectMaster(duplicateGroup);
 *
 * // Calculate confidence score
 * const confidence = framework.calculateConfidence(duplicateGroup, 'email');
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DataQualityFramework {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;

        // Shared email patterns
        this.sharedEmailPatterns = [
            /^(info|contact|admin|support|help|general)@/,
            /^(leasing|rent|rentals|apartments|apartment)@/,
            /^(marketing|sales|business|advertising)@/,
            /^(office|reception|admin|frontdesk|front)@/,
            /^(team|group|staff|careers|hr|jobs)@/,
            /^\d+[-_](office|leasing|email|property)/
        ];

        // Confidence thresholds
        this.confidenceThresholds = {
            merge: 90,  // Auto-merge (high confidence)
            review: 60  // Manual review needed
        };
    }

    /**
     * Detect duplicates across an object
     * @param {string} sobject - Object to analyze (Contact, Account, etc.)
     * @param {object} options - Detection options
     * @returns {Promise<object>} Duplicate analysis results
     */
    async detectDuplicates(sobject, options = {}) {
        const methods = options.methods || ['email', 'nameAccount', 'fuzzyName'];
        const filterShared = options.filterSharedEmails !== false;

        console.log(`\n🔍 Duplicate Detection: ${sobject}`);
        console.log(`${'═'.repeat(60)}\n`);
        console.log(`Methods: ${methods.join(', ')}`);
        console.log(`Filter shared emails: ${filterShared}\n`);

        const results = {
            sobject,
            timestamp: new Date().toISOString(),
            methods: methods,
            duplicates: [],
            statistics: {
                totalRecords: 0,
                duplicateGroups: 0,
                recordsAffected: 0,
                duplicateRate: '0%'
            }
        };

        // Query records
        const records = await this._queryRecords(sobject);
        results.statistics.totalRecords = records.length;

        console.log(`Retrieved ${records.length.toLocaleString()} records\n`);

        // Email matching
        if (methods.includes('email')) {
            console.log(`📧 Email matching...`);
            const emailDuplicates = await this.detectEmailDuplicates(records, {
                filterShared
            });
            results.duplicates.push(...emailDuplicates);
            console.log(`   Found ${emailDuplicates.length} groups\n`);
        }

        // Name + Account matching
        if (methods.includes('nameAccount')) {
            console.log(`👤 Name + Account matching...`);
            const nameAccountDuplicates = this.detectNameAccountDuplicates(records);
            results.duplicates.push(...nameAccountDuplicates);
            console.log(`   Found ${nameAccountDuplicates.length} groups\n`);
        }

        // Fuzzy name matching
        if (methods.includes('fuzzyName')) {
            console.log(`🔤 Fuzzy name matching...`);
            const fuzzyDuplicates = this.detectFuzzyNameDuplicates(records);
            results.duplicates.push(...fuzzyDuplicates);
            console.log(`   Found ${fuzzyDuplicates.length} groups\n`);
        }

        // Calculate statistics
        results.statistics.duplicateGroups = results.duplicates.length;
        results.statistics.recordsAffected = results.duplicates.reduce((sum, group) => {
            return sum + group.recordsToMerge.length + 1; // +1 for master
        }, 0);
        results.statistics.duplicateRate = results.statistics.totalRecords > 0
            ? ((results.statistics.recordsAffected / results.statistics.totalRecords) * 100).toFixed(2) + '%'
            : '0%';

        this._displaySummary(results);

        return results;
    }

    /**
     * Detect email duplicates with shared email filtering
     */
    async detectEmailDuplicates(records, options = {}) {
        const filterShared = options.filterShared !== false;

        // Group by email
        const emailMap = {};
        records.forEach(record => {
            if (record.Email && record.Email.trim().length > 0) {
                const email = record.Email.toLowerCase().trim();
                if (!emailMap[email]) emailMap[email] = [];
                emailMap[email].push(record);
            }
        });

        // Filter out single occurrences
        Object.keys(emailMap).forEach(email => {
            if (emailMap[email].length < 2) {
                delete emailMap[email];
            }
        });

        // Filter shared emails if requested
        let processedEmailMap = emailMap;
        if (filterShared) {
            const { legitimateEmailDuplicates, sharedEmails } = this.filterSharedEmails(emailMap);
            processedEmailMap = legitimateEmailDuplicates;

            if (this.verbose) {
                console.log(`   Excluded ${sharedEmails.length} shared email groups`);
            }
        }

        // Convert to duplicate groups
        const duplicates = [];
        Object.entries(processedEmailMap).forEach(([email, contacts]) => {
            const master = this.selectMaster(contacts);
            const recordsToMerge = contacts.filter(c => c.Id !== master.Id).map(c => c.Id);

            duplicates.push({
                matchType: 'Email Match',
                totalRecords: contacts.length,
                masterRecord: master,
                recordsToMerge: recordsToMerge,
                confidence: this.calculateConfidence(contacts, 'email'),
                cleanStatus: this._determineCleanStatus(95) // Email matches are high confidence
            });
        });

        return duplicates;
    }

    /**
     * Detect Name + Account duplicates
     */
    detectNameAccountDuplicates(records) {
        const nameAccountMap = {};

        records.forEach(record => {
            if (record.FirstName && record.LastName && record.AccountId) {
                const key = `${record.FirstName.toLowerCase()}_${record.LastName.toLowerCase()}_${record.AccountId}`;
                if (!nameAccountMap[key]) nameAccountMap[key] = [];
                nameAccountMap[key].push(record);
            }
        });

        // Filter singles
        Object.keys(nameAccountMap).forEach(key => {
            if (nameAccountMap[key].length < 2) {
                delete nameAccountMap[key];
            }
        });

        // Convert to duplicate groups
        const duplicates = [];
        Object.entries(nameAccountMap).forEach(([key, contacts]) => {
            const master = this.selectMaster(contacts);
            const recordsToMerge = contacts.filter(c => c.Id !== master.Id).map(c => c.Id);

            duplicates.push({
                matchType: 'Name+Account Match',
                totalRecords: contacts.length,
                masterRecord: master,
                recordsToMerge: recordsToMerge,
                confidence: this.calculateConfidence(contacts, 'nameAccount'),
                cleanStatus: this._determineCleanStatus(90)
            });
        });

        return duplicates;
    }

    /**
     * Detect fuzzy name duplicates (similar names)
     */
    detectFuzzyNameDuplicates(records) {
        const fuzzyMap = {};

        records.forEach(record => {
            if (record.FirstName && record.LastName) {
                const fuzzyKey = this._generateFuzzyKey(record.FirstName, record.LastName);
                if (!fuzzyMap[fuzzyKey]) fuzzyMap[fuzzyKey] = [];
                fuzzyMap[fuzzyKey].push(record);
            }
        });

        // Filter singles
        Object.keys(fuzzyMap).forEach(key => {
            if (fuzzyMap[key].length < 2) {
                delete fuzzyMap[key];
            }
        });

        // Convert to duplicate groups
        const duplicates = [];
        Object.entries(fuzzyMap).forEach(([key, contacts]) => {
            const master = this.selectMaster(contacts);
            const recordsToMerge = contacts.filter(c => c.Id !== master.Id).map(c => c.Id);

            duplicates.push({
                matchType: 'Fuzzy Name Match',
                totalRecords: contacts.length,
                masterRecord: master,
                recordsToMerge: recordsToMerge,
                confidence: this.calculateConfidence(contacts, 'fuzzyName'),
                cleanStatus: this._determineCleanStatus(50) // Lower confidence
            });
        });

        return duplicates;
    }

    /**
     * Filter shared emails from duplicate map
     * @param {object} emailMap - Map of email -> contacts[]
     * @returns {object} { legitimateEmailDuplicates, sharedEmails }
     */
    filterSharedEmails(emailMap) {
        const legitimateEmailDuplicates = {};
        const sharedEmails = [];

        Object.entries(emailMap).forEach(([email, contacts]) => {
            if (contacts.length <= 1) return;

            const emailLower = email.toLowerCase();
            let sharedScore = 0;
            const reasons = [];

            // Check 1: Pattern matching (+3 points)
            if (this.sharedEmailPatterns.some(p => p.test(emailLower))) {
                sharedScore += 3;
                reasons.push('Generic email pattern');
            }

            // Check 2: Name diversity (+2 points)
            const uniqueFirstNames = new Set(contacts.map(c => c.FirstName?.toLowerCase()).filter(Boolean));
            const uniqueLastNames = new Set(contacts.map(c => c.LastName?.toLowerCase()).filter(Boolean));
            if (contacts.length >= 3 && uniqueFirstNames.size >= 3 && uniqueLastNames.size >= 2) {
                sharedScore += 2;
                reasons.push('High name diversity');
            }

            // Check 3: Multiple accounts (+3 points)
            const accounts = new Set(contacts.map(c => c.AccountId).filter(Boolean));
            if (accounts.size > 1) {
                sharedScore += 3;
                reasons.push('Multiple accounts');
            }

            // Check 4: Shared job titles (+1 point)
            const titles = contacts.map(c => (c.Title || '').toLowerCase());
            const sharedTitleKeywords = ['leasing', 'agent', 'manager', 'coordinator', 'assistant', 'property'];
            const matchCount = titles.filter(t =>
                sharedTitleKeywords.some(kw => t.includes(kw))
            ).length;
            if (matchCount >= 2) {
                sharedScore += 1;
                reasons.push('Shared job titles');
            }

            // Decision: Score >= 3 = shared email
            if (sharedScore >= 3) {
                sharedEmails.push({
                    email,
                    contactCount: contacts.length,
                    score: sharedScore,
                    reasons,
                    contacts
                });
            } else {
                legitimateEmailDuplicates[email] = contacts;
            }
        });

        return { legitimateEmailDuplicates, sharedEmails };
    }

    /**
     * Select master record from duplicate group
     * @param {Array} records - Array of duplicate records
     * @returns {object} Master record
     */
    selectMaster(records) {
        if (records.length === 0) return null;
        if (records.length === 1) return records[0];

        // Score each record
        const scoredRecords = records.map(record => {
            const score = this._calculateDataCompletenessScore(record);
            return { record, score };
        });

        // Sort by score (descending), then by LastModifiedDate (most recent first)
        scoredRecords.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return new Date(b.record.LastModifiedDate) - new Date(a.record.LastModifiedDate);
        });

        const master = scoredRecords[0];

        // Determine reason
        let reason = '';
        if (master.score > scoredRecords[1]?.score) {
            reason = 'Highest data completeness';
        } else {
            reason = 'Equal completeness + Most recently modified';
        }

        master.record.reason = reason;
        master.record.dataCompletenessScore = master.score;

        return master.record;
    }

    /**
     * Calculate confidence score for duplicate group
     * @param {Array} records - Duplicate records
     * @param {string} matchType - Type of match (email, nameAccount, fuzzyName)
     * @returns {number} Confidence score (0-100)
     */
    calculateConfidence(records, matchType) {
        if (matchType === 'email') {
            return 95; // Email matches are very high confidence
        }

        if (matchType === 'nameAccount') {
            return 90; // Name + Account matches are high confidence
        }

        if (matchType === 'fuzzyName') {
            // Lower confidence for fuzzy matches
            // Increase confidence if:
            // - Have email
            // - Same account
            let confidence = 50;

            const hasEmail = records.every(r => r.Email);
            const sameAccount = records.every(r => r.AccountId === records[0].AccountId);

            if (hasEmail) confidence += 20;
            if (sameAccount) confidence += 20;

            return Math.min(confidence, 90);
        }

        return 50; // Default
    }

    /**
     * Calculate data completeness score for master selection
     * @private
     */
    _calculateDataCompletenessScore(record) {
        let score = 0;

        // Contact-specific scoring
        if (record.FirstName) score += 10;
        if (record.LastName) score += 10;
        if (record.Email) score += 15;
        if (record.Phone || record.MobilePhone) score += 10;
        if (record.Title) score += 10;
        if (record.AccountId) score += 20;
        if (record.MailingStreet || record.MailingCity) score += 10;
        if (record.Department) score += 5;

        // Account-specific scoring
        if (record.Website) score += 15;
        if (record.BillingStreet || record.BillingCity) score += 10;
        if (record.Industry) score += 5;
        if (record.Type) score += 5;

        return score;
    }

    /**
     * Determine Clean Status based on confidence
     * @private
     */
    _determineCleanStatus(confidence) {
        if (confidence >= this.confidenceThresholds.merge) {
            return 'Merge';
        } else if (confidence >= this.confidenceThresholds.review) {
            return 'Review';
        } else {
            return 'Review';
        }
    }

    /**
     * Generate fuzzy key for name matching
     * @private
     */
    _generateFuzzyKey(firstName, lastName) {
        // Simple soundex-like matching
        const normalize = (str) => {
            return str.toLowerCase()
                .replace(/[^a-z]/g, '')
                .substring(0, 4);
        };

        return `${normalize(firstName)}_${normalize(lastName)}`;
    }

    /**
     * Query records from Salesforce
     * @private
     */
    async _queryRecords(sobject) {
        let query = '';

        if (sobject === 'Contact') {
            query = `SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Title, Department, AccountId, Account.Name, MailingStreet, MailingCity, MailingState, CreatedDate, LastModifiedDate FROM Contact`;
        } else if (sobject === 'Account') {
            query = `SELECT Id, Name, Website, Phone, BillingStreet, BillingCity, BillingState, Industry, Type, CreatedDate, LastModifiedDate FROM Account`;
        } else {
            throw new Error(`Unsupported sobject: ${sobject}`);
        }

        // Use Bulk API v2 for large datasets
        return this._executeBulkQuery(query);
    }

    /**
     * Execute bulk query
     * @private
     */
    _executeBulkQuery(query) {
        try {
            const tempResultFile = path.join(__dirname, `bulk-result-${Date.now()}.csv`);

            execSync(
                `sf data export bulk --query "${query.replace(/\n/g, ' ')}" --target-org ${this.orgAlias} --result-format csv --output-file "${tempResultFile}" --wait 20`,
                { maxBuffer: 1024 * 1024 * 500, stdio: 'inherit' }
            );

            const csvContent = fs.readFileSync(tempResultFile, 'utf-8');
            const records = this._parseCSV(csvContent);
            fs.unlinkSync(tempResultFile);

            return records;

        } catch (error) {
            console.error('❌ Bulk query failed:', error.message);
            throw error;
        }
    }

    /**
     * Parse CSV to records
     * @private
     */
    _parseCSV(csvContent) {
        const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map(h => h.trim());
        const records = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const record = {};

            headers.forEach((header, index) => {
                let value = values[index]?.trim();

                // Handle nested object notation (Account.Name)
                if (header.includes('.')) {
                    const [obj, field] = header.split('.');
                    if (!record[obj]) record[obj] = {};
                    record[obj][field] = value;
                } else {
                    record[header] = value;
                }
            });

            records.push(record);
        }

        return records;
    }

    /**
     * Display summary
     * @private
     */
    _displaySummary(results) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 Duplicate Detection Summary`);
        console.log(`${'═'.repeat(60)}\n`);

        console.log(`Total records: ${results.statistics.totalRecords.toLocaleString()}`);
        console.log(`Duplicate groups: ${results.statistics.duplicateGroups.toLocaleString()}`);
        console.log(`Records affected: ${results.statistics.recordsAffected.toLocaleString()}`);
        console.log(`Duplicate rate: ${results.statistics.duplicateRate}\n`);

        // Breakdown by match type
        const byType = results.duplicates.reduce((acc, dup) => {
            acc[dup.matchType] = (acc[dup.matchType] || 0) + 1;
            return acc;
        }, {});

        console.log(`Breakdown by match type:`);
        Object.entries(byType).forEach(([type, count]) => {
            console.log(`   ${type}: ${count.toLocaleString()}`);
        });

        console.log(`\n${'═'.repeat(60)}\n`);
    }
}

// Export
module.exports = DataQualityFramework;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Data Quality Framework

Usage:
  node data-quality-framework.js <sobject> <org-alias> [options]

Options:
  --methods=email,nameAccount,fuzzyName  - Detection methods (default: all)
  --no-filter-shared                     - Don't filter shared emails
  --verbose                              - Verbose output

Examples:
  node data-quality-framework.js Contact rentable-production
  node data-quality-framework.js Contact rentable-production --methods=email
  node data-quality-framework.js Account rentable-production --verbose
        `);
        process.exit(0);
    }

    const [sobject, orgAlias] = args;
    const options = {};

    // Parse options
    args.slice(2).forEach(arg => {
        if (arg.startsWith('--methods=')) {
            options.methods = arg.split('=')[1].split(',');
        } else if (arg === '--no-filter-shared') {
            options.filterSharedEmails = false;
        } else if (arg === '--verbose') {
            options.verbose = true;
        }
    });

    (async () => {
        const framework = new DataQualityFramework(orgAlias, options);
        const results = await framework.detectDuplicates(sobject, options);

        // Save results
        const outputPath = path.join(__dirname, `../duplicate-analysis-${sobject.toLowerCase()}-${Date.now()}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`Results saved to: ${outputPath}\n`);

    })().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}