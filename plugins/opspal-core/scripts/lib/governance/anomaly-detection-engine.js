/**
 * Anomaly Detection Engine
 *
 * Detects data quality anomalies including role-account mismatches,
 * address proximity issues, government hierarchy gaps, and suspicious patterns.
 *
 * @module governance/anomaly-detection-engine
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveProtectedAssetPath } = require('../protected-asset-runtime');

/**
 * Anomaly severity levels
 */
const SEVERITY = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
};

/**
 * Anomaly types
 */
const ANOMALY_TYPES = {
    ROLE_ACCOUNT_MISMATCH: 'role_account_mismatch',
    ADDRESS_PROXIMITY: 'address_proximity',
    GOVERNMENT_HIERARCHY: 'government_hierarchy',
    DATA_STALENESS: 'data_staleness',
    CONTACT_CLUSTERING: 'contact_clustering',
    REVENUE_EMPLOYEE_RATIO: 'revenue_employee_ratio',
    DUPLICATE_INDICATOR: 'duplicate_indicator',
    EMAIL_PATTERN: 'email_pattern',
    PHONE_PATTERN: 'phone_pattern'
};

/**
 * Anomaly Detection Engine
 */
class AnomalyDetectionEngine {
    /**
     * Create an anomaly detection engine
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Load patterns configuration
        this.patternsPath = options.patternsPath ||
            resolveProtectedAssetPath({
                pluginRoot: path.resolve(__dirname, '../../..'),
                pluginName: 'opspal-core',
                relativePath: 'config/anomaly-patterns.json',
                allowPlaintextFallback: true
            }) ||
            path.join(__dirname, '../../..', 'config', 'anomaly-patterns.json');
        this.patterns = this._loadPatterns();

        // Scoring configuration
        this.scoringConfig = this.patterns.scoring || {
            severity_weights: {
                critical: 10,
                high: 7,
                medium: 4,
                low: 2,
                info: 1
            },
            thresholds: {
                flag_for_review: 5,
                block_automation: 15,
                require_manual_approval: 25
            }
        };

        // Detection toggles
        this.enabledDetectors = {
            roleAccountMismatch: this.patterns.role_account_mismatch?.enabled !== false,
            addressProximity: this.patterns.address_proximity?.enabled !== false,
            governmentHierarchy: this.patterns.government_hierarchy?.enabled !== false,
            dataStaleness: this.patterns.data_staleness?.enabled !== false,
            contactClustering: this.patterns.contact_clustering?.enabled !== false,
            revenueEmployeeRatio: this.patterns.revenue_employee_ratio?.enabled !== false,
            duplicateIndicators: this.patterns.duplicate_indicators?.enabled !== false,
            emailPatterns: this.patterns.email_patterns?.enabled !== false,
            phonePatterns: this.patterns.phone_patterns?.enabled !== false,
            ...options.enabledDetectors
        };

        // Cache for expensive operations
        this._cache = new Map();
    }

    /**
     * Load anomaly patterns from config file
     * @private
     */
    _loadPatterns() {
        try {
            const content = fs.readFileSync(this.patternsPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.warn(`Failed to load anomaly patterns: ${error.message}`);
            return this._getDefaultPatterns();
        }
    }

    /**
     * Get default patterns if config not available
     * @private
     */
    _getDefaultPatterns() {
        return {
            role_account_mismatch: {
                enabled: true,
                severity: 'high',
                title_keywords: {
                    fire: ['Fire Chief', 'Fire Marshal', 'Firefighter'],
                    police: ['Police Chief', 'Sheriff', 'Detective'],
                    education: ['Professor', 'Dean', 'Principal'],
                    healthcare: ['Doctor', 'Nurse', 'Physician']
                },
                mismatch_rules: []
            },
            scoring: {
                severity_weights: { critical: 10, high: 7, medium: 4, low: 2, info: 1 },
                thresholds: { flag_for_review: 5, block_automation: 15, require_manual_approval: 25 }
            }
        };
    }

    /**
     * Run all enabled anomaly detections on a dataset
     * @param {Object} data - Data to analyze
     * @param {Object} options - Detection options
     * @returns {Object} Detection results
     */
    async detectAll(data, options = {}) {
        const startTime = Date.now();
        const anomalies = [];

        // Run each enabled detector
        if (this.enabledDetectors.roleAccountMismatch && data.contacts && data.accounts) {
            const results = this.detectRoleAccountMismatches(data.contacts, data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.addressProximity && data.accounts) {
            const results = this.detectAddressProximityAnomalies(data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.governmentHierarchy && data.accounts) {
            const results = this.detectGovernmentHierarchyGaps(data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.dataStaleness && data.records) {
            const results = this.detectDataStaleness(data.records, options.fieldDecayRates);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.contactClustering && data.accounts && data.contacts) {
            const results = this.detectContactClusteringAnomalies(data.contacts, data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.revenueEmployeeRatio && data.accounts) {
            const results = this.detectRevenueEmployeeRatioAnomalies(data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.duplicateIndicators && data.accounts) {
            const results = this.detectDuplicateIndicators(data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.emailPatterns && data.contacts) {
            const results = this.detectEmailPatternAnomalies(data.contacts, data.accounts);
            anomalies.push(...results);
        }

        if (this.enabledDetectors.phonePatterns && data.contacts) {
            const results = this.detectPhonePatternAnomalies(data.contacts);
            anomalies.push(...results);
        }

        // Calculate aggregate score
        const aggregateScore = this._calculateAggregateScore(anomalies);

        return {
            anomalies,
            summary: {
                totalAnomalies: anomalies.length,
                bySeverity: this._groupBySeverity(anomalies),
                byType: this._groupByType(anomalies),
                aggregateScore,
                actionRequired: this._determineActionRequired(aggregateScore)
            },
            analyzedAt: new Date().toISOString(),
            duration_ms: Date.now() - startTime
        };
    }

    /**
     * Detect role-account mismatches
     * @param {Object[]} contacts - Contact records
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectRoleAccountMismatches(contacts, accounts) {
        const anomalies = [];
        const config = this.patterns.role_account_mismatch;
        if (!config) return anomalies;

        const accountMap = new Map(accounts.map(a => [a.Id || a.id, a]));

        for (const contact of contacts) {
            const title = (contact.Title || contact.title || '').toLowerCase();
            const accountId = contact.AccountId || contact.accountId;
            const account = accountMap.get(accountId);

            if (!title || !account) continue;

            const accountName = (account.Name || account.name || '').toLowerCase();

            // Check each mismatch rule
            for (const rule of config.mismatch_rules || []) {
                const titleKeywords = config.title_keywords[rule.title_category] || [];
                const titleMatches = titleKeywords.some(kw =>
                    title.includes(kw.toLowerCase())
                );

                if (titleMatches) {
                    const accountMatches = (rule.account_must_contain || []).some(kw =>
                        accountName.includes(kw.toLowerCase())
                    );

                    if (!accountMatches) {
                        anomalies.push({
                            type: ANOMALY_TYPES.ROLE_ACCOUNT_MISMATCH,
                            severity: config.severity || SEVERITY.HIGH,
                            recordId: contact.Id || contact.id,
                            recordType: 'Contact',
                            relatedRecordId: accountId,
                            relatedRecordType: 'Account',
                            details: {
                                contactTitle: contact.Title || contact.title,
                                accountName: account.Name || account.name,
                                expectedAccountType: rule.title_category,
                                expectedKeywords: rule.account_must_contain
                            },
                            confidence: 1 - (rule.confidence_penalty || 0.2),
                            message: `Contact with "${contact.Title || contact.title}" title may be misassigned to "${account.Name || account.name}"`,
                            suggestedAction: 'Review contact-account relationship'
                        });
                    }
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect address proximity anomalies
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectAddressProximityAnomalies(accounts) {
        const anomalies = [];
        const config = this.patterns.address_proximity;
        if (!config) return anomalies;

        // Group accounts by normalized address
        const addressGroups = new Map();

        for (const account of accounts) {
            const address = this._normalizeAddress(account);
            if (!address) continue;

            // Check exclude patterns
            const shouldExclude = (config.exclude_patterns || []).some(pattern =>
                address.includes(pattern.toLowerCase())
            );
            if (shouldExclude) continue;

            if (!addressGroups.has(address)) {
                addressGroups.set(address, []);
            }
            addressGroups.get(address).push(account);
        }

        // Find accounts at same address that aren't linked
        for (const [address, accountsAtAddress] of addressGroups) {
            if (accountsAtAddress.length > 1) {
                // Check if accounts are linked (parent-child relationship)
                for (let i = 0; i < accountsAtAddress.length; i++) {
                    for (let j = i + 1; j < accountsAtAddress.length; j++) {
                        const acc1 = accountsAtAddress[i];
                        const acc2 = accountsAtAddress[j];

                        const areLinked = this._areAccountsLinked(acc1, acc2);

                        if (!areLinked) {
                            anomalies.push({
                                type: ANOMALY_TYPES.ADDRESS_PROXIMITY,
                                severity: config.severity || SEVERITY.MEDIUM,
                                recordId: acc1.Id || acc1.id,
                                recordType: 'Account',
                                relatedRecordId: acc2.Id || acc2.id,
                                relatedRecordType: 'Account',
                                details: {
                                    sharedAddress: address,
                                    account1Name: acc1.Name || acc1.name,
                                    account2Name: acc2.Name || acc2.name
                                },
                                confidence: 0.8,
                                message: `Accounts "${acc1.Name || acc1.name}" and "${acc2.Name || acc2.name}" share address but aren't linked`,
                                suggestedAction: 'Consider establishing parent-child relationship'
                            });
                        }
                    }
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect government hierarchy gaps
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectGovernmentHierarchyGaps(accounts) {
        const anomalies = [];
        const config = this.patterns.government_hierarchy;
        if (!config) return anomalies;

        // Identify government accounts
        const govAccounts = accounts.filter(a => this._isGovernmentAccount(a));

        // Group by jurisdiction
        const jurisdictionGroups = new Map();

        for (const account of govAccounts) {
            const jurisdiction = this._extractJurisdiction(account);
            if (!jurisdiction) continue;

            if (!jurisdictionGroups.has(jurisdiction)) {
                jurisdictionGroups.set(jurisdiction, []);
            }
            jurisdictionGroups.get(jurisdiction).push(account);
        }

        // Check for hierarchy gaps within jurisdictions
        for (const [jurisdiction, accountsInJurisdiction] of jurisdictionGroups) {
            // Check if there's a parent entity
            const parentPatterns = config.parent_patterns || {};

            for (const [patternType, patternConfig] of Object.entries(parentPatterns)) {
                const childPatterns = patternConfig.child_patterns || [];
                const parentPattern = patternConfig.parent_pattern || '';

                // Find accounts matching child patterns
                const childAccounts = accountsInJurisdiction.filter(a => {
                    const name = (a.Name || a.name || '').toLowerCase();
                    return childPatterns.some(cp => name.includes(cp.toLowerCase()));
                });

                if (childAccounts.length > 0) {
                    // Check if parent exists
                    const expectedParentName = parentPattern.replace('{jurisdiction}', jurisdiction);
                    const parentExists = accountsInJurisdiction.some(a => {
                        const name = (a.Name || a.name || '').toLowerCase();
                        return name.includes(expectedParentName.toLowerCase()) ||
                            name === expectedParentName.toLowerCase();
                    });

                    if (!parentExists) {
                        anomalies.push({
                            type: ANOMALY_TYPES.GOVERNMENT_HIERARCHY,
                            severity: config.severity || SEVERITY.MEDIUM,
                            recordId: childAccounts[0].Id || childAccounts[0].id,
                            recordType: 'Account',
                            details: {
                                jurisdiction,
                                childDepartments: childAccounts.map(a => a.Name || a.name),
                                expectedParent: expectedParentName,
                                hierarchyLevel: patternType
                            },
                            confidence: 0.7,
                            message: `Government departments in "${jurisdiction}" lack parent entity "${expectedParentName}"`,
                            suggestedAction: 'Create parent account or establish hierarchy'
                        });
                    }

                    // Check if child accounts have parent relationship set
                    for (const child of childAccounts) {
                        if (!child.ParentId && !child.parentId) {
                            anomalies.push({
                                type: ANOMALY_TYPES.GOVERNMENT_HIERARCHY,
                                severity: SEVERITY.LOW,
                                recordId: child.Id || child.id,
                                recordType: 'Account',
                                details: {
                                    accountName: child.Name || child.name,
                                    jurisdiction,
                                    missingRelationship: 'parent'
                                },
                                confidence: 0.6,
                                message: `Government department "${child.Name || child.name}" has no parent account set`,
                                suggestedAction: 'Set parent account relationship'
                            });
                        }
                    }
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect data staleness anomalies
     * @param {Object[]} records - Records to analyze
     * @param {Object} fieldDecayRates - Custom decay rates per field
     * @returns {Object[]} Detected anomalies
     */
    detectDataStaleness(records, fieldDecayRates = {}) {
        const anomalies = [];
        const config = this.patterns.data_staleness;
        if (!config) return anomalies;

        const decayRates = { ...config.field_decay_days, ...fieldDecayRates };
        const now = Date.now();

        for (const record of records) {
            const lastModified = new Date(
                record.LastModifiedDate || record.lastModifiedDate ||
                record.SystemModstamp || record.updated_at
            );

            if (isNaN(lastModified.getTime())) continue;

            const daysSinceUpdate = Math.floor((now - lastModified.getTime()) / (1000 * 60 * 60 * 24));

            // Check each field for staleness
            for (const [field, decayDays] of Object.entries(decayRates)) {
                const value = record[field] || record[field.toLowerCase()];
                if (!value) continue;

                // Apply decay multipliers
                let adjustedDecayDays = decayDays;
                const title = (record.Title || record.title || '').toLowerCase();

                if (config.high_turnover_titles?.some(t => title.includes(t.toLowerCase()))) {
                    adjustedDecayDays *= config.decay_multipliers?.high_turnover_title || 0.5;
                }

                if (daysSinceUpdate > adjustedDecayDays) {
                    anomalies.push({
                        type: ANOMALY_TYPES.DATA_STALENESS,
                        severity: config.severity || SEVERITY.LOW,
                        recordId: record.Id || record.id,
                        recordType: record.attributes?.type || 'Record',
                        details: {
                            field,
                            daysSinceUpdate,
                            decayThresholdDays: adjustedDecayDays,
                            lastModified: lastModified.toISOString()
                        },
                        confidence: 0.6,
                        message: `Field "${field}" may be stale (${daysSinceUpdate} days since update, threshold: ${adjustedDecayDays})`,
                        suggestedAction: 'Verify or refresh data'
                    });
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect contact clustering anomalies
     * @param {Object[]} contacts - Contact records
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectContactClusteringAnomalies(contacts, accounts) {
        const anomalies = [];
        const config = this.patterns.contact_clustering;
        if (!config) return anomalies;

        const accountMap = new Map(accounts.map(a => [a.Id || a.id, a]));

        // Group contacts by account
        const contactsByAccount = new Map();
        for (const contact of contacts) {
            const accountId = contact.AccountId || contact.accountId;
            if (!accountId) continue;

            if (!contactsByAccount.has(accountId)) {
                contactsByAccount.set(accountId, []);
            }
            contactsByAccount.get(accountId).push(contact);
        }

        const thresholds = config.thresholds || {};

        for (const [accountId, accountContacts] of contactsByAccount) {
            const account = accountMap.get(accountId);
            if (!account) continue;

            // Skip if below minimum for analysis
            if (accountContacts.length < (thresholds.min_contacts_for_analysis || 5)) {
                continue;
            }

            // Check for too many same titles
            const titleCounts = {};
            for (const contact of accountContacts) {
                const title = (contact.Title || contact.title || 'Unknown').toLowerCase();
                titleCounts[title] = (titleCounts[title] || 0) + 1;
            }

            for (const [title, count] of Object.entries(titleCounts)) {
                if (count > (thresholds.max_contacts_same_title || 3)) {
                    anomalies.push({
                        type: ANOMALY_TYPES.CONTACT_CLUSTERING,
                        severity: SEVERITY.MEDIUM,
                        recordId: accountId,
                        recordType: 'Account',
                        details: {
                            accountName: account.Name || account.name,
                            title,
                            count,
                            threshold: thresholds.max_contacts_same_title || 3
                        },
                        confidence: 0.7,
                        message: `Account has ${count} contacts with title "${title}" (unusual clustering)`,
                        suggestedAction: 'Review for duplicates or verify legitimacy'
                    });
                }
            }

            // Check suspicious patterns
            for (const pattern of config.suspicious_patterns || []) {
                if (this._evaluateClusteringPattern(pattern, accountContacts, account)) {
                    anomalies.push({
                        type: ANOMALY_TYPES.CONTACT_CLUSTERING,
                        severity: SEVERITY.MEDIUM,
                        recordId: accountId,
                        recordType: 'Account',
                        details: {
                            accountName: account.Name || account.name,
                            pattern: pattern.name,
                            contactCount: accountContacts.length
                        },
                        confidence: 0.65,
                        message: pattern.message,
                        suggestedAction: 'Review contact data quality'
                    });
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect revenue-to-employee ratio anomalies
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectRevenueEmployeeRatioAnomalies(accounts) {
        const anomalies = [];
        const config = this.patterns.revenue_employee_ratio;
        if (!config) return anomalies;

        const benchmarks = config.industry_benchmarks || {};
        const tolerance = config.tolerance_percent || 25;

        for (const account of accounts) {
            const revenue = account.AnnualRevenue || account.annualRevenue || account.annual_revenue;
            const employees = account.NumberOfEmployees || account.numberOfEmployees || account.number_of_employees;

            if (!revenue || !employees || employees === 0) continue;

            const industry = (account.Industry || account.industry || 'default').toLowerCase();
            const benchmark = benchmarks[industry] || benchmarks.default;

            if (!benchmark) continue;

            const revenuePerEmployee = revenue / employees;
            const minExpected = benchmark.min_per_employee * (1 - tolerance / 100);
            const maxExpected = benchmark.max_per_employee * (1 + tolerance / 100);

            if (revenuePerEmployee < minExpected || revenuePerEmployee > maxExpected) {
                anomalies.push({
                    type: ANOMALY_TYPES.REVENUE_EMPLOYEE_RATIO,
                    severity: config.severity || SEVERITY.LOW,
                    recordId: account.Id || account.id,
                    recordType: 'Account',
                    details: {
                        accountName: account.Name || account.name,
                        industry,
                        revenue,
                        employees,
                        revenuePerEmployee: Math.round(revenuePerEmployee),
                        expectedRange: {
                            min: benchmark.min_per_employee,
                            max: benchmark.max_per_employee
                        }
                    },
                    confidence: 0.5,
                    message: `Revenue per employee ($${Math.round(revenuePerEmployee).toLocaleString()}) is outside expected range for ${industry}`,
                    suggestedAction: 'Verify revenue and employee count data'
                });
            }
        }

        return anomalies;
    }

    /**
     * Detect duplicate indicators
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectDuplicateIndicators(accounts) {
        const anomalies = [];
        const config = this.patterns.duplicate_indicators;
        if (!config) return anomalies;

        const signals = config.signals || {};

        // Index by various fields for comparison
        const websiteIndex = new Map();
        const phoneIndex = new Map();

        for (const account of accounts) {
            const website = this._normalizeWebsite(account.Website || account.website);
            const phone = this._normalizePhone(account.Phone || account.phone);

            if (website) {
                if (!websiteIndex.has(website)) {
                    websiteIndex.set(website, []);
                }
                websiteIndex.get(website).push(account);
            }

            if (phone) {
                if (!phoneIndex.has(phone)) {
                    phoneIndex.set(phone, []);
                }
                phoneIndex.get(phone).push(account);
            }
        }

        // Check same website, different name
        if (signals.same_website_different_name) {
            for (const [website, accountsWithWebsite] of websiteIndex) {
                if (accountsWithWebsite.length > 1) {
                    const names = new Set(accountsWithWebsite.map(a =>
                        (a.Name || a.name || '').toLowerCase().trim()
                    ));

                    if (names.size > 1) {
                        anomalies.push({
                            type: ANOMALY_TYPES.DUPLICATE_INDICATOR,
                            severity: SEVERITY.HIGH,
                            recordId: accountsWithWebsite[0].Id || accountsWithWebsite[0].id,
                            recordType: 'Account',
                            relatedRecordId: accountsWithWebsite[1].Id || accountsWithWebsite[1].id,
                            details: {
                                signal: 'same_website_different_name',
                                website,
                                accountNames: accountsWithWebsite.map(a => a.Name || a.name)
                            },
                            confidence: signals.same_website_different_name.weight || 0.9,
                            message: signals.same_website_different_name.message,
                            suggestedAction: 'Review for potential duplicate and merge'
                        });
                    }
                }
            }
        }

        // Check same phone, different account
        if (signals.same_phone_different_account) {
            for (const [phone, accountsWithPhone] of phoneIndex) {
                if (accountsWithPhone.length > 1) {
                    anomalies.push({
                        type: ANOMALY_TYPES.DUPLICATE_INDICATOR,
                        severity: SEVERITY.HIGH,
                        recordId: accountsWithPhone[0].Id || accountsWithPhone[0].id,
                        recordType: 'Account',
                        relatedRecordId: accountsWithPhone[1].Id || accountsWithPhone[1].id,
                        details: {
                            signal: 'same_phone_different_account',
                            phone,
                            accountNames: accountsWithPhone.map(a => a.Name || a.name)
                        },
                        confidence: signals.same_phone_different_account.weight || 0.8,
                        message: signals.same_phone_different_account.message,
                        suggestedAction: 'Review for potential duplicate'
                    });
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect email pattern anomalies
     * @param {Object[]} contacts - Contact records
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Detected anomalies
     */
    detectEmailPatternAnomalies(contacts, accounts = []) {
        const anomalies = [];
        const config = this.patterns.email_patterns;
        if (!config) return anomalies;

        const suspiciousDomains = (config.suspicious_domains || []).map(d => d.toLowerCase());
        const accountMap = new Map(accounts.map(a => [a.Id || a.id, a]));

        for (const contact of contacts) {
            const email = (contact.Email || contact.email || '').toLowerCase();
            if (!email || !email.includes('@')) continue;

            const domain = email.split('@')[1];
            const accountId = contact.AccountId || contact.accountId;
            const account = accountMap.get(accountId);

            // Check for personal email on business contact
            if (suspiciousDomains.includes(domain)) {
                const accountType = account?.Type || account?.type || '';

                // Skip if matches exception context
                const isException = (config.exception_contexts || []).some(ctx => {
                    const title = (contact.Title || contact.title || '').toLowerCase();
                    return title.includes(ctx.toLowerCase());
                });

                if (!isException && accountType.toLowerCase() === 'business') {
                    anomalies.push({
                        type: ANOMALY_TYPES.EMAIL_PATTERN,
                        severity: config.severity || SEVERITY.MEDIUM,
                        recordId: contact.Id || contact.id,
                        recordType: 'Contact',
                        details: {
                            email,
                            emailDomain: domain,
                            accountType,
                            pattern: 'personal_email_business_contact'
                        },
                        confidence: 0.7,
                        message: 'Personal email used for business contact',
                        suggestedAction: 'Verify or obtain business email'
                    });
                }
            }

            // Check for email domain mismatch with company website
            if (account) {
                const website = this._normalizeWebsite(account.Website || account.website);
                if (website && !domain.includes(website) && !website.includes(domain)) {
                    // Only flag if neither is a subset of the other
                    const domainBase = domain.split('.')[0];
                    const websiteBase = website.split('.')[0];

                    if (domainBase !== websiteBase && !suspiciousDomains.includes(domain)) {
                        anomalies.push({
                            type: ANOMALY_TYPES.EMAIL_PATTERN,
                            severity: SEVERITY.LOW,
                            recordId: contact.Id || contact.id,
                            recordType: 'Contact',
                            details: {
                                email,
                                emailDomain: domain,
                                companyWebsite: website,
                                pattern: 'mismatched_email_company'
                            },
                            confidence: 0.5,
                            message: "Email domain doesn't match company website",
                            suggestedAction: 'Verify email is correct for this contact'
                        });
                    }
                }
            }
        }

        return anomalies;
    }

    /**
     * Detect phone pattern anomalies
     * @param {Object[]} contacts - Contact records
     * @returns {Object[]} Detected anomalies
     */
    detectPhonePatternAnomalies(contacts) {
        const anomalies = [];
        const config = this.patterns.phone_patterns;
        if (!config) return anomalies;

        const patterns = config.suspicious_patterns || [];

        for (const contact of contacts) {
            const phone = contact.Phone || contact.phone || '';
            const directPhone = contact.DirectPhone || contact.directPhone || contact.MobilePhone || contact.mobilePhone || '';

            for (const pattern of patterns) {
                const regex = new RegExp(pattern.pattern);
                const phoneToCheck = pattern.field === 'direct_phone' ? directPhone : phone;

                if (phoneToCheck && regex.test(phoneToCheck.replace(/\D/g, ''))) {
                    anomalies.push({
                        type: ANOMALY_TYPES.PHONE_PATTERN,
                        severity: config.severity || SEVERITY.LOW,
                        recordId: contact.Id || contact.id,
                        recordType: 'Contact',
                        details: {
                            phone: phoneToCheck,
                            pattern: pattern.name,
                            field: pattern.field || 'phone'
                        },
                        confidence: 0.6,
                        message: pattern.message,
                        suggestedAction: 'Verify phone number'
                    });
                }
            }
        }

        return anomalies;
    }

    /**
     * Suggest correction for an anomaly
     * @param {Object} anomaly - Detected anomaly
     * @param {Object} data - Available data for suggestion
     * @returns {Object|null} Suggested correction
     */
    suggestCorrection(anomaly, data = {}) {
        switch (anomaly.type) {
            case ANOMALY_TYPES.ROLE_ACCOUNT_MISMATCH:
                return this._suggestAccountMatch(anomaly, data.accounts || []);

            case ANOMALY_TYPES.GOVERNMENT_HIERARCHY:
                return this._suggestHierarchyCorrection(anomaly, data.accounts || []);

            case ANOMALY_TYPES.DUPLICATE_INDICATOR:
                return this._suggestMergeTarget(anomaly);

            default:
                return null;
        }
    }

    /**
     * Suggest a better account match for role-account mismatch
     * @private
     */
    _suggestAccountMatch(anomaly, accounts) {
        const expectedType = anomaly.details?.expectedAccountType;
        const expectedKeywords = anomaly.details?.expectedKeywords || [];

        // Find accounts matching expected type
        const matches = accounts.filter(a => {
            const name = (a.Name || a.name || '').toLowerCase();
            return expectedKeywords.some(kw => name.includes(kw.toLowerCase()));
        });

        if (matches.length === 0) return null;

        // Score matches by relevance
        const scoredMatches = matches.map(a => {
            let score = 0;
            const name = (a.Name || a.name || '').toLowerCase();

            for (const kw of expectedKeywords) {
                if (name.includes(kw.toLowerCase())) score += 1;
            }

            return { account: a, score };
        });

        scoredMatches.sort((a, b) => b.score - a.score);

        return {
            suggestedTarget: {
                id: scoredMatches[0].account.Id || scoredMatches[0].account.id,
                name: scoredMatches[0].account.Name || scoredMatches[0].account.name
            },
            confidence: Math.min(0.9, 0.5 + (scoredMatches[0].score * 0.1)),
            rationale: `Account name contains expected keywords for ${expectedType} role`,
            alternatives: scoredMatches.slice(1, 4).map(m => ({
                id: m.account.Id || m.account.id,
                name: m.account.Name || m.account.name,
                score: m.score
            }))
        };
    }

    /**
     * Suggest hierarchy correction for government accounts
     * @private
     */
    _suggestHierarchyCorrection(anomaly, accounts) {
        const jurisdiction = anomaly.details?.jurisdiction;
        const expectedParent = anomaly.details?.expectedParent;

        if (!expectedParent) return null;

        // Check if parent exists
        const parentMatch = accounts.find(a => {
            const name = (a.Name || a.name || '').toLowerCase();
            return name.includes(expectedParent.toLowerCase());
        });

        if (parentMatch) {
            return {
                suggestedTarget: {
                    id: parentMatch.Id || parentMatch.id,
                    name: parentMatch.Name || parentMatch.name
                },
                confidence: 0.8,
                rationale: `Found existing parent account matching "${expectedParent}"`,
                action: 'set_parent_relationship'
            };
        }

        return {
            suggestedTarget: null,
            confidence: 0.7,
            rationale: `Parent account "${expectedParent}" should be created`,
            action: 'create_parent_account',
            suggestedAccountName: expectedParent
        };
    }

    /**
     * Suggest merge target for duplicate indicators
     * @private
     */
    _suggestMergeTarget(anomaly) {
        const accountNames = anomaly.details?.accountNames || [];

        if (accountNames.length < 2) return null;

        // Prefer the longer/more complete name as survivor
        const survivor = accountNames.reduce((a, b) =>
            (a.length >= b.length) ? a : b
        );

        return {
            suggestedTarget: {
                name: survivor
            },
            confidence: anomaly.confidence || 0.8,
            rationale: 'Recommending more complete name as merge survivor',
            action: 'merge_accounts',
            recordsToMerge: accountNames.filter(n => n !== survivor)
        };
    }

    // Helper methods

    _normalizeAddress(account) {
        const street = account.BillingStreet || account.billingStreet ||
            account.ShippingStreet || account.shippingStreet || '';
        const city = account.BillingCity || account.billingCity ||
            account.ShippingCity || account.shippingCity || '';
        const state = account.BillingState || account.billingState ||
            account.ShippingState || account.shippingState || '';

        if (!street && !city) return null;

        return `${street} ${city} ${state}`.toLowerCase().trim();
    }

    _normalizeWebsite(website) {
        if (!website) return null;
        return website.toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/$/, '');
    }

    _normalizePhone(phone) {
        if (!phone) return null;
        return phone.replace(/\D/g, '');
    }

    _areAccountsLinked(acc1, acc2) {
        const id1 = acc1.Id || acc1.id;
        const id2 = acc2.Id || acc2.id;
        const parent1 = acc1.ParentId || acc1.parentId;
        const parent2 = acc2.ParentId || acc2.parentId;

        return parent1 === id2 || parent2 === id1 || (parent1 && parent1 === parent2);
    }

    _isGovernmentAccount(account) {
        const name = (account.Name || account.name || '').toLowerCase();
        const type = (account.Type || account.type || '').toLowerCase();
        const industry = (account.Industry || account.industry || '').toLowerCase();

        const govIndicators = [
            'city of', 'county of', 'state of', 'town of', 'village of',
            'department', 'police', 'fire', 'sheriff', 'school district',
            'federal', 'municipal', 'public'
        ];

        return type.includes('government') ||
            industry.includes('government') ||
            govIndicators.some(ind => name.includes(ind));
    }

    _extractJurisdiction(account) {
        const name = account.Name || account.name || '';

        // Try to extract jurisdiction from name patterns
        const patterns = [
            /^city of (.+?)(?:\s+(?:police|fire|public|department))?$/i,
            /^county of (.+?)(?:\s+(?:sheriff|assessor|clerk))?$/i,
            /^town of (.+)/i,
            /^village of (.+)/i
        ];

        for (const pattern of patterns) {
            const match = name.match(pattern);
            if (match) return match[1].trim();
        }

        return null;
    }

    _evaluateClusteringPattern(pattern, contacts, account) {
        const condition = pattern.condition || '';

        // Simple condition evaluation
        if (condition.includes('executives_count')) {
            const execTitles = ['ceo', 'cfo', 'cto', 'cio', 'coo', 'president', 'vp', 'vice president', 'director'];
            const execCount = contacts.filter(c => {
                const title = (c.Title || c.title || '').toLowerCase();
                return execTitles.some(t => title.includes(t));
            }).length;

            const employeeCount = account.NumberOfEmployees || account.numberOfEmployees || 1000;

            if (condition.includes('executives_count > 5') && execCount > 5 && employeeCount < 100) {
                return true;
            }
        }

        if (condition.includes('unique_email_domains')) {
            const domains = new Set(contacts.map(c => {
                const email = c.Email || c.email || '';
                return email.includes('@') ? email.split('@')[1] : null;
            }).filter(Boolean));

            if (condition.includes('unique_email_domains == 1') && domains.size === 1 && contacts.length > 20) {
                return true;
            }
        }

        return false;
    }

    _calculateAggregateScore(anomalies) {
        let score = 0;
        for (const anomaly of anomalies) {
            const weight = this.scoringConfig.severity_weights[anomaly.severity] || 1;
            score += weight;
        }
        return score;
    }

    _groupBySeverity(anomalies) {
        const grouped = {};
        for (const severity of Object.values(SEVERITY)) {
            grouped[severity] = anomalies.filter(a => a.severity === severity).length;
        }
        return grouped;
    }

    _groupByType(anomalies) {
        const grouped = {};
        for (const anomaly of anomalies) {
            grouped[anomaly.type] = (grouped[anomaly.type] || 0) + 1;
        }
        return grouped;
    }

    _determineActionRequired(aggregateScore) {
        const thresholds = this.scoringConfig.thresholds;

        if (aggregateScore >= thresholds.require_manual_approval) {
            return 'require_manual_approval';
        }
        if (aggregateScore >= thresholds.block_automation) {
            return 'block_automation';
        }
        if (aggregateScore >= thresholds.flag_for_review) {
            return 'flag_for_review';
        }
        return 'none';
    }

    /**
     * Get severity constants
     */
    static get SEVERITY() {
        return { ...SEVERITY };
    }

    /**
     * Get anomaly type constants
     */
    static get TYPES() {
        return { ...ANOMALY_TYPES };
    }
}

module.exports = {
    AnomalyDetectionEngine,
    SEVERITY,
    ANOMALY_TYPES
};
