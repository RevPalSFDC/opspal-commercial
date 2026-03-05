#!/usr/bin/env node

/**
 * Dedup Safety Engine
 *
 * Instance-agnostic duplicate detection engine with Type 1/2 error prevention.
 * Implements configurable guardrails and data-first survivor selection.
 *
 * Usage:
 *   node dedup-safety-engine.js analyze <org-alias> <pairs-file> [--config config.json]
 *   node dedup-safety-engine.js single <org-alias> <id-a> <id-b> [--config config.json]
 *
 * @author Claude Code
 * @version 1.0.0
 * @date 2025-10-16
 */

const fs = require('fs');
const path = require('path');

class DedupSafetyEngine {
    constructor(orgAlias, backupDir, importanceReport, config = null) {
        this.orgAlias = orgAlias;
        this.backupDir = backupDir;
        this.importanceReport = importanceReport;
        this.config = config || this.loadDefaultConfig();

        // Load data
        this.backupData = this.loadBackupData();
        this.importanceWeights = this.loadImportanceWeights();
        this.relationships = this.loadRelationships();

        // Results
        this.decisions = [];
        this.stats = {
            total: 0,
            approved: 0,
            review: 0,
            blocked: 0,
            type1Prevented: 0,
            type2Prevented: 0
        };
    }

    log(message, level = 'INFO') {
        const prefix = {
            'INFO': '✓',
            'WARN': '⚠',
            'ERROR': '✗',
            'BLOCK': '🛑'
        }[level] || 'ℹ';
        console.log(`${prefix} ${message}`);
    }

    /**
     * Load default configuration
     */
    loadDefaultConfig() {
        return {
            industry: 'default',
            guardrails: {
                domain_mismatch: {
                    enabled: true,
                    threshold: 0.3,
                    severity: 'REVIEW' // BLOCK or REVIEW
                },
                address_mismatch: {
                    enabled: true,
                    generic_entity_patterns: [
                        'Housing Authority', 'City of', 'County', 'Department of',
                        'Government', 'District', 'Municipality', 'Township'
                    ],
                    severity: 'BLOCK'
                },
                integration_id_conflict: {
                    enabled: true,
                    severity: 'BLOCK'
                },
                importance_field_mismatch: {
                    enabled: true,
                    threshold: 50,
                    severity: 'BLOCK'
                },
                data_richness_mismatch: {
                    enabled: true,
                    threshold: 0.3,
                    severity: 'BLOCK'
                },
                relationship_asymmetry: {
                    enabled: true,
                    threshold: 5,
                    severity: 'BLOCK'
                },
                survivor_name_blank: {
                    enabled: true,
                    severity: 'BLOCK'
                },
                state_domain_mismatch: {
                    enabled: true,
                    severity: 'BLOCK'
                }
            },
            survivor_selection: {
                weights: {
                    relationship_score: 100,
                    integration_id: 100,
                    completeness: 50,
                    recent_activity: 25
                }
            }
        };
    }

    /**
     * Load backup data
     */
    loadBackupData() {
        const manifestPath = path.join(this.backupDir, 'backup_manifest.json');
        if (!fs.existsSync(manifestPath)) {
            throw new Error(`Backup manifest not found: ${manifestPath}`);
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        // Load active accounts
        const activeFile = manifest.files.find(f => f.type === 'active_records');
        if (!activeFile) {
            throw new Error('Active records file not found in manifest');
        }

        const activeData = JSON.parse(
            fs.readFileSync(path.join(this.backupDir, activeFile.name), 'utf8')
        );
        const activeRecords = activeData.records || activeData; // Handle both formats

        // Load deleted accounts (for forensics)
        const deletedFile = manifest.files.find(f => f.type === 'deleted_records');
        let deletedRecords = [];
        if (deletedFile && fs.existsSync(path.join(this.backupDir, deletedFile.name))) {
            const deletedData = JSON.parse(
                fs.readFileSync(path.join(this.backupDir, deletedFile.name), 'utf8')
            );
            deletedRecords = deletedData.records || deletedData; // Handle both formats
        }

        // Create lookup map
        const recordMap = {};
        for (const record of activeRecords) {
            recordMap[record.Id] = record;
        }

        this.log(`Loaded ${activeRecords.length} active records, ${deletedRecords.length} deleted records`, 'INFO');

        return { active: recordMap, deleted: deletedRecords };
    }

    /**
     * Load importance weights from detector output
     */
    loadImportanceWeights() {
        if (!fs.existsSync(this.importanceReport)) {
            throw new Error(`Importance report not found: ${this.importanceReport}`);
        }

        const reportText = fs.readFileSync(this.importanceReport, 'utf8');

        // Parse the text report to extract field information
        const weights = {
            integrationIds: [],
            importanceFields: [],
            picklistFields: []
        };

        // Extract integration ID fields
        const integrationSection = reportText.match(/🔗 INTEGRATION ID FIELDS([\s\S]*?)(?:📊|$)/);
        if (integrationSection) {
            const lines = integrationSection[1].split('\n');
            for (const line of lines) {
                const match = line.match(/• (\w+) \((.*?)\)/);
                if (match) {
                    weights.integrationIds.push({
                        name: match[1],
                        label: match[2]
                    });
                }
            }
        }

        // Extract top importance fields
        const topFieldsSection = reportText.match(/🏆 TOP IMPORTANCE FIELDS([\s\S]*?)🔗/);
        if (topFieldsSection) {
            const fieldMatches = topFieldsSection[1].matchAll(/\d+\. (\w+) \((.*?)\)\s+Score: (\d+)/g);
            for (const match of fieldMatches) {
                weights.importanceFields.push({
                    name: match[1],
                    label: match[2],
                    weight: parseInt(match[3])
                });
            }
        }

        this.log(`Loaded ${weights.integrationIds.length} integration IDs, ${weights.importanceFields.length} importance fields`, 'INFO');

        return weights;
    }

    /**
     * Load relationship topology
     */
    loadRelationships() {
        const topoFile = path.join(this.backupDir, 'relationship_topology.json');
        if (!fs.existsSync(topoFile)) {
            this.log('Relationship topology not found, using empty map', 'WARN');
            return { contacts: {}, opportunities: {}, cases: {} };
        }

        const topologyData = JSON.parse(fs.readFileSync(topoFile, 'utf8'));
        const topology = topologyData.topology || topologyData; // Handle both formats

        // Build lookup maps
        const relationships = {
            contacts: {},
            opportunities: {},
            cases: {}
        };

        for (const account of topology) {
            relationships.contacts[account.accountId] = account.contactIds || [];
            relationships.opportunities[account.accountId] = account.opportunityIds || [];
            relationships.cases[account.accountId] = account.caseIds || [];
        }

        return relationships;
    }

    /**
     * Analyze a pair of records
     */
    analyzePair(idA, idB) {
        const recordA = this.backupData.active[idA];
        const recordB = this.backupData.active[idB];

        if (!recordA || !recordB) {
            throw new Error(`Record not found: ${!recordA ? idA : idB}`);
        }

        const decision = {
            pair_id: `${idA}_${idB}`,
            recordA: { id: idA, name: recordA.Name },
            recordB: { id: idB, name: recordB.Name },
            decision: 'APPROVE',
            recommended_survivor: null,
            recommended_deleted: null,
            scores: {},
            guardrails_triggered: [],
            recovery_procedure: null
        };

        // Run guardrails (Type 1 + Type 2)
        this.runGuardrails(recordA, recordB, decision);

        // Calculate survivor scores
        const scoreA = this.calculateSurvivorScore(recordA, idA);
        const scoreB = this.calculateSurvivorScore(recordB, idB);

        decision.scores = {
            recordA: scoreA,
            recordB: scoreB
        };

        // Determine recommended survivor
        if (scoreA.score > scoreB.score) {
            decision.recommended_survivor = idA;
            decision.recommended_deleted = idB;
        } else {
            decision.recommended_survivor = idB;
            decision.recommended_deleted = idA;
        }

        // Final decision based on guardrails
        const blockGuardrails = decision.guardrails_triggered.filter(g => g.severity === 'BLOCK');
        const reviewGuardrails = decision.guardrails_triggered.filter(g => g.severity === 'REVIEW');

        if (blockGuardrails.length > 0) {
            decision.decision = 'BLOCK';
            this.stats.blocked++;

            // Determine recovery procedure
            const hasType1 = blockGuardrails.some(g => g.type.includes('TYPE_1'));
            const hasType2 = blockGuardrails.some(g => g.type.includes('TYPE_2'));

            if (hasType1) {
                decision.recovery_procedure = 'B'; // Entity separation
                this.stats.type1Prevented++;
            } else if (hasType2) {
                decision.recovery_procedure = 'A'; // Field restoration
                this.stats.type2Prevented++;
            }
        } else if (reviewGuardrails.length > 0) {
            decision.decision = 'REVIEW';
            this.stats.review++;
        } else {
            decision.decision = 'APPROVE';
            this.stats.approved++;
        }

        this.stats.total++;
        return decision;
    }

    /**
     * Run all guardrails
     */
    runGuardrails(recordA, recordB, decision) {
        // Type 1: Different Entities
        this.checkDomainMismatch(recordA, recordB, decision);
        this.checkAddressMismatch(recordA, recordB, decision);
        this.checkIntegrationIdConflict(recordA, recordB, decision);
        this.checkStateDomainMismatch(recordA, recordB, decision);

        // Type 2: Wrong Survivor
        this.checkImportanceFieldMismatch(recordA, recordB, decision);
        this.checkDataRichnessMismatch(recordA, recordB, decision);
        this.checkRelationshipAsymmetry(recordA, recordB, decision);
        this.checkSurvivorNameBlank(recordA, recordB, decision);
    }

    /**
     * Guardrail: Domain Mismatch
     */
    checkDomainMismatch(recordA, recordB, decision) {
        if (!this.config.guardrails.domain_mismatch.enabled) return;

        // Extract domains from website/email fields
        const domainsA = this.extractDomains(recordA);
        const domainsB = this.extractDomains(recordB);

        if (domainsA.length === 0 || domainsB.length === 0) return;

        // Check overlap
        const overlap = domainsA.filter(d => domainsB.includes(d)).length;
        const overlapRatio = overlap / Math.max(domainsA.length, domainsB.length);

        if (overlapRatio < this.config.guardrails.domain_mismatch.threshold) {
            decision.guardrails_triggered.push({
                type: 'TYPE_1_DOMAIN_MISMATCH',
                severity: this.config.guardrails.domain_mismatch.severity,
                reason: `Domain overlap: ${(overlapRatio * 100).toFixed(0)}% (threshold: ${(this.config.guardrails.domain_mismatch.threshold * 100).toFixed(0)}%)`,
                details: {
                    domainsA,
                    domainsB,
                    overlap: overlapRatio
                }
            });
        }
    }

    /**
     * Extract domains from record
     */
    extractDomains(record) {
        const domains = [];
        const fields = ['Website', 'Email__c', 'Domain__c'];

        for (const field of fields) {
            const value = record[field];
            if (!value) continue;

            const domainMatch = String(value).match(/@?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (domainMatch) {
                domains.push(domainMatch[1].toLowerCase());
            }
        }

        return [...new Set(domains)]; // Unique
    }

    /**
     * Guardrail: Address Mismatch
     */
    checkAddressMismatch(recordA, recordB, decision) {
        if (!this.config.guardrails.address_mismatch.enabled) return;

        // Extract address components
        const cityA = (recordA.BillingCity || recordA.ShippingCity || '').toLowerCase();
        const cityB = (recordB.BillingCity || recordB.ShippingCity || '').toLowerCase();
        const zipA = (recordA.BillingPostalCode || recordA.ShippingPostalCode || '').toLowerCase();
        const zipB = (recordB.BillingPostalCode || recordB.ShippingPostalCode || '').toLowerCase();
        const streetA = (recordA.BillingStreet || recordA.ShippingStreet || '').toLowerCase();
        const streetB = (recordB.BillingStreet || recordB.ShippingStreet || '').toLowerCase();

        const cityMatch = cityA && cityB && cityA === cityB;
        const zipMatch = zipA && zipB && zipA === zipB;
        const streetDifferent = streetA && streetB && streetA !== streetB;

        if (cityMatch && zipMatch && streetDifferent) {
            // Check for generic entity names
            const patterns = this.config.guardrails.address_mismatch.generic_entity_patterns;
            const nameA = (recordA.Name || '').toLowerCase();
            const nameB = (recordB.Name || '').toLowerCase();

            const hasGenericPattern = patterns.some(pattern =>
                nameA.includes(pattern.toLowerCase()) || nameB.includes(pattern.toLowerCase())
            );

            if (hasGenericPattern) {
                decision.guardrails_triggered.push({
                    type: 'TYPE_1_ADDRESS_MISMATCH',
                    severity: this.config.guardrails.address_mismatch.severity,
                    reason: 'Generic entity name + same city/zip + different streets',
                    details: {
                        city: cityA,
                        zip: zipA,
                        streetA,
                        streetB,
                        nameA: recordA.Name,
                        nameB: recordB.Name
                    }
                });
            }
        }
    }

    /**
     * Guardrail: Integration ID Conflict
     *
     * BUG FIX (2025-10-16): Exclude UUID fields and Salesforce ID copies.
     * These fields SHOULD differ between duplicate records:
     * - UUID fields (p_uuid__c) are unique per record
     * - Salesforce ID copies (Salesforce_com_ID__c, Full_Salesforce_Id__c)
     *
     * Only check EXTERNAL integration IDs from billing/ERP systems.
     */
    checkIntegrationIdConflict(recordA, recordB, decision) {
        if (!this.config.guardrails.integration_id_conflict.enabled) return;

        // Patterns for fields that SHOULD differ (exclude from conflict checking)
        const excludePatterns = [
            /uuid/i,                    // UUID fields
            /guid/i,                    // GUID fields
            /salesforce/i,              // Salesforce ID copies
            /^id$/i,                    // Standard Id field
            /recordid/i,                // RecordId fields
            /^full.*id/i                // Full_Salesforce_Id pattern
        ];

        const conflicts = [];

        for (const idField of this.importanceWeights.integrationIds) {
            // Skip fields that should be unique per record
            const shouldExclude = excludePatterns.some(pattern =>
                pattern.test(idField.name) || pattern.test(idField.label)
            );

            if (shouldExclude) {
                continue; // This field is expected to differ
            }

            const valueA = recordA[idField.name];
            const valueB = recordB[idField.name];

            // Both non-null and different = conflict (for external IDs only)
            if (valueA && valueB && valueA !== valueB) {
                conflicts.push({
                    field: idField.name,
                    label: idField.label,
                    valueA,
                    valueB
                });
            }
        }

        if (conflicts.length > 0) {
            decision.guardrails_triggered.push({
                type: 'TYPE_1_INTEGRATION_ID_CONFLICT',
                severity: this.config.guardrails.integration_id_conflict.severity,
                reason: `${conflicts.length} integration ID conflict(s) detected`,
                details: { conflicts }
            });
        }
    }

    /**
     * Guardrail: Importance Field Mismatch
     */
    checkImportanceFieldMismatch(recordA, recordB, decision) {
        if (!this.config.guardrails.importance_field_mismatch.enabled) return;

        const mismatches = [];

        for (const field of this.importanceWeights.importanceFields) {
            if (field.weight < this.config.guardrails.importance_field_mismatch.threshold) continue;

            const valueA = recordA[field.name];
            const valueB = recordB[field.name];

            if (!valueA || !valueB) continue;

            const scoreA = this.calculateFieldImportance(field, valueA);
            const scoreB = this.calculateFieldImportance(field, valueB);

            if (Math.abs(scoreA - scoreB) > field.weight * 0.5) {
                mismatches.push({
                    field: field.name,
                    label: field.label,
                    valueA,
                    valueB,
                    scoreA,
                    scoreB,
                    superior: scoreA > scoreB ? 'A' : 'B'
                });
            }
        }

        if (mismatches.length > 0) {
            decision.guardrails_triggered.push({
                type: 'TYPE_2_IMPORTANCE_FIELD_MISMATCH',
                severity: this.config.guardrails.importance_field_mismatch.severity,
                reason: `${mismatches.length} importance field mismatch(es) detected`,
                details: { mismatches }
            });
        }
    }

    /**
     * Guardrail: Data Richness Mismatch
     */
    checkDataRichnessMismatch(recordA, recordB, decision) {
        if (!this.config.guardrails.data_richness_mismatch.enabled) return;

        const importantFields = this.importanceWeights.importanceFields.map(f => f.name);
        const completenessA = this.calculateCompleteness(recordA, importantFields);
        const completenessB = this.calculateCompleteness(recordB, importantFields);

        const diff = Math.abs(completenessA - completenessB);

        if (diff > this.config.guardrails.data_richness_mismatch.threshold) {
            decision.guardrails_triggered.push({
                type: 'TYPE_2_DATA_RICHNESS_MISMATCH',
                severity: this.config.guardrails.data_richness_mismatch.severity,
                reason: `Data completeness difference: ${(diff * 100).toFixed(0)}%`,
                details: {
                    completenessA: (completenessA * 100).toFixed(0) + '%',
                    completenessB: (completenessB * 100).toFixed(0) + '%',
                    superior: completenessA > completenessB ? 'A' : 'B'
                }
            });
        }
    }

    /**
     * Guardrail: Relationship Asymmetry
     */
    checkRelationshipAsymmetry(recordA, recordB, decision) {
        if (!this.config.guardrails.relationship_asymmetry.enabled) return;

        const contactsA = (this.relationships.contacts[recordA.Id] || []).length;
        const contactsB = (this.relationships.contacts[recordB.Id] || []).length;
        const oppsA = (this.relationships.opportunities[recordA.Id] || []).length;
        const oppsB = (this.relationships.opportunities[recordB.Id] || []).length;

        const totalA = contactsA + oppsA;
        const totalB = contactsB + oppsB;

        const diff = Math.abs(totalA - totalB);

        if (diff > this.config.guardrails.relationship_asymmetry.threshold) {
            decision.guardrails_triggered.push({
                type: 'TYPE_2_RELATIONSHIP_ASYMMETRY',
                severity: this.config.guardrails.relationship_asymmetry.severity,
                reason: `Relationship count difference: ${diff}`,
                details: {
                    recordA: { contacts: contactsA, opportunities: oppsA, total: totalA },
                    recordB: { contacts: contactsB, opportunities: oppsB, total: totalB },
                    superior: totalA > totalB ? 'A' : 'B'
                }
            });
        }
    }

    /**
     * Guardrail: Survivor Name Blank (NEW - spec-compliant)
     *
     * Per spec: "Survivor Name blank → BLOCK"
     * Prevents selecting a record with blank/null Name as the survivor.
     * This is a Type 2 error (wrong survivor for same entity).
     */
    checkSurvivorNameBlank(recordA, recordB, decision) {
        if (!this.config.guardrails.survivor_name_blank.enabled) return;

        // Check if either record would be a bad survivor due to blank name
        const nameABlank = !recordA.Name || recordA.Name.trim() === '';
        const nameBBlank = !recordB.Name || recordB.Name.trim() === '';

        // If recommended survivor has blank name, BLOCK
        // Note: We check after survivor scoring, so this runs after recommended_survivor is set
        // For now, we'll warn about ANY blank name in the pair
        if (nameABlank || nameBBlank) {
            const blankRecord = nameABlank ? 'A' : 'B';
            const blankName = nameABlank ? recordA.Name : recordB.Name;

            decision.guardrails_triggered.push({
                type: 'TYPE_2_SURVIVOR_NAME_BLANK',
                severity: this.config.guardrails.survivor_name_blank.severity,
                reason: `Record ${blankRecord} has blank/empty Name field - cannot be survivor`,
                details: {
                    recordWithBlankName: blankRecord,
                    recordAName: recordA.Name,
                    recordBName: recordB.Name,
                    recommendation: `Record ${blankRecord === 'A' ? 'B' : 'A'} must be survivor`
                }
            });
        }
    }

    /**
     * Guardrail: State + Domain Both Mismatch (NEW - spec-compliant)
     *
     * Per spec: "State + domain both mismatch → BLOCK"
     * When BOTH state AND domain disagree, this indicates different entities.
     * This is a Type 1 error prevention (different entities merged).
     */
    checkStateDomainMismatch(recordA, recordB, decision) {
        if (!this.config.guardrails.state_domain_mismatch.enabled) return;

        // Extract state
        const stateA = (recordA.BillingState || recordA.ShippingState || '').trim().toUpperCase();
        const stateB = (recordB.BillingState || recordB.ShippingState || '').trim().toUpperCase();

        // Extract domains (reuse existing method)
        const domainsA = this.extractDomains(recordA);
        const domainsB = this.extractDomains(recordB);

        // Both must have data to check
        if (!stateA || !stateB || domainsA.length === 0 || domainsB.length === 0) {
            return; // Can't verify without both data points
        }

        // Check if states are different
        const stateMismatch = stateA !== stateB;

        // Check if domains are different (no overlap)
        const domainOverlap = domainsA.filter(d => domainsB.includes(d)).length;
        const domainMismatch = domainOverlap === 0;

        // BLOCK if BOTH state AND domain mismatch
        if (stateMismatch && domainMismatch) {
            decision.guardrails_triggered.push({
                type: 'TYPE_1_STATE_DOMAIN_MISMATCH',
                severity: this.config.guardrails.state_domain_mismatch.severity,
                reason: 'Both State and Domain mismatch - likely different entities',
                details: {
                    stateA,
                    stateB,
                    domainsA,
                    domainsB,
                    stateMismatch: true,
                    domainMismatch: true,
                    recommendation: 'Do NOT merge - these appear to be different organizations'
                }
            });
        }
    }

    /**
     * Calculate survivor score (spec-compliant v2)
     *
     * Formula per spec:
     *   score = (contacts + opps) * 100
     *         + statusScore (+200 active/customer, -50 prospect)
     *         + clamp((ARR + MRR*12 + ACV + TCV)/1000, 0..1000)
     *         + 150 if any external/integration ID
     *         + 50 if real website
     *         - 500 if Name blank
     *         - 200 if auto-generated website
     */
    calculateSurvivorScore(record, recordId) {
        let score = 0;
        const breakdown = {};

        // 1. Relationship Score: (contacts + opportunities) * 100
        const contacts = (this.relationships.contacts[recordId] || []).length;
        const opps = (this.relationships.opportunities[recordId] || []).length;
        const relationshipScore = (contacts + opps) * 100;
        score += relationshipScore;
        breakdown.relationshipScore = relationshipScore;
        breakdown.contacts = contacts;
        breakdown.opportunities = opps;

        // 2. Status Score: +200 for Active/Customer, -50 for Prospect/Lead
        const statusScore = this.calculateStatusScore(record);
        score += statusScore;
        breakdown.statusScore = statusScore;

        // 3. Revenue Score: clamp((ARR + MRR*12 + ACV + TCV)/1000, 0..1000)
        const revenueScore = this.calculateRevenueScore(record);
        score += revenueScore;
        breakdown.revenueScore = revenueScore;

        // 4. Integration ID Score: +150 if any external/integration ID present
        let integrationIdScore = 0;
        for (const idField of this.importanceWeights.integrationIds) {
            if (record[idField.name]) {
                integrationIdScore = 150; // Presence of ANY integration ID
                break;
            }
        }
        score += integrationIdScore;
        breakdown.integrationIdScore = integrationIdScore;

        // 5. Website Quality Score
        const websiteScore = this.calculateWebsiteQualityScore(record);
        score += websiteScore;
        breakdown.websiteScore = websiteScore;

        // 6. Name Blank Penalty: -500 if Name is blank/null
        let nameBlankPenalty = 0;
        if (!record.Name || record.Name.trim() === '') {
            nameBlankPenalty = -500;
            score += nameBlankPenalty;
        }
        breakdown.nameBlankPenalty = nameBlankPenalty;

        // 7. Data Completeness (supplemental - not in spec but keeps existing value)
        const importantFields = this.importanceWeights.importanceFields.map(f => f.name);
        const completeness = this.calculateCompleteness(record, importantFields);
        const completenessScore = completeness * this.config.survivor_selection.weights.completeness;
        score += completenessScore;
        breakdown.completeness = (completeness * 100).toFixed(0) + '%';
        breakdown.completenessScore = completenessScore;

        // 8. Recent Activity (supplemental - not in spec but keeps existing value)
        const daysSinceModified = this.daysSince(record.LastModifiedDate);
        const activityScore = Math.max(0, this.config.survivor_selection.weights.recent_activity - (daysSinceModified / 10));
        score += activityScore;
        breakdown.recentActivity = activityScore;
        breakdown.daysSinceModified = daysSinceModified;

        return { score: Math.round(score), breakdown };
    }

    /**
     * Calculate status score: +200 for Active/Customer, -50 for Prospect/Lead
     * Scans all importance fields that match status patterns
     */
    calculateStatusScore(record) {
        const activeCustomerKeywords = /customer|active|paying|premium|enterprise|platinum|gold|subscribed|live|current/i;
        const prospectLeadKeywords = /prospect|lead|trial|evaluation|cold|inactive|former|ex|churned|cancelled|canceled/i;

        let statusScore = 0;

        // Check all importance fields for status indicators
        for (const field of this.importanceWeights.importanceFields) {
            const value = record[field.name];
            if (!value) continue;

            const valueLower = String(value).toLowerCase();

            // Check if this field looks like a status/type field
            const fieldName = field.name.toLowerCase();
            if (!/type|status|stage|lifecycle|customer|category/.test(fieldName)) {
                continue; // Skip non-status fields
            }

            // Positive status: +200
            if (activeCustomerKeywords.test(valueLower)) {
                statusScore = Math.max(statusScore, 200); // Take max if multiple fields
                break;
            }

            // Negative status: -50
            if (prospectLeadKeywords.test(valueLower)) {
                statusScore = Math.min(statusScore, -50); // Take min (most negative)
            }
        }

        return statusScore;
    }

    /**
     * Calculate revenue score: clamp((ARR + MRR*12 + ACV + TCV)/1000, 0..1000)
     * Searches for revenue fields dynamically
     */
    calculateRevenueScore(record) {
        const revenuePatterns = [
            { pattern: /arr/i, multiplier: 1 },      // Annual Recurring Revenue
            { pattern: /mrr/i, multiplier: 12 },     // Monthly * 12
            { pattern: /acv/i, multiplier: 1 },      // Annual Contract Value
            { pattern: /tcv/i, multiplier: 1 }       // Total Contract Value
        ];

        let totalRevenue = 0;

        // Search all importance fields for revenue indicators
        for (const field of this.importanceWeights.importanceFields) {
            const fieldName = field.name.toLowerCase();

            for (const { pattern, multiplier } of revenuePatterns) {
                if (pattern.test(fieldName)) {
                    const value = parseFloat(record[field.name]) || 0;
                    totalRevenue += value * multiplier;
                }
            }
        }

        // Apply spec formula: clamp(totalRevenue / 1000, 0..1000)
        const revenueScore = Math.max(0, Math.min(1000, totalRevenue / 1000));
        return Math.round(revenueScore);
    }

    /**
     * Calculate website quality score
     * +50 for real website domain
     * -200 for auto-generated patterns (sforce-, .force.com, .my.salesforce.com)
     */
    calculateWebsiteQualityScore(record) {
        const website = record.Website || '';
        if (!website || website.trim() === '') {
            return 0; // No website = neutral
        }

        const websiteLower = website.toLowerCase();

        // Auto-generated patterns (spec-defined)
        const autoGeneratedPatterns = [
            /sforce-/,
            /\.force\.com/,
            /\.my\.salesforce\.com/,
            /example\.com/,
            /test\.com/
        ];

        // Check for auto-generated
        for (const pattern of autoGeneratedPatterns) {
            if (pattern.test(websiteLower)) {
                return -200; // Auto-generated website penalty
            }
        }

        // Check for real domain (has valid TLD and doesn't look fake)
        // Make http:// prefix optional to handle Salesforce's common format
        const hasValidDomain = /^(https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(websiteLower);
        if (hasValidDomain) {
            return 50; // Real website bonus
        }

        return 0; // Unknown/invalid format
    }

    /**
     * Calculate field importance based on value
     */
    calculateFieldImportance(field, value) {
        const valueLower = String(value).toLowerCase();

        // High importance keywords
        if (/customer|active|paying|premium|enterprise|platinum|gold/.test(valueLower)) {
            return field.weight;
        }

        // Medium importance keywords
        if (/prospect|qualified|engaged|silver|trial/.test(valueLower)) {
            return field.weight * 0.5;
        }

        // Low importance keywords
        if (/lead|cold|inactive|churned|bronze|suspended/.test(valueLower)) {
            return 0;
        }

        // Default: has value
        return field.weight * 0.3;
    }

    /**
     * Calculate data completeness
     */
    calculateCompleteness(record, fields) {
        let filled = 0;
        for (const field of fields) {
            if (record[field] && record[field] !== null && record[field] !== '') {
                filled++;
            }
        }
        return fields.length > 0 ? filled / fields.length : 0;
    }

    /**
     * Calculate days since date
     */
    daysSince(dateString) {
        if (!dateString) return 9999;
        const date = new Date(dateString);
        const now = new Date();
        return Math.floor((now - date) / (1000 * 60 * 60 * 24));
    }

    /**
     * Generate summary report
     */
    generateReport() {
        console.log('\n' + '═'.repeat(70));
        console.log('DEDUP SAFETY ANALYSIS');
        console.log('═'.repeat(70));
        console.log(`Org: ${this.orgAlias}`);
        console.log(`Proposed Pairs: ${this.stats.total}`);

        // Blocked merges
        const blocked = this.decisions.filter(d => d.decision === 'BLOCK');
        if (blocked.length > 0) {
            console.log('\n🛑 BLOCKED MERGES (' + blocked.length + '):');
            console.log('─'.repeat(70));
            for (let i = 0; i < Math.min(blocked.length, 10); i++) {
                const decision = blocked[i];
                console.log(`\n${i + 1}. ${decision.recordA.name} vs ${decision.recordB.name}`);
                for (const guardrail of decision.guardrails_triggered.filter(g => g.severity === 'BLOCK')) {
                    console.log(`   Type: ${guardrail.type}`);
                    console.log(`   Reason: ${guardrail.reason}`);
                }
                console.log(`   Recovery: Procedure ${decision.recovery_procedure}`);
            }
        }

        // Review required
        const review = this.decisions.filter(d => d.decision === 'REVIEW');
        if (review.length > 0) {
            console.log('\n⚠ REVIEW REQUIRED (' + review.length + '):');
            console.log('─'.repeat(70));
            for (let i = 0; i < Math.min(review.length, 5); i++) {
                const decision = review[i];
                console.log(`\n${i + 1}. ${decision.recordA.name} vs ${decision.recordB.name}`);
                for (const guardrail of decision.guardrails_triggered.filter(g => g.severity === 'REVIEW')) {
                    console.log(`   Reason: ${guardrail.reason}`);
                }
                const confidence = this.calculateConfidence(decision);
                console.log(`   Confidence: ${confidence}%`);
                const winner = decision.recommended_survivor === decision.recordA.id ? 'A' : 'B';
                console.log(`   Recommendation: APPROVE (survivor: ${winner})`);
            }
        }

        // Auto-approve
        const approved = this.decisions.filter(d => d.decision === 'APPROVE');
        if (approved.length > 0) {
            console.log('\n✅ AUTO-APPROVE (' + approved.length + '):');
            console.log('─'.repeat(70));
            const avgConfidence = approved.reduce((sum, d) => sum + this.calculateConfidence(d), 0) / approved.length;
            console.log(`Average confidence: ${avgConfidence.toFixed(0)}%`);
            console.log('Ready for execution after user approval');
        }

        console.log('\nSUMMARY:');
        console.log(`- Type 1 errors prevented: ${this.stats.type1Prevented}`);
        console.log(`- Type 2 errors prevented: ${this.stats.type2Prevented}`);
        console.log(`- Total merges safe to proceed: ${this.stats.approved}`);
        console.log(`- Total requiring review: ${this.stats.review}`);
        console.log(`- Total blocked: ${this.stats.blocked}`);
        console.log('═'.repeat(70));
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(decision) {
        const scoreA = decision.scores.recordA.score;
        const scoreB = decision.scores.recordB.score;
        const maxScore = Math.max(scoreA, scoreB);
        const minScore = Math.min(scoreA, scoreB);

        if (maxScore === 0) return 50;

        // Confidence based on score difference
        const ratio = minScore / maxScore;
        const confidence = 50 + ((1 - ratio) * 50);

        return Math.round(confidence);
    }

    /**
     * Save results to file
     */
    saveResults(outputFile) {
        const results = {
            org: this.orgAlias,
            timestamp: new Date().toISOString(),
            stats: this.stats,
            decisions: this.decisions
        };

        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
        this.log(`Results saved to: ${outputFile}`, 'INFO');
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || args.includes('--help')) {
        console.log(`
Dedup Safety Engine

Usage:
  node dedup-safety-engine.js analyze <org-alias> <pairs-file> [options]
  node dedup-safety-engine.js single <org-alias> <id-a> <id-b> [options]

Commands:
  analyze    Analyze a batch of duplicate pairs from CSV/JSON
  single     Analyze a single pair of records

Options:
  --config <file>    Path to configuration JSON
  --backup <dir>     Path to backup directory
  --importance <file> Path to importance report
  --output <file>    Output file for results (default: dedup-decisions.json)

Examples:
  node dedup-safety-engine.js single bluerabbit2021-revpal 001xx000ABC 001xx000DEF
  node dedup-safety-engine.js analyze production pairs.csv --config config.json
        `);
        process.exit(0);
    }

    // Parse options
    const getOption = (flag) => {
        const index = args.indexOf(flag);
        return index !== -1 && args[index + 1] ? args[index + 1] : null;
    };

    const orgAlias = args[1];
    let backupDir = getOption('--backup') || path.join(__dirname, `../../backups/${orgAlias}`);
    let importanceReport = getOption('--importance') || path.join(__dirname, `../../field-importance-reports`);
    const configFile = getOption('--config');
    const outputFile = getOption('--output') || 'dedup-decisions.json';

    // Load config if provided
    let config = null;
    if (configFile && fs.existsSync(configFile)) {
        config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }

    // Find latest backup
    if (fs.existsSync(backupDir) && !fs.existsSync(path.join(backupDir, 'backup_manifest.json'))) {
        // Find latest subdirectory
        const subdirs = fs.readdirSync(backupDir)
            .filter(f => fs.statSync(path.join(backupDir, f)).isDirectory())
            .sort()
            .reverse();
        if (subdirs.length > 0) {
            backupDir = path.join(backupDir, subdirs[0]);
        }
    }

    // Find latest importance report
    let importanceFile = importanceReport;
    if (fs.existsSync(importanceReport) && fs.statSync(importanceReport).isDirectory()) {
        const files = fs.readdirSync(importanceReport)
            .filter(f => f.startsWith('importance-fields-') && f.endsWith('.txt'))
            .sort()
            .reverse();
        if (files.length > 0) {
            importanceFile = path.join(importanceReport, files[0]);
        }
    }

    try {
        const engine = new DedupSafetyEngine(orgAlias, backupDir, importanceFile, config);

        if (command === 'single') {
            const idA = args[2];
            const idB = args[3];

            if (!idA || !idB) {
                console.error('Error: Missing record IDs');
                process.exit(1);
            }

            const decision = engine.analyzePair(idA, idB);
            engine.decisions.push(decision);
            engine.generateReport();
            engine.saveResults(outputFile);

        } else if (command === 'analyze') {
            const pairsFile = args[2];
            if (!pairsFile || !fs.existsSync(pairsFile)) {
                console.error('Error: Pairs file not found');
                process.exit(1);
            }

            // Load pairs (simplified - assumes CSV with idA,idB columns)
            const pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf8'));

            for (const pair of pairs) {
                try {
                    const decision = engine.analyzePair(pair.idA, pair.idB);
                    engine.decisions.push(decision);
                } catch (error) {
                    console.error(`Error analyzing pair ${pair.idA}/${pair.idB}: ${error.message}`);
                }
            }

            engine.generateReport();
            engine.saveResults(outputFile);

        } else {
            console.error(`Unknown command: ${command}`);
            process.exit(1);
        }

        process.exit(0);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

module.exports = DedupSafetyEngine;
