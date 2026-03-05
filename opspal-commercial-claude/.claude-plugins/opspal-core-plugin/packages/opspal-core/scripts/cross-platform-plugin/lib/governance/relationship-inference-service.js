/**
 * Relationship Inference Service
 *
 * Infers and suggests relationships between CRM entities including
 * parent-child hierarchies, contact-account mappings, and entity groupings.
 *
 * @module governance/relationship-inference-service
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Relationship types
 */
const RELATIONSHIP_TYPES = {
    PARENT_CHILD: 'parent_child',
    SIBLING: 'sibling',
    AFFILIATE: 'affiliate',
    CONTACT_ACCOUNT: 'contact_account',
    SUBSIDIARY: 'subsidiary',
    DIVISION: 'division',
    DEPARTMENT: 'department'
};

/**
 * Inference confidence levels
 */
const CONFIDENCE = {
    VERIFIED: 'verified',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    SPECULATIVE: 'speculative'
};

/**
 * Relationship Inference Service
 */
class RelationshipInferenceService {
    /**
     * Create a relationship inference service
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Dependencies
        this.anomalyDetector = options.anomalyDetector || null;
        this.entityGraph = options.entityGraph || null;

        // Configuration
        this.nameSimilarityThreshold = options.nameSimilarityThreshold || 0.75;
        this.addressMatchWeight = options.addressMatchWeight || 0.3;
        this.domainMatchWeight = options.domainMatchWeight || 0.4;
        this.industryMatchWeight = options.industryMatchWeight || 0.2;

        // Government hierarchy patterns
        this.govHierarchyPatterns = options.govHierarchyPatterns || this._getDefaultGovPatterns();

        // Corporate hierarchy indicators
        this.corporateIndicators = options.corporateIndicators || {
            subsidiary: ['subsidiary', 'inc', 'llc', 'corp', 'division'],
            division: ['division', 'unit', 'group', 'department'],
            regional: ['north', 'south', 'east', 'west', 'regional', 'local']
        };

        // Cache
        this._cache = new Map();
    }

    /**
     * Get default government hierarchy patterns
     * @private
     */
    _getDefaultGovPatterns() {
        return {
            federal: {
                level: 1,
                patterns: ['federal', 'national', 'u.s.', 'united states'],
                childLevels: ['state', 'agency']
            },
            state: {
                level: 2,
                patterns: ['state of', 'commonwealth of'],
                childLevels: ['county', 'agency']
            },
            county: {
                level: 3,
                patterns: ['county of', 'county'],
                childLevels: ['city', 'township', 'department']
            },
            city: {
                level: 4,
                patterns: ['city of', 'town of', 'village of', 'municipal'],
                childLevels: ['department']
            },
            department: {
                level: 5,
                patterns: ['police', 'fire', 'public works', 'parks', 'water', 'utilities'],
                childLevels: []
            }
        };
    }

    /**
     * Infer parent-child relationships for accounts
     * @param {Object[]} accounts - Account records
     * @param {Object} options - Inference options
     * @returns {Object} Inferred relationships
     */
    inferParentChildRelationships(accounts, options = {}) {
        const startTime = Date.now();
        const suggestions = [];
        const processed = new Set();

        // Index accounts by various attributes
        const nameIndex = new Map();
        const domainIndex = new Map();
        const addressIndex = new Map();

        for (const account of accounts) {
            const id = account.Id || account.id;
            const name = (account.Name || account.name || '').toLowerCase();
            const domain = this._extractDomain(account);
            const address = this._normalizeAddress(account);

            // Store in indices
            nameIndex.set(id, { account, name });

            if (domain) {
                if (!domainIndex.has(domain)) {
                    domainIndex.set(domain, []);
                }
                domainIndex.get(domain).push(account);
            }

            if (address) {
                if (!addressIndex.has(address)) {
                    addressIndex.set(address, []);
                }
                addressIndex.get(address).push(account);
            }
        }

        // Check government hierarchies first
        const govSuggestions = this._inferGovernmentHierarchies(accounts);
        suggestions.push(...govSuggestions);
        for (const s of govSuggestions) {
            processed.add(`${s.childId}-${s.parentId}`);
        }

        // Check corporate hierarchies by domain
        for (const [domain, accountsWithDomain] of domainIndex) {
            if (accountsWithDomain.length > 1) {
                const corpSuggestions = this._inferCorporateHierarchy(accountsWithDomain, domain);
                for (const s of corpSuggestions) {
                    const key = `${s.childId}-${s.parentId}`;
                    if (!processed.has(key)) {
                        suggestions.push(s);
                        processed.add(key);
                    }
                }
            }
        }

        // Check by name similarity
        const nameSuggestions = this._inferByNameSimilarity(accounts, nameIndex);
        for (const s of nameSuggestions) {
            const key = `${s.childId}-${s.parentId}`;
            if (!processed.has(key)) {
                suggestions.push(s);
                processed.add(key);
            }
        }

        return {
            suggestions,
            summary: {
                totalSuggestions: suggestions.length,
                byType: this._groupByType(suggestions),
                byConfidence: this._groupByConfidence(suggestions),
                highConfidenceCount: suggestions.filter(s =>
                    s.confidence >= 0.8 || s.confidenceLevel === CONFIDENCE.HIGH
                ).length
            },
            analyzedAt: new Date().toISOString(),
            duration_ms: Date.now() - startTime
        };
    }

    /**
     * Infer government hierarchies
     * @private
     */
    _inferGovernmentHierarchies(accounts) {
        const suggestions = [];
        const govAccounts = accounts.filter(a => this._isGovernmentAccount(a));

        if (govAccounts.length < 2) return suggestions;

        // Group by jurisdiction
        const jurisdictionGroups = new Map();

        for (const account of govAccounts) {
            const govLevel = this._determineGovLevel(account);
            const jurisdiction = this._extractJurisdiction(account);

            if (!jurisdiction) continue;

            const key = `${jurisdiction}`;
            if (!jurisdictionGroups.has(key)) {
                jurisdictionGroups.set(key, []);
            }
            jurisdictionGroups.get(key).push({ account, govLevel });
        }

        // Within each jurisdiction, infer parent-child based on gov level
        for (const [jurisdiction, accountsInJurisdiction] of jurisdictionGroups) {
            // Sort by government level (lower = higher in hierarchy)
            accountsInJurisdiction.sort((a, b) =>
                (this.govHierarchyPatterns[a.govLevel]?.level || 99) -
                (this.govHierarchyPatterns[b.govLevel]?.level || 99)
            );

            // Connect each level to the one above it
            for (let i = 1; i < accountsInJurisdiction.length; i++) {
                const child = accountsInJurisdiction[i];
                const parent = accountsInJurisdiction[i - 1];

                // Check if this child level can have this parent level
                const childConfig = this.govHierarchyPatterns[child.govLevel];
                const parentConfig = this.govHierarchyPatterns[parent.govLevel];

                if (parentConfig?.childLevels?.includes(child.govLevel)) {
                    const childId = child.account.Id || child.account.id;
                    const parentId = parent.account.Id || parent.account.id;

                    // Skip if relationship already exists
                    if (child.account.ParentId === parentId) continue;

                    suggestions.push({
                        type: RELATIONSHIP_TYPES.PARENT_CHILD,
                        subtype: 'government_hierarchy',
                        childId,
                        childName: child.account.Name || child.account.name,
                        parentId,
                        parentName: parent.account.Name || parent.account.name,
                        confidence: 0.85,
                        confidenceLevel: CONFIDENCE.HIGH,
                        rationale: `${child.govLevel} level entity should be child of ${parent.govLevel} in ${jurisdiction}`,
                        jurisdiction,
                        govLevels: {
                            child: child.govLevel,
                            parent: parent.govLevel
                        }
                    });
                }
            }
        }

        return suggestions;
    }

    /**
     * Infer corporate hierarchy from accounts with same domain
     * @private
     */
    _inferCorporateHierarchy(accountsWithDomain, domain) {
        const suggestions = [];

        if (accountsWithDomain.length < 2) return suggestions;

        // Find potential parent (usually the one without subsidiary/division indicators)
        let potentialParent = null;
        const potentialChildren = [];

        for (const account of accountsWithDomain) {
            const name = (account.Name || account.name || '').toLowerCase();
            const isSubsidiary = this._hasSubsidiaryIndicators(name);
            const isDivision = this._hasDivisionIndicators(name);
            const isRegional = this._hasRegionalIndicators(name);

            if (!isSubsidiary && !isDivision && !isRegional) {
                if (!potentialParent || name.length < (potentialParent.Name || potentialParent.name || '').length) {
                    potentialParent = account;
                }
            } else {
                potentialChildren.push({
                    account,
                    type: isSubsidiary ? 'subsidiary' : (isDivision ? 'division' : 'regional')
                });
            }
        }

        if (potentialParent && potentialChildren.length > 0) {
            const parentId = potentialParent.Id || potentialParent.id;
            const parentName = potentialParent.Name || potentialParent.name;

            for (const child of potentialChildren) {
                const childId = child.account.Id || child.account.id;

                // Skip if relationship already exists
                if (child.account.ParentId === parentId) continue;

                suggestions.push({
                    type: RELATIONSHIP_TYPES.PARENT_CHILD,
                    subtype: child.type,
                    childId,
                    childName: child.account.Name || child.account.name,
                    parentId,
                    parentName,
                    confidence: 0.7,
                    confidenceLevel: CONFIDENCE.MEDIUM,
                    rationale: `Accounts share domain "${domain}" and child has ${child.type} indicators`,
                    sharedDomain: domain
                });
            }
        }

        return suggestions;
    }

    /**
     * Infer relationships by name similarity
     * @private
     */
    _inferByNameSimilarity(accounts, nameIndex) {
        const suggestions = [];
        const checked = new Set();

        for (const account of accounts) {
            const id = account.Id || account.id;
            const name = (account.Name || account.name || '').toLowerCase();

            // Skip if already has parent
            if (account.ParentId || account.parentId) continue;

            // Look for potential parent with similar but shorter name
            for (const [otherId, otherData] of nameIndex) {
                if (otherId === id) continue;

                const key = [id, otherId].sort().join('-');
                if (checked.has(key)) continue;
                checked.add(key);

                const otherName = otherData.name;
                const otherAccount = otherData.account;

                // Check if one name contains the other (potential parent-child)
                if (name.includes(otherName) && name.length > otherName.length + 5) {
                    // The shorter name might be the parent
                    suggestions.push({
                        type: RELATIONSHIP_TYPES.PARENT_CHILD,
                        subtype: 'name_containment',
                        childId: id,
                        childName: account.Name || account.name,
                        parentId: otherId,
                        parentName: otherAccount.Name || otherAccount.name,
                        confidence: 0.6,
                        confidenceLevel: CONFIDENCE.MEDIUM,
                        rationale: 'Child name contains parent name, suggesting organizational relationship'
                    });
                } else if (otherName.includes(name) && otherName.length > name.length + 5) {
                    // This account might be the parent
                    suggestions.push({
                        type: RELATIONSHIP_TYPES.PARENT_CHILD,
                        subtype: 'name_containment',
                        childId: otherId,
                        childName: otherAccount.Name || otherAccount.name,
                        parentId: id,
                        parentName: account.Name || account.name,
                        confidence: 0.6,
                        confidenceLevel: CONFIDENCE.MEDIUM,
                        rationale: 'Child name contains parent name, suggesting organizational relationship'
                    });
                } else {
                    // Check string similarity for sibling relationship
                    const similarity = this._calculateNameSimilarity(name, otherName);
                    if (similarity >= this.nameSimilarityThreshold) {
                        suggestions.push({
                            type: RELATIONSHIP_TYPES.SIBLING,
                            subtype: 'name_similarity',
                            account1Id: id,
                            account1Name: account.Name || account.name,
                            account2Id: otherId,
                            account2Name: otherAccount.Name || otherAccount.name,
                            confidence: similarity * 0.8,
                            confidenceLevel: similarity >= 0.9 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
                            rationale: `Names are ${Math.round(similarity * 100)}% similar`,
                            similarity
                        });
                    }
                }
            }
        }

        return suggestions;
    }

    /**
     * Find better account match for a contact
     * @param {Object} contact - Contact record
     * @param {Object[]} accounts - Available accounts
     * @param {Object} options - Options
     * @returns {Object|null} Suggested account match
     */
    findBetterAccountMatch(contact, accounts, options = {}) {
        const currentAccountId = contact.AccountId || contact.accountId;
        const title = (contact.Title || contact.title || '').toLowerCase();
        const email = (contact.Email || contact.email || '').toLowerCase();
        const emailDomain = email.includes('@') ? email.split('@')[1] : null;

        const candidates = [];

        for (const account of accounts) {
            const accountId = account.Id || account.id;
            if (accountId === currentAccountId && !options.includeCurrentAccount) continue;

            let score = 0;
            const reasons = [];

            // Email domain match
            if (emailDomain) {
                const accountDomain = this._extractDomain(account);
                if (accountDomain && emailDomain.includes(accountDomain)) {
                    score += this.domainMatchWeight * 100;
                    reasons.push('Email domain matches company website');
                }
            }

            // Title-account type match (for government/industry-specific)
            const titleMatch = this._scoreTitleAccountMatch(title, account);
            if (titleMatch.score > 0) {
                score += titleMatch.score;
                reasons.push(titleMatch.reason);
            }

            // Address proximity (if contact has address)
            const addressMatch = this._scoreAddressMatch(contact, account);
            if (addressMatch.score > 0) {
                score += addressMatch.score;
                reasons.push(addressMatch.reason);
            }

            if (score > 0) {
                candidates.push({
                    account,
                    score,
                    reasons
                });
            }
        }

        if (candidates.length === 0) return null;

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        const best = candidates[0];

        // Only suggest if significantly better than current
        if (currentAccountId) {
            const currentAccount = accounts.find(a =>
                (a.Id || a.id) === currentAccountId
            );
            if (currentAccount) {
                const currentScore = this._scoreAccountForContact(contact, currentAccount);
                if (best.score <= currentScore * 1.2) {
                    return null; // Not significantly better
                }
            }
        }

        return {
            suggestedAccount: {
                id: best.account.Id || best.account.id,
                name: best.account.Name || best.account.name
            },
            score: best.score,
            confidence: Math.min(0.95, best.score / 100),
            confidenceLevel: best.score >= 70 ? CONFIDENCE.HIGH :
                (best.score >= 50 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW),
            reasons: best.reasons,
            alternatives: candidates.slice(1, 4).map(c => ({
                id: c.account.Id || c.account.id,
                name: c.account.Name || c.account.name,
                score: c.score
            }))
        };
    }

    /**
     * Validate a proposed contact move
     * @param {Object} contact - Contact record
     * @param {Object} fromAccount - Source account
     * @param {Object} toAccount - Target account
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     */
    validateContactMove(contact, fromAccount, toAccount, options = {}) {
        const issues = [];
        const warnings = [];
        let isValid = true;

        // Check for job change scenario
        const title = (contact.Title || contact.title || '').toLowerCase();
        const fromName = (fromAccount.Name || fromAccount.name || '').toLowerCase();
        const toName = (toAccount.Name || toAccount.name || '').toLowerCase();

        // If companies are in different industries, might be job change
        const fromIndustry = (fromAccount.Industry || fromAccount.industry || '').toLowerCase();
        const toIndustry = (toAccount.Industry || toAccount.industry || '').toLowerCase();

        if (fromIndustry && toIndustry && fromIndustry !== toIndustry) {
            warnings.push({
                type: 'industry_change',
                message: `Contact moving between different industries (${fromIndustry} → ${toIndustry}). Verify this is not a job change.`
            });
        }

        // Check email domain match
        const email = (contact.Email || contact.email || '').toLowerCase();
        if (email.includes('@')) {
            const emailDomain = email.split('@')[1];
            const toDomain = this._extractDomain(toAccount);

            if (toDomain && !emailDomain.includes(toDomain) && !toDomain.includes(emailDomain.split('.')[0])) {
                warnings.push({
                    type: 'email_mismatch',
                    message: `Contact's email domain (${emailDomain}) doesn't match target account's domain (${toDomain})`
                });
            }
        }

        // Check if contact has opportunities at source account
        if (contact.opportunities?.length > 0) {
            issues.push({
                type: 'has_opportunities',
                message: 'Contact has associated opportunities that need to be reviewed',
                count: contact.opportunities.length
            });
        }

        // Check if moving between unrelated accounts
        if (!this._areAccountsRelated(fromAccount, toAccount)) {
            warnings.push({
                type: 'unrelated_accounts',
                message: 'Source and target accounts do not appear to be related'
            });
        }

        // Determine if valid
        if (issues.length > 0) {
            isValid = false;
        }

        return {
            isValid,
            issues,
            warnings,
            recommendation: this._generateMoveRecommendation(contact, fromAccount, toAccount, issues, warnings),
            shouldConfirmWithUser: warnings.length > 0 || issues.length > 0
        };
    }

    /**
     * Infer siblings (accounts that should share a parent)
     * @param {Object[]} accounts - Account records
     * @returns {Object[]} Sibling suggestions
     */
    inferSiblingRelationships(accounts) {
        const suggestions = [];

        // Group by various attributes that indicate siblings
        const domainGroups = new Map();
        const addressGroups = new Map();

        for (const account of accounts) {
            // Skip accounts with parents (already in hierarchy)
            if (account.ParentId || account.parentId) continue;

            const domain = this._extractDomain(account);
            const address = this._normalizeAddress(account);

            if (domain) {
                if (!domainGroups.has(domain)) {
                    domainGroups.set(domain, []);
                }
                domainGroups.get(domain).push(account);
            }

            if (address) {
                if (!addressGroups.has(address)) {
                    addressGroups.set(address, []);
                }
                addressGroups.get(address).push(account);
            }
        }

        // Check domain groups for potential siblings
        for (const [domain, accountsWithDomain] of domainGroups) {
            if (accountsWithDomain.length > 1 && accountsWithDomain.length <= 10) {
                // All might be siblings under a common parent
                const siblingGroup = {
                    type: RELATIONSHIP_TYPES.SIBLING,
                    subtype: 'shared_domain',
                    accounts: accountsWithDomain.map(a => ({
                        id: a.Id || a.id,
                        name: a.Name || a.name
                    })),
                    sharedAttribute: domain,
                    confidence: 0.7,
                    confidenceLevel: CONFIDENCE.MEDIUM,
                    rationale: `${accountsWithDomain.length} accounts share domain "${domain}" without common parent`,
                    suggestedAction: 'Create or identify parent account'
                };

                suggestions.push(siblingGroup);
            }
        }

        // Check address groups
        for (const [address, accountsAtAddress] of addressGroups) {
            if (accountsAtAddress.length > 1 && accountsAtAddress.length <= 5) {
                // Check if already captured by domain
                const alreadyCaptured = suggestions.some(s =>
                    s.accounts?.some(a =>
                        accountsAtAddress.some(aa => (aa.Id || aa.id) === a.id)
                    )
                );

                if (!alreadyCaptured) {
                    suggestions.push({
                        type: RELATIONSHIP_TYPES.SIBLING,
                        subtype: 'shared_address',
                        accounts: accountsAtAddress.map(a => ({
                            id: a.Id || a.id,
                            name: a.Name || a.name
                        })),
                        sharedAttribute: address,
                        confidence: 0.6,
                        confidenceLevel: CONFIDENCE.MEDIUM,
                        rationale: `${accountsAtAddress.length} accounts share address without common parent`,
                        suggestedAction: 'Establish hierarchy or affiliate relationship'
                    });
                }
            }
        }

        return suggestions;
    }

    // Helper methods

    _isGovernmentAccount(account) {
        const name = (account.Name || account.name || '').toLowerCase();
        const type = (account.Type || account.type || '').toLowerCase();
        const industry = (account.Industry || account.industry || '').toLowerCase();

        const govIndicators = [
            'city of', 'county of', 'state of', 'town of', 'village of',
            'federal', 'municipal', 'government', 'public', 'department of'
        ];

        return type.includes('government') ||
            industry.includes('government') ||
            govIndicators.some(ind => name.includes(ind));
    }

    _determineGovLevel(account) {
        const name = (account.Name || account.name || '').toLowerCase();

        for (const [level, config] of Object.entries(this.govHierarchyPatterns)) {
            if (config.patterns.some(p => name.includes(p.toLowerCase()))) {
                return level;
            }
        }

        return 'department'; // Default to lowest level
    }

    _extractJurisdiction(account) {
        const name = (account.Name || account.name || '');

        const patterns = [
            /^(?:city|town|village) of\s+(.+?)(?:\s+(?:police|fire|public|department|office))?$/i,
            /^(?:county) of\s+(.+?)(?:\s+(?:sheriff|assessor|clerk|office))?$/i,
            /^(.+?)\s+(?:city|county|township)/i
        ];

        for (const pattern of patterns) {
            const match = name.match(pattern);
            if (match) return match[1].trim();
        }

        // Try to extract from address
        const city = account.BillingCity || account.billingCity;
        const state = account.BillingState || account.billingState;

        if (city) return city;
        if (state) return state;

        return null;
    }

    _extractDomain(account) {
        const website = account.Website || account.website;
        if (!website) return null;

        return website.toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/.*$/, '')
            .trim();
    }

    _normalizeAddress(account) {
        const street = account.BillingStreet || account.billingStreet || '';
        const city = account.BillingCity || account.billingCity || '';
        const state = account.BillingState || account.billingState || '';

        if (!street && !city) return null;

        return `${street} ${city} ${state}`
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    _hasSubsidiaryIndicators(name) {
        return this.corporateIndicators.subsidiary.some(ind =>
            name.includes(ind.toLowerCase())
        );
    }

    _hasDivisionIndicators(name) {
        return this.corporateIndicators.division.some(ind =>
            name.includes(ind.toLowerCase())
        );
    }

    _hasRegionalIndicators(name) {
        return this.corporateIndicators.regional.some(ind =>
            name.includes(ind.toLowerCase())
        );
    }

    _calculateNameSimilarity(name1, name2) {
        // Simple Jaccard similarity on word tokens
        const tokens1 = new Set(name1.split(/\s+/).filter(t => t.length > 2));
        const tokens2 = new Set(name2.split(/\s+/).filter(t => t.length > 2));

        if (tokens1.size === 0 || tokens2.size === 0) return 0;

        const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
        const union = new Set([...tokens1, ...tokens2]);

        return intersection.size / union.size;
    }

    _scoreTitleAccountMatch(title, account) {
        const accountName = (account.Name || account.name || '').toLowerCase();
        const industry = (account.Industry || account.industry || '').toLowerCase();

        // Government-specific matches
        const govMatches = {
            'fire': ['fire department', 'fire dept', 'fd', 'fire & rescue', 'emergency'],
            'police': ['police department', 'police dept', 'pd', 'sheriff', 'law enforcement'],
            'education': ['university', 'college', 'school', 'academy', 'institute'],
            'healthcare': ['hospital', 'medical', 'health', 'clinic', 'care']
        };

        for (const [titleType, accountKeywords] of Object.entries(govMatches)) {
            if (title.includes(titleType)) {
                const matches = accountKeywords.some(kw =>
                    accountName.includes(kw) || industry.includes(kw)
                );
                if (matches) {
                    return {
                        score: 40,
                        reason: `Title "${title}" matches account type (${titleType})`
                    };
                }
            }
        }

        return { score: 0, reason: null };
    }

    _scoreAddressMatch(contact, account) {
        const contactCity = (contact.MailingCity || contact.mailingCity || '').toLowerCase();
        const contactState = (contact.MailingState || contact.mailingState || '').toLowerCase();
        const accountCity = (account.BillingCity || account.billingCity || '').toLowerCase();
        const accountState = (account.BillingState || account.billingState || '').toLowerCase();

        if (contactCity && accountCity && contactCity === accountCity) {
            return {
                score: this.addressMatchWeight * 100,
                reason: 'Contact and account share same city'
            };
        }

        if (contactState && accountState && contactState === accountState) {
            return {
                score: this.addressMatchWeight * 50,
                reason: 'Contact and account in same state'
            };
        }

        return { score: 0, reason: null };
    }

    _scoreAccountForContact(contact, account) {
        let score = 0;

        const title = (contact.Title || contact.title || '').toLowerCase();
        const email = (contact.Email || contact.email || '').toLowerCase();

        // Domain match
        if (email.includes('@')) {
            const emailDomain = email.split('@')[1];
            const accountDomain = this._extractDomain(account);
            if (accountDomain && emailDomain.includes(accountDomain)) {
                score += 40;
            }
        }

        // Title match
        const titleMatch = this._scoreTitleAccountMatch(title, account);
        score += titleMatch.score;

        // Address match
        const addressMatch = this._scoreAddressMatch(contact, account);
        score += addressMatch.score;

        return score;
    }

    _areAccountsRelated(acc1, acc2) {
        const id1 = acc1.Id || acc1.id;
        const id2 = acc2.Id || acc2.id;

        // Check direct parent-child
        if (acc1.ParentId === id2 || acc2.ParentId === id1) return true;

        // Check shared parent
        if (acc1.ParentId && acc1.ParentId === acc2.ParentId) return true;

        // Check shared domain
        const domain1 = this._extractDomain(acc1);
        const domain2 = this._extractDomain(acc2);
        if (domain1 && domain2 && domain1 === domain2) return true;

        return false;
    }

    _generateMoveRecommendation(contact, fromAccount, toAccount, issues, warnings) {
        if (issues.length > 0) {
            return {
                action: 'block',
                message: 'Resolve issues before moving contact',
                details: issues.map(i => i.message)
            };
        }

        if (warnings.length > 0) {
            return {
                action: 'confirm',
                message: 'Review warnings and confirm move',
                details: warnings.map(w => w.message)
            };
        }

        return {
            action: 'proceed',
            message: 'Move appears safe to proceed',
            details: []
        };
    }

    _groupByType(suggestions) {
        const grouped = {};
        for (const s of suggestions) {
            const type = s.type || 'unknown';
            grouped[type] = (grouped[type] || 0) + 1;
        }
        return grouped;
    }

    _groupByConfidence(suggestions) {
        const grouped = {};
        for (const s of suggestions) {
            const level = s.confidenceLevel || CONFIDENCE.MEDIUM;
            grouped[level] = (grouped[level] || 0) + 1;
        }
        return grouped;
    }

    /**
     * Set anomaly detector
     */
    setAnomalyDetector(detector) {
        this.anomalyDetector = detector;
    }

    /**
     * Set entity graph
     */
    setEntityGraph(graph) {
        this.entityGraph = graph;
    }

    /**
     * Get relationship type constants
     */
    static get TYPES() {
        return { ...RELATIONSHIP_TYPES };
    }

    /**
     * Get confidence level constants
     */
    static get CONFIDENCE() {
        return { ...CONFIDENCE };
    }
}

module.exports = {
    RelationshipInferenceService,
    RELATIONSHIP_TYPES,
    CONFIDENCE
};
