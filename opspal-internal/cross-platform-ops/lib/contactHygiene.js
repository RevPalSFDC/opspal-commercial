/**
 * Contact Hygiene Core Library
 * Unified logic for contact classification, duplicate detection, and data quality
 */

class UnionFind {
    constructor() {
        this.parent = new Map();
        this.rank = new Map();
        this.edges = new Map(); // Track edge types for each component
    }

    makeSet(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
            this.edges.set(x, new Set());
        }
    }

    find(x) {
        if (!this.parent.has(x)) {
            this.makeSet(x);
        }
        if (this.parent.get(x) !== x) {
            this.parent.set(x, this.find(this.parent.get(x))); // Path compression
        }
        return this.parent.get(x);
    }

    union(x, y, edgeType = 'unknown') {
        this.makeSet(x);
        this.makeSet(y);

        const rootX = this.find(x);
        const rootY = this.find(y);

        if (rootX === rootY) {
            this.edges.get(rootX).add(edgeType);
            return;
        }

        // Union by rank
        if (this.rank.get(rootX) < this.rank.get(rootY)) {
            this.parent.set(rootX, rootY);
            // Merge edge types
            const mergedEdges = new Set([...this.edges.get(rootX), ...this.edges.get(rootY), edgeType]);
            this.edges.set(rootY, mergedEdges);
        } else if (this.rank.get(rootX) > this.rank.get(rootY)) {
            this.parent.set(rootY, rootX);
            const mergedEdges = new Set([...this.edges.get(rootX), ...this.edges.get(rootY), edgeType]);
            this.edges.set(rootX, mergedEdges);
        } else {
            this.parent.set(rootY, rootX);
            const mergedEdges = new Set([...this.edges.get(rootX), ...this.edges.get(rootY), edgeType]);
            this.edges.set(rootX, mergedEdges);
            this.rank.set(rootX, this.rank.get(rootX) + 1);
        }
    }

    getComponents() {
        const components = new Map();

        for (const [node] of this.parent) {
            const root = this.find(node);
            if (!components.has(root)) {
                components.set(root, {
                    nodes: [],
                    edgeTypes: this.edges.get(root) || new Set()
                });
            }
            components.get(root).nodes.push(node);
        }

        return Array.from(components.values());
    }
}

/**
 * Normalize phone number to digits only
 */
function normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    // Handle country codes (1 for US)
    if (digits.length === 11 && digits.startsWith('1')) {
        return digits.substring(1);
    }
    return digits.length === 10 ? digits : digits;
}

/**
 * Normalize email to lowercase, trimmed
 */
function normalizeEmail(email) {
    if (!email) return null;
    const normalized = email.toLowerCase().trim();
    // Basic email validation
    if (!normalized.includes('@') || !normalized.includes('.')) return null;
    return normalized;
}

/**
 * Standardized contact scoring function
 * @param {Object} contact - Contact record
 * @returns {number} - Score
 */
function scoreContact(contact) {
    let score = 0;

    // Email is most valuable
    if (contact.Email) score += 10;

    // Phone numbers
    if (contact.Phone) score += 8;
    if (contact.MobilePhone) score += 5;

    // Name fields
    if (contact.FirstName) score += 3;
    if (contact.LastName) score += 3;

    // Business context
    if (contact.AccountId) score += 5;
    if (contact.Title) score += 2;
    if (contact.Department) score += 2;

    // Location
    if (contact.MailingCity) score += 1;
    if (contact.MailingState) score += 1;

    // Activity indicator
    if (contact.LastActivityDate) score += 10;

    // HubSpot integration (if field exists)
    if (contact.HubSpot_Contact_ID__c) score += 5;

    return score;
}

/**
 * Build duplicate graph using union-find
 * @param {Array} contacts - Array of contact records
 * @returns {Array} - Array of components with edge types
 */
function buildDuplicateGraph(contacts) {
    const uf = new UnionFind();

    // Build indices for matching
    const emailIndex = new Map();
    const phoneIndex = new Map();
    const nameAccountIndex = new Map();

    // First pass: build indices
    contacts.forEach(contact => {
        const email = normalizeEmail(contact.Email);
        const phone = normalizePhone(contact.Phone);
        const mobile = normalizePhone(contact.MobilePhone);

        // Email index
        if (email) {
            if (!emailIndex.has(email)) emailIndex.set(email, []);
            emailIndex.get(email).push(contact.Id);
        }

        // Phone index (both phone and mobile)
        if (phone) {
            if (!phoneIndex.has(phone)) phoneIndex.set(phone, []);
            phoneIndex.get(phone).push(contact.Id);
        }
        if (mobile && mobile !== phone) {
            if (!phoneIndex.has(mobile)) phoneIndex.set(mobile, []);
            phoneIndex.get(mobile).push(contact.Id);
        }

        // Name+Account index (low confidence)
        if (contact.FirstName && contact.LastName && contact.AccountId) {
            const key = `${contact.FirstName.toLowerCase().trim()}_${contact.LastName.toLowerCase().trim()}_${contact.AccountId}`;
            if (!nameAccountIndex.has(key)) nameAccountIndex.set(key, []);
            nameAccountIndex.get(key).push(contact.Id);
        }
    });

    // Second pass: create edges
    // High-confidence edges (email)
    for (const [email, ids] of emailIndex) {
        if (ids.length > 1) {
            for (let i = 1; i < ids.length; i++) {
                uf.union(ids[0], ids[i], 'email');
            }
        }
    }

    // High-confidence edges (phone)
    for (const [phone, ids] of phoneIndex) {
        if (ids.length > 1) {
            for (let i = 1; i < ids.length; i++) {
                uf.union(ids[0], ids[i], 'phone');
            }
        }
    }

    // Low-confidence edges (name+account)
    for (const [key, ids] of nameAccountIndex) {
        if (ids.length > 1) {
            for (let i = 1; i < ids.length; i++) {
                uf.union(ids[0], ids[i], 'name_company');
            }
        }
    }

    return uf.getComponents().filter(c => c.nodes.length > 1);
}

/**
 * Select master record from a component
 * @param {Array} component - Array of contact IDs in the component
 * @param {Map} contactMap - Map of ID to contact record
 * @returns {string} - ID of the master record
 */
function selectMaster(component, contactMap) {
    if (component.length === 0) return null;
    if (component.length === 1) return component[0];

    // Sort by: score (desc), LastModifiedDate (desc), CreatedDate (asc)
    const sorted = component.sort((a, b) => {
        const contactA = contactMap.get(a);
        const contactB = contactMap.get(b);

        // Compare scores
        const scoreA = scoreContact(contactA);
        const scoreB = scoreContact(contactB);
        if (scoreA !== scoreB) return scoreB - scoreA; // Higher score wins

        // Compare LastModifiedDate (newer wins)
        const modA = new Date(contactA.LastModifiedDate || contactA.CreatedDate);
        const modB = new Date(contactB.LastModifiedDate || contactB.CreatedDate);
        if (modA.getTime() !== modB.getTime()) return modB - modA;

        // Compare CreatedDate (older wins as tie-breaker)
        const createdA = new Date(contactA.CreatedDate);
        const createdB = new Date(contactB.CreatedDate);
        if (createdA.getTime() !== createdB.getTime()) return createdA - createdB;

        // Final tie-breaker: ID (deterministic)
        return a.localeCompare(b);
    });

    return sorted[0];
}

/**
 * Classify a contact based on rules
 * @param {Object} contact - Contact record
 * @param {Object} context - Context including duplicates, master mapping
 * @returns {Object} - Classification result
 */
function classifyContact(contact, context = {}) {
    const classification = {
        Id: contact.Id,
        Clean_Status__c: 'OK'
    };

    // Skip if already classified (idempotent) - DISABLED for full reprocessing
    // if (contact.Clean_Status__c && contact.Clean_Status__c !== 'null' && contact.Clean_Status__c !== '') {
    //     return null;
    // }

    const now = new Date();
    const createdDate = new Date(contact.CreatedDate);
    const lastActivity = contact.LastActivityDate ? new Date(contact.LastActivityDate) : null;
    const createdYearsAgo = (now - createdDate) / (365.25 * 24 * 60 * 60 * 1000);
    const lastActivityYearsAgo = lastActivity ? (now - lastActivity) / (365.25 * 24 * 60 * 60 * 1000) : null;

    // Normalize fields for checking
    const email = normalizeEmail(contact.Email);
    const phone = normalizePhone(contact.Phone);
    const mobile = normalizePhone(contact.MobilePhone);
    const name = `${contact.FirstName || ''} ${contact.LastName || ''}`.toLowerCase().trim();

    // Rule 1: No Email AND no Phone/Mobile
    if (!email && !phone && !mobile) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No Email or Phone';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    // Rule 2: Test/placeholder names or domains
    const testPatterns = /\b(test|demo|fake|example|placeholder|dummy|sample)\b/i;
    const testDomains = /@(test|example|placeholder|demo|fake)\./i;
    const noReplyDomains = /@(noreply|no-reply|donotreply|spam|junk)\./i;

    if (testPatterns.test(name) || (email && testDomains.test(email))) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Test/Placeholder Record';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    if (email && noReplyDomains.test(email)) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No-Reply/Spam Domain';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    // Rule 3: Created ≥3y and never any activity
    if (createdYearsAgo >= 3 && !lastActivity) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'No Activity 3+ Years';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    // Rule 4: Last activity ≥3y ago
    if (lastActivityYearsAgo && lastActivityYearsAgo >= 3) {
        classification.Clean_Status__c = 'Delete';
        classification.Delete_Reason__c = 'Inactive 3+ Years';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    // Rule 5: Created ≥5y and (no activity OR last activity ≥2y)
    if (createdYearsAgo >= 5 && (!lastActivity || lastActivityYearsAgo >= 2)) {
        classification.Clean_Status__c = 'Archive';
        classification.Delete_Reason__c = 'Old Inactive Contact';
        // Archive preserves existing Sync_Status
        return classification;
    }

    // Rule 6: Duplicate (from clustering)
    if (context.duplicateMap && context.duplicateMap.has(contact.Id)) {
        const dupInfo = context.duplicateMap.get(contact.Id);

        // Check if it's low-confidence (only name_company edge)
        if (dupInfo.edgeTypes.size === 1 && dupInfo.edgeTypes.has('name_company')) {
            classification.Clean_Status__c = 'Review';
            classification.Delete_Reason__c = `Potential Duplicate (Name+Company) - Master: ${dupInfo.masterId}`;
            // Only set these fields if they exist in the org
            // classification.Master_Contact_Id__c = dupInfo.masterId;
            // classification.Duplicate_Type__c = 'Name+Company';
            classification.Sync_Status__c = 'Not Synced';
        } else {
            classification.Clean_Status__c = 'Duplicate';
            classification.Delete_Reason__c = `Master: ${dupInfo.masterId}`;
            // Only set these fields if they exist in the org
            // classification.Is_Duplicate__c = true;
            // classification.Master_Contact_Id__c = dupInfo.masterId;
            // classification.Duplicate_Type__c = Array.from(dupInfo.edgeTypes).join(', ');
            classification.Sync_Status__c = 'Not Synced';
        }
        return classification;
    }

    // Rule 7: Missing critical info
    if (!contact.LastName || (!email && !phone && !mobile)) {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = 'Missing Critical Info';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    // Rule 8: Email bounce/unsubscribe indicators
    if (contact.HasOptedOutOfEmail === 'true' || contact.HasOptedOutOfEmail === true) {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = 'Email Opt-Out';
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    if (contact.EmailBouncedReason && contact.EmailBouncedReason !== 'null' && contact.EmailBouncedReason !== '') {
        classification.Clean_Status__c = 'Review';
        classification.Delete_Reason__c = `Email Bounce: ${contact.EmailBouncedReason}`;
        classification.Sync_Status__c = 'Not Synced';
        return classification;
    }

    // Default: OK status (preserves existing Sync_Status, clears Delete_Reason)
    classification.Delete_Reason__c = ''; // Explicitly clear Delete_Reason for OK status
    return classification;
}

/**
 * Validate picklist values against allowed values
 * @param {Object} record - Record with picklist fields
 * @param {Object} picklistValues - Map of field to allowed values
 * @returns {Object} - Validated record with safe defaults
 */
function validatePicklistValues(record, picklistValues) {
    const validated = { ...record };

    // Validate Clean_Status__c
    if (validated.Clean_Status__c && picklistValues.Clean_Status__c) {
        if (!picklistValues.Clean_Status__c.includes(validated.Clean_Status__c)) {
            console.warn(`Invalid picklist value for Clean_Status__c: ${validated.Clean_Status__c}, defaulting to 'Review'`);
            validated.Clean_Status__c = 'Review';
        }
    }

    // Validate Sync_Status__c
    if (validated.Sync_Status__c && picklistValues.Sync_Status__c) {
        if (!picklistValues.Sync_Status__c.includes(validated.Sync_Status__c)) {
            // Default to 'Not Synced' for invalid values
            validated.Sync_Status__c = 'Not Synced';
        }
    }

    return validated;
}

module.exports = {
    scoreContact,
    buildDuplicateGraph,
    selectMaster,
    classifyContact,
    normalizePhone,
    normalizeEmail,
    validatePicklistValues,
    UnionFind
};