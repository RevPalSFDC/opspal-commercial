/**
 * Governance Controller
 *
 * Enforces data governance policies including approval thresholds,
 * protected field rules, rate limiting, and compliance checks.
 *
 * @module governance/governance-controller
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Action outcomes
 */
const ACTION_OUTCOME = {
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PENDING_REVIEW: 'pending_review',
    BLOCKED: 'blocked'
};

/**
 * Approval status
 */
const APPROVAL_STATUS = {
    AUTO_APPROVED: 'auto_approved',
    MANUAL_APPROVED: 'manual_approved',
    PENDING: 'pending',
    REJECTED: 'rejected'
};

/**
 * Governance Controller
 */
class GovernanceController {
    /**
     * Create a governance controller
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        // Load policies configuration
        this.policiesPath = options.policiesPath ||
            path.join(__dirname, '../../..', 'config', 'governance-policies.json');
        this.policies = this._loadPolicies();

        // Thresholds
        this.autoApproveThreshold = this.policies.approval_thresholds?.auto_approve?.threshold || 95;
        this.reviewQueueMinThreshold = this.policies.approval_thresholds?.review_queue?.min_threshold || 80;
        this.rejectThreshold = this.policies.approval_thresholds?.reject?.threshold || 79;

        // Protected fields
        this.protectedFields = this._buildProtectedFieldsSet();

        // Required approval operations
        this.requiredApprovalOps = this._buildRequiredApprovalMap();

        // Rate limiters
        this.rateLimiters = new Map();
        this._initializeRateLimiters();

        // Review queue (in-memory for now, could be persisted)
        this._reviewQueue = [];

        // Audit logger integration
        this.auditLogger = options.auditLogger || null;

        // Notification handler
        this.notificationHandler = options.notificationHandler || null;
    }

    /**
     * Load policies from configuration file
     * @private
     */
    _loadPolicies() {
        try {
            const content = fs.readFileSync(this.policiesPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.warn(`Failed to load governance policies: ${error.message}`);
            return this._getDefaultPolicies();
        }
    }

    /**
     * Get default policies
     * @private
     */
    _getDefaultPolicies() {
        return {
            approval_thresholds: {
                auto_approve: { threshold: 95 },
                review_queue: { min_threshold: 80, max_threshold: 94 },
                reject: { threshold: 79 }
            },
            protected_fields: {
                crm_fields: ['do_not_call', 'do_not_email', 'gdpr_consent', 'lead_source'],
                financial_fields: ['annual_revenue'],
                compliance_fields: ['data_privacy_flag']
            },
            required_approval: {
                operations: []
            },
            rate_limits: {
                enrichment: { max_per_hour: 1000, max_per_day: 10000 },
                deduplication: { max_merges_per_hour: 100, max_merges_per_day: 500 },
                bulk_operations: { max_records_per_batch: 200, max_batches_per_hour: 10 }
            },
            compliance: {
                gdpr: { enabled: true },
                ccpa: { enabled: true }
            }
        };
    }

    /**
     * Build set of protected fields
     * @private
     */
    _buildProtectedFieldsSet() {
        const fields = new Set();
        const protectedConfig = this.policies.protected_fields || {};

        for (const category of Object.values(protectedConfig)) {
            if (Array.isArray(category)) {
                for (const field of category) {
                    fields.add(field.toLowerCase());
                }
            }
        }

        return fields;
    }

    /**
     * Build required approval operations map
     * @private
     */
    _buildRequiredApprovalMap() {
        const map = new Map();
        const ops = this.policies.required_approval?.operations || [];

        for (const op of ops) {
            map.set(op.name, {
                description: op.description,
                approvers: op.approvers || [],
                minApprovals: op.min_approvals || 1,
                threshold: op.threshold
            });
        }

        return map;
    }

    /**
     * Initialize rate limiters
     * @private
     */
    _initializeRateLimiters() {
        const limits = this.policies.rate_limits || {};

        for (const [category, config] of Object.entries(limits)) {
            this.rateLimiters.set(category, {
                config,
                hourly: { count: 0, resetAt: Date.now() + 3600000 },
                daily: { count: 0, resetAt: Date.now() + 86400000 }
            });
        }
    }

    /**
     * Check if an action can be auto-executed
     * @param {Object} action - Action to check
     * @param {number} confidence - Confidence score (0-100)
     * @param {Object} options - Additional options
     * @returns {Object} Approval result
     */
    canAutoExecute(action, confidence, options = {}) {
        const actionType = action.type || action.name;
        const result = {
            approved: false,
            reason: '',
            outcome: null,
            status: null,
            requiredApprovers: [],
            blockedFields: [],
            rateLimitStatus: null
        };

        // Check if operation requires manual approval
        const requiredApproval = this.requiredApprovalOps.get(actionType);
        if (requiredApproval) {
            // Check threshold if applicable
            if (requiredApproval.threshold) {
                const recordCount = action.recordCount || action.records?.length || 1;
                if (recordCount >= requiredApproval.threshold) {
                    result.outcome = ACTION_OUTCOME.PENDING_REVIEW;
                    result.status = APPROVAL_STATUS.PENDING;
                    result.reason = `${actionType} with ${recordCount} records requires manual approval`;
                    result.requiredApprovers = requiredApproval.approvers;
                    return result;
                }
            } else {
                result.outcome = ACTION_OUTCOME.PENDING_REVIEW;
                result.status = APPROVAL_STATUS.PENDING;
                result.reason = `${actionType} always requires manual approval`;
                result.requiredApprovers = requiredApproval.approvers;
                return result;
            }
        }

        // Check for protected field modifications
        if (action.fields || action.changes) {
            const fieldsToModify = action.fields || Object.keys(action.changes || {});
            const blockedFields = fieldsToModify.filter(f =>
                this.protectedFields.has(f.toLowerCase())
            );

            if (blockedFields.length > 0) {
                result.outcome = ACTION_OUTCOME.BLOCKED;
                result.status = APPROVAL_STATUS.REJECTED;
                result.reason = `Cannot modify protected fields: ${blockedFields.join(', ')}`;
                result.blockedFields = blockedFields;
                return result;
            }
        }

        // Check rate limits
        const rateLimitCheck = this._checkRateLimit(actionType, action.recordCount || 1);
        result.rateLimitStatus = rateLimitCheck;

        if (!rateLimitCheck.allowed) {
            result.outcome = ACTION_OUTCOME.BLOCKED;
            result.status = APPROVAL_STATUS.REJECTED;
            result.reason = rateLimitCheck.reason;
            return result;
        }

        // Check confidence threshold
        if (confidence >= this.autoApproveThreshold) {
            result.approved = true;
            result.outcome = ACTION_OUTCOME.APPROVED;
            result.status = APPROVAL_STATUS.AUTO_APPROVED;
            result.reason = `Confidence ${confidence}% meets auto-approval threshold (${this.autoApproveThreshold}%)`;
        } else if (confidence >= this.reviewQueueMinThreshold) {
            result.outcome = ACTION_OUTCOME.PENDING_REVIEW;
            result.status = APPROVAL_STATUS.PENDING;
            result.reason = `Confidence ${confidence}% requires manual review (${this.reviewQueueMinThreshold}-${this.autoApproveThreshold - 1}% range)`;
        } else {
            result.outcome = ACTION_OUTCOME.REJECTED;
            result.status = APPROVAL_STATUS.REJECTED;
            result.reason = `Confidence ${confidence}% below minimum threshold (${this.reviewQueueMinThreshold}%)`;
        }

        return result;
    }

    /**
     * Check rate limits for an operation
     * @private
     */
    _checkRateLimit(actionType, count = 1) {
        // Map action types to rate limit categories
        const categoryMap = {
            'enrichment': 'enrichment',
            'enrich': 'enrichment',
            'account_merge': 'deduplication',
            'merge': 'deduplication',
            'deduplicate': 'deduplication',
            'bulk_update': 'bulk_operations',
            'bulk_delete': 'bulk_operations',
            'bulk_insert': 'bulk_operations'
        };

        const category = categoryMap[actionType] || 'bulk_operations';
        const limiter = this.rateLimiters.get(category);

        if (!limiter) {
            return { allowed: true, category };
        }

        const now = Date.now();

        // Reset counters if needed
        if (now >= limiter.hourly.resetAt) {
            limiter.hourly = { count: 0, resetAt: now + 3600000 };
        }
        if (now >= limiter.daily.resetAt) {
            limiter.daily = { count: 0, resetAt: now + 86400000 };
        }

        const config = limiter.config;
        const hourlyLimit = config.max_per_hour || config.max_merges_per_hour || config.max_batches_per_hour || Infinity;
        const dailyLimit = config.max_per_day || config.max_merges_per_day || Infinity;

        // Check hourly limit
        if (limiter.hourly.count + count > hourlyLimit) {
            return {
                allowed: false,
                category,
                reason: `Hourly rate limit exceeded for ${category} (${limiter.hourly.count}/${hourlyLimit})`,
                retryAfterMs: limiter.hourly.resetAt - now
            };
        }

        // Check daily limit
        if (limiter.daily.count + count > dailyLimit) {
            return {
                allowed: false,
                category,
                reason: `Daily rate limit exceeded for ${category} (${limiter.daily.count}/${dailyLimit})`,
                retryAfterMs: limiter.daily.resetAt - now
            };
        }

        return {
            allowed: true,
            category,
            hourlyRemaining: hourlyLimit - limiter.hourly.count - count,
            dailyRemaining: dailyLimit - limiter.daily.count - count
        };
    }

    /**
     * Record that an operation was executed (for rate limiting)
     * @param {string} actionType - Type of action
     * @param {number} count - Number of operations
     */
    recordExecution(actionType, count = 1) {
        const categoryMap = {
            'enrichment': 'enrichment',
            'enrich': 'enrichment',
            'account_merge': 'deduplication',
            'merge': 'deduplication',
            'deduplicate': 'deduplication',
            'bulk_update': 'bulk_operations',
            'bulk_delete': 'bulk_operations',
            'bulk_insert': 'bulk_operations'
        };

        const category = categoryMap[actionType] || 'bulk_operations';
        const limiter = this.rateLimiters.get(category);

        if (limiter) {
            limiter.hourly.count += count;
            limiter.daily.count += count;
        }
    }

    /**
     * Route action for review
     * @param {Object} action - Action to review
     * @param {Object} context - Action context
     * @returns {Object} Review queue entry
     */
    routeForReview(action, context = {}) {
        const entry = {
            id: `review-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            action,
            context,
            confidence: context.confidence || 0,
            requiredApprovers: context.requiredApprovers || [],
            status: 'pending',
            createdAt: new Date().toISOString(),
            approvals: [],
            rejections: []
        };

        this._reviewQueue.push(entry);

        // Send notification if handler configured
        if (this.notificationHandler) {
            this._sendReviewNotification(entry);
        }

        return entry;
    }

    /**
     * Get pending review items
     * @param {Object} filters - Optional filters
     * @returns {Object[]} Pending items
     */
    getPendingReviews(filters = {}) {
        let items = this._reviewQueue.filter(item => item.status === 'pending');

        if (filters.actionType) {
            items = items.filter(item =>
                (item.action.type || item.action.name) === filters.actionType
            );
        }

        if (filters.minConfidence !== undefined) {
            items = items.filter(item => item.confidence >= filters.minConfidence);
        }

        if (filters.maxConfidence !== undefined) {
            items = items.filter(item => item.confidence <= filters.maxConfidence);
        }

        return items;
    }

    /**
     * Approve a pending review
     * @param {string} reviewId - Review ID
     * @param {string} approverId - ID of approver
     * @param {Object} options - Approval options
     * @returns {Object} Updated review entry
     */
    approveReview(reviewId, approverId, options = {}) {
        const entry = this._reviewQueue.find(item => item.id === reviewId);
        if (!entry) {
            throw new Error(`Review ${reviewId} not found`);
        }

        if (entry.status !== 'pending') {
            throw new Error(`Review ${reviewId} is already ${entry.status}`);
        }

        entry.approvals.push({
            approverId,
            approvedAt: new Date().toISOString(),
            comment: options.comment || ''
        });

        // Check if enough approvals
        const requiredApprovals = this.requiredApprovalOps.get(entry.action.type)?.minApprovals || 1;

        if (entry.approvals.length >= requiredApprovals) {
            entry.status = 'approved';
            entry.resolvedAt = new Date().toISOString();

            // Log to audit
            if (this.auditLogger) {
                this.auditLogger.logAction({
                    type: 'review_approved',
                    reviewId,
                    action: entry.action,
                    approvals: entry.approvals
                });
            }
        }

        return entry;
    }

    /**
     * Reject a pending review
     * @param {string} reviewId - Review ID
     * @param {string} rejecterId - ID of rejecter
     * @param {Object} options - Rejection options
     * @returns {Object} Updated review entry
     */
    rejectReview(reviewId, rejecterId, options = {}) {
        const entry = this._reviewQueue.find(item => item.id === reviewId);
        if (!entry) {
            throw new Error(`Review ${reviewId} not found`);
        }

        if (entry.status !== 'pending') {
            throw new Error(`Review ${reviewId} is already ${entry.status}`);
        }

        entry.rejections.push({
            rejecterId,
            rejectedAt: new Date().toISOString(),
            reason: options.reason || 'No reason provided'
        });

        entry.status = 'rejected';
        entry.resolvedAt = new Date().toISOString();

        // Log to audit
        if (this.auditLogger) {
            this.auditLogger.logAction({
                type: 'review_rejected',
                reviewId,
                action: entry.action,
                rejection: entry.rejections[entry.rejections.length - 1]
            });
        }

        return entry;
    }

    /**
     * Validate compliance for a record or changes
     * @param {Object} record - Record to check
     * @param {Object} changes - Proposed changes
     * @returns {Object} Compliance validation result
     */
    validateCompliance(record, changes = {}) {
        const issues = [];
        const warnings = [];
        const compliance = this.policies.compliance || {};

        // GDPR checks
        if (compliance.gdpr?.enabled) {
            const gdprResult = this._checkGdprCompliance(record, changes);
            issues.push(...gdprResult.issues);
            warnings.push(...gdprResult.warnings);
        }

        // CCPA checks
        if (compliance.ccpa?.enabled) {
            const ccpaResult = this._checkCcpaCompliance(record, changes);
            issues.push(...ccpaResult.issues);
            warnings.push(...ccpaResult.warnings);
        }

        // HIPAA checks (if enabled)
        if (compliance.hipaa?.enabled) {
            const hipaaResult = this._checkHipaaCompliance(record, changes);
            issues.push(...hipaaResult.issues);
            warnings.push(...hipaaResult.warnings);
        }

        return {
            compliant: issues.length === 0,
            issues,
            warnings,
            checkedRegulations: Object.keys(compliance).filter(k => compliance[k]?.enabled),
            checkedAt: new Date().toISOString()
        };
    }

    /**
     * Check GDPR compliance
     * @private
     */
    _checkGdprCompliance(record, changes) {
        const issues = [];
        const warnings = [];
        const gdprConfig = this.policies.compliance?.gdpr || {};
        const personalDataFields = gdprConfig.personal_data_fields || [];

        // Check if modifying personal data without consent
        const modifiedPersonalFields = Object.keys(changes).filter(field =>
            personalDataFields.includes(field.toLowerCase())
        );

        if (modifiedPersonalFields.length > 0) {
            // Check consent
            const hasConsent = record.gdpr_consent === true ||
                record.GdprConsent === true ||
                record.gdpr_consent_date;

            if (!hasConsent) {
                warnings.push({
                    regulation: 'GDPR',
                    type: 'consent_missing',
                    message: `Modifying personal data (${modifiedPersonalFields.join(', ')}) without recorded consent`,
                    fields: modifiedPersonalFields
                });
            }
        }

        // Check for EU region data
        const region = record.BillingCountry || record.Country || record.region;
        const euRegions = gdprConfig.regions || ['EU', 'EEA', 'UK'];

        if (region && euRegions.some(r => region.toUpperCase().includes(r))) {
            // Stricter checks for EU data
            if (!record.gdpr_consent_date && !record.GdprConsentDate) {
                warnings.push({
                    regulation: 'GDPR',
                    type: 'consent_date_missing',
                    message: 'GDPR consent date not recorded for EU region contact',
                    region
                });
            }
        }

        return { issues, warnings };
    }

    /**
     * Check CCPA compliance
     * @private
     */
    _checkCcpaCompliance(record, changes) {
        const issues = [];
        const warnings = [];
        const ccpaConfig = this.policies.compliance?.ccpa || {};

        // Check for California residents
        const state = record.BillingState || record.State || record.MailingState;
        const isCaliforniaResident = state === 'CA' || state === 'California';

        if (isCaliforniaResident) {
            // Check opt-out status
            if (record.ccpa_opt_out || record.CcpaOptOut) {
                issues.push({
                    regulation: 'CCPA',
                    type: 'opted_out',
                    message: 'Contact has opted out under CCPA, cannot process data'
                });
            }

            // Check for sale of data indicators
            if (ccpaConfig.sale_of_data_tracking) {
                if (changes.sold_to_third_party || changes.shared_externally) {
                    if (!record.ccpa_sale_consent) {
                        issues.push({
                            regulation: 'CCPA',
                            type: 'sale_without_consent',
                            message: 'Cannot mark data as sold/shared without CCPA sale consent'
                        });
                    }
                }
            }
        }

        return { issues, warnings };
    }

    /**
     * Check HIPAA compliance
     * @private
     */
    _checkHipaaCompliance(record, changes) {
        const issues = [];
        const warnings = [];
        const hipaaConfig = this.policies.compliance?.hipaa || {};
        const phiFields = hipaaConfig.phi_fields || [];

        // Check if modifying PHI
        const modifiedPhiFields = Object.keys(changes).filter(field =>
            phiFields.includes(field.toLowerCase())
        );

        if (modifiedPhiFields.length > 0) {
            issues.push({
                regulation: 'HIPAA',
                type: 'phi_modification',
                message: `Modifying Protected Health Information (${modifiedPhiFields.join(', ')}) requires special handling`,
                fields: modifiedPhiFields
            });
        }

        return { issues, warnings };
    }

    /**
     * Check if a field is protected
     * @param {string} fieldName - Field name to check
     * @returns {boolean} Whether field is protected
     */
    isFieldProtected(fieldName) {
        return this.protectedFields.has(fieldName.toLowerCase());
    }

    /**
     * Get protected fields list
     * @returns {string[]} Protected field names
     */
    getProtectedFields() {
        return Array.from(this.protectedFields);
    }

    /**
     * Get rate limit status for a category
     * @param {string} category - Rate limit category
     * @returns {Object} Rate limit status
     */
    getRateLimitStatus(category) {
        const limiter = this.rateLimiters.get(category);
        if (!limiter) return null;

        const now = Date.now();

        return {
            category,
            hourly: {
                used: limiter.hourly.count,
                limit: limiter.config.max_per_hour || limiter.config.max_merges_per_hour || limiter.config.max_batches_per_hour || 'unlimited',
                resetsIn: Math.max(0, limiter.hourly.resetAt - now)
            },
            daily: {
                used: limiter.daily.count,
                limit: limiter.config.max_per_day || limiter.config.max_merges_per_day || 'unlimited',
                resetsIn: Math.max(0, limiter.daily.resetAt - now)
            }
        };
    }

    /**
     * Get all rate limit statuses
     * @returns {Object[]} All rate limit statuses
     */
    getAllRateLimitStatuses() {
        const statuses = [];
        for (const category of this.rateLimiters.keys()) {
            statuses.push(this.getRateLimitStatus(category));
        }
        return statuses;
    }

    /**
     * Send review notification
     * @private
     */
    async _sendReviewNotification(entry) {
        if (!this.notificationHandler) return;

        const notification = {
            type: 'review_required',
            title: 'Data Quality Action Requires Review',
            message: `Action "${entry.action.type || entry.action.name}" requires manual approval`,
            details: {
                reviewId: entry.id,
                confidence: entry.confidence,
                requiredApprovers: entry.requiredApprovers,
                recordCount: entry.action.recordCount || entry.action.records?.length || 1
            },
            channels: this.policies.notifications?.triggers?.review_required?.channels || ['slack', 'asana']
        };

        try {
            await this.notificationHandler.send(notification);
        } catch (error) {
            console.error('Failed to send review notification:', error.message);
        }
    }

    /**
     * Override confidence threshold for an action (requires approver)
     * @param {Object} action - Action to override
     * @param {number} newThreshold - New threshold to use
     * @param {string} approverId - ID of approver
     * @param {string} reason - Reason for override
     * @returns {Object} Override result
     */
    overrideConfidenceThreshold(action, newThreshold, approverId, reason) {
        // Log the override
        if (this.auditLogger) {
            this.auditLogger.logAction({
                type: 'threshold_override',
                action: action.type || action.name,
                originalThreshold: this.autoApproveThreshold,
                newThreshold,
                approverId,
                reason,
                timestamp: new Date().toISOString()
            });
        }

        // Return approval with override
        return {
            approved: true,
            outcome: ACTION_OUTCOME.APPROVED,
            status: APPROVAL_STATUS.MANUAL_APPROVED,
            reason: `Threshold overridden by ${approverId}: ${reason}`,
            override: {
                originalThreshold: this.autoApproveThreshold,
                appliedThreshold: newThreshold,
                approverId,
                reason
            }
        };
    }

    /**
     * Set audit logger
     */
    setAuditLogger(logger) {
        this.auditLogger = logger;
    }

    /**
     * Set notification handler
     */
    setNotificationHandler(handler) {
        this.notificationHandler = handler;
    }

    /**
     * Get action outcome constants
     */
    static get OUTCOMES() {
        return { ...ACTION_OUTCOME };
    }

    /**
     * Get approval status constants
     */
    static get STATUS() {
        return { ...APPROVAL_STATUS };
    }
}

module.exports = {
    GovernanceController,
    ACTION_OUTCOME,
    APPROVAL_STATUS
};
