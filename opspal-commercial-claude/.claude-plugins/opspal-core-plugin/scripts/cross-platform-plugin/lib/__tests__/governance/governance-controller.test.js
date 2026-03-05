/**
 * Tests for Governance Controller
 */

'use strict';

const { GovernanceController, ACTION_OUTCOME, APPROVAL_STATUS } = require('../../governance/governance-controller');

describe('GovernanceController', () => {
    let controller;

    beforeEach(() => {
        controller = new GovernanceController({
            policiesPath: null // Use defaults
        });
    });

    describe('canAutoExecute', () => {
        it('should auto-approve actions with high confidence', () => {
            const result = controller.canAutoExecute(
                { type: 'enrichment' },
                98
            );

            expect(result.approved).toBe(true);
            expect(result.outcome).toBe(ACTION_OUTCOME.APPROVED);
            expect(result.status).toBe(APPROVAL_STATUS.AUTO_APPROVED);
        });

        it('should require review for medium confidence', () => {
            const result = controller.canAutoExecute(
                { type: 'enrichment' },
                85
            );

            expect(result.approved).toBe(false);
            expect(result.outcome).toBe(ACTION_OUTCOME.PENDING_REVIEW);
            expect(result.status).toBe(APPROVAL_STATUS.PENDING);
        });

        it('should reject low confidence actions', () => {
            const result = controller.canAutoExecute(
                { type: 'enrichment' },
                50
            );

            expect(result.approved).toBe(false);
            expect(result.outcome).toBe(ACTION_OUTCOME.REJECTED);
            expect(result.status).toBe(APPROVAL_STATUS.REJECTED);
        });

        it('should block protected field modifications', () => {
            const result = controller.canAutoExecute(
                { type: 'update', fields: ['email', 'do_not_call'] },
                99
            );

            expect(result.approved).toBe(false);
            expect(result.outcome).toBe(ACTION_OUTCOME.BLOCKED);
            expect(result.blockedFields).toContain('do_not_call');
        });

        it('should require review for bulk operations', () => {
            const result = controller.canAutoExecute(
                { type: 'bulk_update', recordCount: 150 },
                99
            );

            expect(result.outcome).toBe(ACTION_OUTCOME.PENDING_REVIEW);
            expect(result.requiredApprovers.length).toBeGreaterThan(0);
        });
    });

    describe('isFieldProtected', () => {
        it('should identify protected CRM fields', () => {
            expect(controller.isFieldProtected('do_not_call')).toBe(true);
            expect(controller.isFieldProtected('do_not_email')).toBe(true);
            expect(controller.isFieldProtected('gdpr_consent')).toBe(true);
        });

        it('should be case-insensitive', () => {
            expect(controller.isFieldProtected('DO_NOT_CALL')).toBe(true);
            expect(controller.isFieldProtected('DoNotCall')).toBe(false); // Exact match required
        });

        it('should allow non-protected fields', () => {
            expect(controller.isFieldProtected('phone')).toBe(false);
            expect(controller.isFieldProtected('email')).toBe(false);
            expect(controller.isFieldProtected('name')).toBe(false);
        });
    });

    describe('validateCompliance', () => {
        it('should check GDPR compliance for EU contacts', () => {
            const record = {
                BillingCountry: 'Germany',
                Email: 'test@example.de'
            };

            const result = controller.validateCompliance(record, { first_name: 'Test' });

            expect(result.checkedRegulations).toContain('gdpr');
        });

        it('should check CCPA for California residents', () => {
            const record = {
                BillingState: 'CA',
                ccpa_opt_out: true
            };

            const result = controller.validateCompliance(record, {});

            expect(result.compliant).toBe(false);
            expect(result.issues.some(i => i.regulation === 'CCPA')).toBe(true);
        });

        it('should pass compliant records', () => {
            const record = {
                BillingState: 'TX',
                Email: 'test@example.com'
            };

            const result = controller.validateCompliance(record, { phone: '555-1234' });

            expect(result.compliant).toBe(true);
        });
    });

    describe('rate limiting', () => {
        it('should track rate limit usage', () => {
            controller.recordExecution('enrichment', 10);
            const status = controller.getRateLimitStatus('enrichment');

            expect(status.hourly.used).toBe(10);
            expect(status.daily.used).toBe(10);
        });

        it('should block when rate limit exceeded', () => {
            // Simulate hitting hourly limit (100 merges per hour)
            controller.recordExecution('deduplicate', 100);

            const result = controller.canAutoExecute(
                { type: 'deduplicate', recordCount: 1 },
                99
            );

            expect(result.rateLimitStatus.allowed).toBe(false);
            expect(result.outcome).toBe(ACTION_OUTCOME.BLOCKED);
        });
    });

    describe('review queue', () => {
        it('should route action for review', () => {
            const entry = controller.routeForReview(
                { type: 'account_merge', recordIds: ['001', '002'] },
                { confidence: 85 }
            );

            expect(entry.id).toBeDefined();
            expect(entry.status).toBe('pending');
            expect(entry.action.type).toBe('account_merge');
        });

        it('should get pending reviews', () => {
            controller.routeForReview({ type: 'merge' }, { confidence: 85 });
            controller.routeForReview({ type: 'merge' }, { confidence: 90 });

            const pending = controller.getPendingReviews();

            expect(pending.length).toBe(2);
        });

        it('should approve reviews', () => {
            const entry = controller.routeForReview(
                { type: 'merge' },
                { confidence: 85 }
            );

            const updated = controller.approveReview(entry.id, 'user-123', {
                comment: 'Looks good'
            });

            expect(updated.status).toBe('approved');
            expect(updated.approvals.length).toBe(1);
        });

        it('should reject reviews', () => {
            const entry = controller.routeForReview(
                { type: 'merge' },
                { confidence: 85 }
            );

            const updated = controller.rejectReview(entry.id, 'user-123', {
                reason: 'Data mismatch'
            });

            expect(updated.status).toBe('rejected');
            expect(updated.rejections.length).toBe(1);
        });
    });
});
