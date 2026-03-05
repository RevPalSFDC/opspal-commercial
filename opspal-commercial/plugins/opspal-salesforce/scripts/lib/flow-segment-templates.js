/**
 * Flow Segment Templates
 *
 * Pre-defined segment patterns for common flow building scenarios.
 * Provides templates with complexity budgets, element patterns, and best practices.
 *
 * @module flow-segment-templates
 * @version 1.0.0
 * @since salesforce-plugin@3.50.0
 *
 * Key Capabilities:
 * - 5 core segment types based on empirical flow patterns
 * - Pre-configured complexity budgets
 * - Element templates and examples
 * - Best practices and anti-patterns
 * - Validation rules per segment type
 * - Common use cases and scenarios
 *
 * Usage:
 *   const SegmentTemplates = require('./flow-segment-templates');
 *   const templates = new SegmentTemplates();
 *
 *   // Get template
 *   const template = templates.getTemplate('validation');
 *
 *   // Apply template to segment
 *   segmentManager.startSegment('MyValidation', {
 *       type: 'validation',
 *       budget: template.defaultBudget
 *   });
 */

/**
 * Segment template definition
 * @typedef {Object} SegmentTemplate
 * @property {string} name - Template name
 * @property {string} type - Segment type identifier
 * @property {string} description - Human-readable description
 * @property {number} defaultBudget - Recommended complexity budget
 * @property {Object} budgetRange - Min/max budget recommendations
 * @property {string} purpose - Primary purpose of this segment type
 * @property {Array<string>} commonElements - Typical elements in this segment
 * @property {Array<Object>} elementExamples - Example element configurations
 * @property {Array<string>} bestPractices - Best practices for this segment type
 * @property {Array<string>} antiPatterns - Common mistakes to avoid
 * @property {Array<string>} useCases - Common scenarios for this segment
 * @property {Object} validationRules - Segment-specific validation rules
 */

class SegmentTemplates {
    constructor() {
        this.templates = this._initializeTemplates();
    }

    /**
     * Get template by type
     * @param {string} type - Template type
     * @returns {SegmentTemplate|null} Template or null if not found
     */
    getTemplate(type) {
        return this.templates[type] || null;
    }

    /**
     * List all available templates
     * @returns {Array<Object>} Template summaries
     */
    listTemplates() {
        return Object.values(this.templates).map(template => ({
            type: template.type,
            name: template.name,
            description: template.description,
            defaultBudget: template.defaultBudget,
            purpose: template.purpose
        }));
    }

    /**
     * Get template by use case
     * @param {string} useCase - Use case description
     * @returns {Array<SegmentTemplate>} Matching templates
     */
    findByUseCase(useCase) {
        const lowerCase = useCase.toLowerCase();
        return Object.values(this.templates).filter(template =>
            template.useCases.some(uc => uc.toLowerCase().includes(lowerCase))
        );
    }

    /**
     * Get recommended budget for element combination
     * @param {Array<string>} elementTypes - Element types to include
     * @returns {number} Recommended budget
     */
    calculateRecommendedBudget(elementTypes) {
        const { COMPLEXITY_WEIGHTS } = require('./flow-segment-manager');
        let totalComplexity = 0;

        for (const elementType of elementTypes) {
            totalComplexity += COMPLEXITY_WEIGHTS[elementType] || 1;
        }

        // Add 20% buffer for flexibility
        return Math.ceil(totalComplexity * 1.2);
    }

    /**
     * Initialize all segment templates
     * @returns {Object} Template registry
     * @private
     */
    _initializeTemplates() {
        return {
            validation: this._createValidationTemplate(),
            enrichment: this._createEnrichmentTemplate(),
            routing: this._createRoutingTemplate(),
            notification: this._createNotificationTemplate(),
            loopProcessing: this._createLoopProcessingTemplate()
        };
    }

    /**
     * Create Validation Segment template
     * @returns {SegmentTemplate} Validation template
     * @private
     */
    _createValidationTemplate() {
        return {
            name: 'Validation Segment',
            type: 'validation',
            description: 'Data validation and pre-condition checking with decision elements',
            defaultBudget: 5,
            budgetRange: { min: 3, max: 7 },
            purpose: 'Validate input data, check pre-conditions, and enforce business rules before processing',

            commonElements: [
                'decisions',
                'formulas',
                'assignments'
            ],

            elementExamples: [
                {
                    description: 'Status validation',
                    instruction: 'Add a decision called Status_Check if Status equals "Active" then Continue else Exit',
                    complexity: 2
                },
                {
                    description: 'Amount threshold check',
                    instruction: 'Add a decision called Amount_Check if Amount > 10000 then Proceed else Skip',
                    complexity: 2
                },
                {
                    description: 'Required field validation',
                    instruction: 'Add a decision called Required_Fields_Check if Name is blank or Email is blank then Error else Continue',
                    complexity: 2
                },
                {
                    description: 'Date range validation',
                    instruction: 'Add a decision called Date_Range_Check if CloseDate < TODAY then Invalid else Valid',
                    complexity: 2
                }
            ],

            bestPractices: [
                'Keep validation logic simple and focused',
                'Validate early to fail fast',
                'Group related validations in same segment',
                'Use clear, descriptive decision names (e.g., "Status_Check" not "Check1")',
                'Provide clear error messages for validation failures',
                'Avoid complex formula calculations in validation segment',
                'Consider using formula fields instead of flow formulas when possible'
            ],

            antiPatterns: [
                'Mixing validation with data manipulation (use separate enrichment segment)',
                'Nested decisions more than 2 levels deep',
                'Validating data that should be enforced by validation rules',
                'Performing SOQL queries in validation segment (move to enrichment)',
                'Over-validating (trust data that has already been validated upstream)'
            ],

            useCases: [
                'Validate opportunity stage requirements before progression',
                'Check account eligibility criteria',
                'Enforce field dependencies',
                'Validate business rules before record updates',
                'Pre-flight checks for complex processing',
                'Gate-keeping logic for multi-step processes',
                'Input sanitization and normalization'
            ],

            validationRules: {
                maxDecisions: 3,
                requiresFaultPaths: true,
                allowsRecordOperations: false,
                requiresExitPath: true,
                maxNestingLevel: 2
            }
        };
    }

    /**
     * Create Enrichment Segment template
     * @returns {SegmentTemplate} Enrichment template
     * @private
     */
    _createEnrichmentTemplate() {
        return {
            name: 'Enrichment Segment',
            type: 'enrichment',
            description: 'Data retrieval and enrichment with Get Records and assignments',
            defaultBudget: 8,
            budgetRange: { min: 5, max: 12 },
            purpose: 'Retrieve related data, calculate derived values, and enrich records with additional context',

            commonElements: [
                'recordLookups',
                'assignments',
                'formulas',
                'decisions'
            ],

            elementExamples: [
                {
                    description: 'Retrieve related contacts',
                    instruction: 'Add Get Records to find Contacts where AccountId equals $Record.Id and store in ContactCollection',
                    complexity: 2
                },
                {
                    description: 'Calculate account rating',
                    instruction: 'Add assignment to set Account_Rating based on Annual_Revenue formula',
                    complexity: 1
                },
                {
                    description: 'Retrieve parent account',
                    instruction: 'Add Get Records to find Account where Id equals $Record.ParentId and store in ParentAccount',
                    complexity: 2
                },
                {
                    description: 'Count related opportunities',
                    instruction: 'Add assignment to set Opportunity_Count to count of OpportunityCollection',
                    complexity: 1
                }
            ],

            bestPractices: [
                'Query before loops, never inside loops',
                'Use Get Records filters instead of looping and checking',
                'Store query results in collections for reuse',
                'Avoid unnecessary queries - check if data is already available in $Record',
                'Use SOQL COUNT() queries for counting instead of retrieving all records',
                'Consider bulkification when triggered by record updates',
                'Set fault paths on Get Records to handle "no records found"'
            ],

            antiPatterns: [
                'Querying inside loops (CRITICAL anti-pattern)',
                'Retrieving more fields than needed',
                'Hard-coding record IDs in queries',
                'Not setting fault paths on Get Records',
                'Querying data that\'s already available in trigger context',
                'Over-fetching (retrieving thousands of records without pagination)',
                'Chaining multiple sequential queries that could be combined'
            ],

            useCases: [
                'Retrieve related records for processing',
                'Calculate derived metrics from related data',
                'Enrich records with parent/child information',
                'Aggregate data from related objects',
                'Lookup reference data (e.g., pricebooks, territories)',
                'Build collections for loop processing',
                'Retrieve configuration data for dynamic logic'
            ],

            validationRules: {
                maxRecordLookups: 3,
                requiresFaultPaths: true,
                allowsLoops: false,
                requiresBulkification: true,
                maxAssignments: 5
            }
        };
    }

    /**
     * Create Routing Segment template
     * @returns {SegmentTemplate} Routing template
     * @private
     */
    _createRoutingTemplate() {
        return {
            name: 'Routing Segment',
            type: 'routing',
            description: 'Complex decision trees and conditional branching logic',
            defaultBudget: 6,
            budgetRange: { min: 4, max: 10 },
            purpose: 'Route processing flow based on business logic, priorities, or categories',

            commonElements: [
                'decisions',
                'branches',
                'assignments',
                'subflows'
            ],

            elementExamples: [
                {
                    description: 'Priority-based routing',
                    instruction: 'Add decision Priority_Router: if Priority = "Critical" then Escalate, if Priority = "High" then Expedite, else Standard',
                    complexity: 2
                },
                {
                    description: 'Industry-based segmentation',
                    instruction: 'Add decision Industry_Router: if Industry = "Healthcare" then Healthcare_Path, if Industry = "Finance" then Finance_Path, else General_Path',
                    complexity: 2
                },
                {
                    description: 'Multi-criteria routing',
                    instruction: 'Add decision Assignment_Router: if Amount > 100000 AND Region = "West" then Enterprise_Team, else Standard_Team',
                    complexity: 2
                },
                {
                    description: 'Status-based workflow',
                    instruction: 'Add decision Status_Router: if Status = "New" then New_Process, if Status = "In Progress" then Progress_Process, else Complete_Process',
                    complexity: 2
                }
            ],

            bestPractices: [
                'Use clear, descriptive branch names that indicate the routing logic',
                'Order decision outcomes by priority (most common/important first)',
                'Consider using Record-Triggered paths instead of complex decisions when possible',
                'Document routing logic in Flow description',
                'Use formula fields for complex routing criteria when possible',
                'Consolidate similar routing logic into single decision',
                'Ensure all possible paths lead to valid outcomes'
            ],

            antiPatterns: [
                'Deeply nested decisions (more than 3 levels)',
                'Duplicate routing logic in multiple places',
                'Not handling default/else cases',
                'Using hard-coded values instead of custom metadata/settings',
                'Complex formulas inside decision criteria (use formula elements instead)',
                'Routing logic that could be handled by process builder or assignment rules',
                'Missing connector paths leaving "orphaned" elements'
            ],

            useCases: [
                'Lead assignment based on criteria',
                'Case escalation routing',
                'Approval process routing',
                'Territory-based assignment',
                'Priority-based workflows',
                'Industry-specific processing paths',
                'Multi-channel notification routing',
                'Dynamic subflow invocation'
            ],

            validationRules: {
                maxDecisions: 4,
                maxNestingLevel: 3,
                requiresDefaultPath: true,
                requiresConnectorPaths: true,
                allowsDeadEnds: false
            }
        };
    }

    /**
     * Create Notification Segment template
     * @returns {SegmentTemplate} Notification template
     * @private
     */
    _createNotificationTemplate() {
        return {
            name: 'Notification Segment',
            type: 'notification',
            description: 'Email alerts, Chatter posts, and external notifications',
            defaultBudget: 4,
            budgetRange: { min: 2, max: 6 },
            purpose: 'Send notifications to users, post to Chatter, or trigger external alerts',

            commonElements: [
                'emailAlerts',
                'actions',
                'assignments',
                'decisions'
            ],

            elementExamples: [
                {
                    description: 'Send email alert',
                    instruction: 'Add action to send email using "Opportunity_Closed_Won" template to Account_Owner',
                    complexity: 1
                },
                {
                    description: 'Post to Chatter',
                    instruction: 'Add action to post to Chatter: "New high-value opportunity created" on Opportunity record',
                    complexity: 1
                },
                {
                    description: 'Conditional notification',
                    instruction: 'Add decision: if Amount > 50000 then Send_Executive_Alert else Send_Manager_Alert',
                    complexity: 2
                },
                {
                    description: 'External webhook',
                    instruction: 'Add action to invoke Apex callout webhook_notify with parameters',
                    complexity: 1
                }
            ],

            bestPractices: [
                'Use email templates instead of hard-coded content',
                'Group related notifications in same segment',
                'Consider notification preferences and opt-outs',
                'Test emails in sandbox with real-world scenarios',
                'Use merge fields for dynamic content',
                'Set email delivery settings appropriately (immediate vs batched)',
                'Log notification failures for troubleshooting',
                'Respect governor limits (10 single emails per transaction)'
            ],

            antiPatterns: [
                'Sending notifications inside loops (exceeds email limits)',
                'Hard-coding email addresses',
                'Not handling email delivery failures',
                'Sending excessive notifications (alert fatigue)',
                'Including sensitive data in Chatter posts',
                'Not using email templates (maintainability issue)',
                'Missing null checks for email recipients'
            ],

            useCases: [
                'Opportunity stage change notifications',
                'Case escalation alerts',
                'Approval request notifications',
                'Record assignment notifications',
                'Milestone achievement alerts',
                'Error/exception notifications',
                'External system integration triggers',
                'Team collaboration updates'
            ],

            validationRules: {
                maxEmailActions: 2,
                requiresRecipientValidation: true,
                allowsLoops: false,
                requiresTemplates: true,
                maxActionsPerTransaction: 5
            }
        };
    }

    /**
     * Create Loop Processing Segment template
     * @returns {SegmentTemplate} Loop template
     * @private
     */
    _createLoopProcessingTemplate() {
        return {
            name: 'Loop Processing Segment',
            type: 'loopProcessing',
            description: 'Bulkified loop processing with collection operations',
            defaultBudget: 10,
            budgetRange: { min: 6, max: 15 },
            purpose: 'Iterate through collections and perform bulk operations efficiently',

            commonElements: [
                'loops',
                'assignments',
                'decisions',
                'collections',
                'recordUpdates'
            ],

            elementExamples: [
                {
                    description: 'Process contact collection',
                    instruction: 'Add loop called Contact_Loop to iterate through ContactCollection',
                    complexity: 3
                },
                {
                    description: 'Conditional collection add',
                    instruction: 'Add assignment: if Contact.Email is not blank then add Contact to ValidContacts collection',
                    complexity: 1
                },
                {
                    description: 'Bulk update after loop',
                    instruction: 'Add record update to update ValidContacts collection with Status = "Processed"',
                    complexity: 1
                },
                {
                    description: 'Loop with decision',
                    instruction: 'Add decision inside loop: if LineItem.Quantity > 10 then add to BulkDiscountCollection',
                    complexity: 2
                }
            ],

            bestPractices: [
                'CRITICAL: Never perform DML inside loops',
                'CRITICAL: Never perform SOQL inside loops',
                'Build collections inside loops, perform DML after loop',
                'Use loop variable for current item, not index lookups',
                'Set explicit loop start and end conditions',
                'Consider pagination for large datasets (>2000 records)',
                'Use bulkified record updates after loop completion',
                'Test with bulk data (not just single records)',
                'Add null checks for collection variables'
            ],

            antiPatterns: [
                'DML operations inside loops (CRITICAL - causes governor limit errors)',
                'SOQL queries inside loops (CRITICAL - causes governor limit errors)',
                'Not bulkifying operations',
                'Looping without a collection variable',
                'Modifying loop collection while iterating',
                'Not handling empty collections',
                'Nested loops without careful complexity analysis',
                'Processing more than 2000 records without pagination'
            ],

            useCases: [
                'Update multiple related records',
                'Filter collections based on criteria',
                'Build aggregated collections for bulk operations',
                'Process line items in bulk',
                'Iterate through query results for transformation',
                'Build CSV/JSON data structures',
                'Conditional collection population',
                'Multi-record calculations'
            ],

            validationRules: {
                maxLoops: 2,
                requiresBulkification: true,
                allowsDMLInLoop: false,
                allowsSOQLInLoop: false,
                requiresCollectionVariable: true,
                maxRecordsPerLoop: 2000,
                requiresNullChecks: true
            }
        };
    }

    /**
     * Validate segment configuration against template rules
     * @param {string} templateType - Template type
     * @param {Object} segmentConfig - Segment configuration
     * @returns {Object} Validation result
     */
    validateAgainstTemplate(templateType, segmentConfig) {
        const template = this.getTemplate(templateType);
        if (!template) {
            return {
                valid: false,
                errors: [`Unknown template type: ${templateType}`]
            };
        }

        const result = {
            valid: true,
            errors: [],
            warnings: []
        };

        const rules = template.validationRules;

        // Validate budget range
        if (segmentConfig.budget < template.budgetRange.min) {
            result.warnings.push(
                `Budget (${segmentConfig.budget}) below recommended minimum (${template.budgetRange.min}). ` +
                `Segment may be too constrained.`
            );
        } else if (segmentConfig.budget > template.budgetRange.max) {
            result.warnings.push(
                `Budget (${segmentConfig.budget}) above recommended maximum (${template.budgetRange.max}). ` +
                `Consider splitting into multiple segments.`
            );
        }

        // Element-specific validations would go here
        // (Implemented in Phase 2.2 with flow-validator integration)

        return result;
    }

    /**
     * Get template recommendations based on flow requirements
     * @param {Object} requirements - Flow requirements
     * @returns {Array<Object>} Template recommendations
     */
    getRecommendations(requirements) {
        const recommendations = [];

        // Analyze requirements and suggest templates
        if (requirements.needsValidation) {
            recommendations.push({
                template: this.getTemplate('validation'),
                reason: 'Flow requires data validation',
                priority: 'high'
            });
        }

        if (requirements.needsDataRetrieval) {
            recommendations.push({
                template: this.getTemplate('enrichment'),
                reason: 'Flow requires data retrieval from related objects',
                priority: 'high'
            });
        }

        if (requirements.hasComplexRouting) {
            recommendations.push({
                template: this.getTemplate('routing'),
                reason: 'Flow has complex decision logic',
                priority: 'medium'
            });
        }

        if (requirements.sendsNotifications) {
            recommendations.push({
                template: this.getTemplate('notification'),
                reason: 'Flow sends notifications',
                priority: 'low'
            });
        }

        if (requirements.processesCollections) {
            recommendations.push({
                template: this.getTemplate('loopProcessing'),
                reason: 'Flow processes collections in bulk',
                priority: 'high'
            });
        }

        return recommendations;
    }
}

module.exports = SegmentTemplates;
