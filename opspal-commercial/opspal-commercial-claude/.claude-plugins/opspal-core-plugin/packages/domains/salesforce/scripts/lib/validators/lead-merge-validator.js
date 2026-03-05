#!/usr/bin/env node

/**
 * Lead Merge Validator - Runbook-Compliant Lead-Specific Validation
 *
 * Implements Lead-specific merge validation from Salesforce Record Merging Runbook:
 * 1. Converted Lead Handling - Cannot merge two converted leads
 * 2. Campaign Member Conflicts - Shared campaign memberships
 * 3. Lead Status Preservation - Master status is preserved
 *
 * Runbook References:
 * - "Leads - Using SOAP API (Merge Leads)" section
 * - Converted Leads: "Cannot merge two converted leads. At least one must be unconverted."
 * - Campaign Members: "Salesforce automatically handles duplicate campaign memberships"
 * - Lead Conversion: "Merging doesn't undo conversion. Master status preserved."
 *
 * Usage:
 *   const validator = new LeadMergeValidator(orgAlias, options);
 *   const result = await validator.validateObjectSpecificRules(master, duplicate, profile);
 *
 * @version 1.0.0
 * @phase Phase 3.1 - Lead-Specific Safety Checks
 */

const { execSync } = require('child_process');

class LeadMergeValidator {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.options = options;
  }

  /**
   * Main validation method for Lead-specific rules
   * Called by DedupSafetyEngine
   */
  async validateObjectSpecificRules(masterRecord, duplicateRecord, profile) {
    const errors = [];

    // Check 1: Converted lead status (Runbook requirement)
    const convertedResult = await this.checkConvertedLeadStatus(masterRecord, duplicateRecord, profile);
    if (convertedResult.errors) {
      errors.push(...convertedResult.errors);
    }

    // Check 2: Campaign member conflicts
    const campaignResult = await this.checkCampaignMembers(masterRecord, duplicateRecord, profile);
    if (campaignResult.errors) {
      errors.push(...campaignResult.errors);
    }

    // Check 3: Lead conversion status information
    const conversionInfoResult = await this.checkLeadConversionInfo(masterRecord, duplicateRecord, profile);
    if (conversionInfoResult.errors) {
      errors.push(...conversionInfoResult.errors);
    }

    return { errors };
  }

  /**
   * Check 1: Converted Lead Status
   *
   * Runbook: "Leads cannot be merged if both leads are already converted.
   * At least one lead must be unconverted for the merge to proceed."
   *
   * Implementation:
   * - Query IsConverted field for both master and duplicate
   * - If BOTH are converted → BLOCK merge with TYPE1_ERROR
   * - If one is converted → Provide information about status preservation
   */
  async checkConvertedLeadStatus(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.validation?.checkConvertedStatus) {
      return { errors };
    }

    try {
      // Query IsConverted field for both leads
      const leadQuery = `SELECT Id, Name, IsConverted, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId, ConvertedDate
                         FROM Lead
                         WHERE Id IN ('${masterRecord.Id}', '${duplicateRecord.Id}')`;

      const cmd = `sf data query --query "${leadQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const leads = parsed.result?.records || [];
      const master = leads.find(l => l.Id === masterRecord.Id);
      const duplicate = leads.find(l => l.Id === duplicateRecord.Id);

      if (!master || !duplicate) {
        errors.push({
          type: 'VALIDATION_ERROR',
          severity: 'WARN',
          message: 'Could not query IsConverted status for leads',
          details: { masterFound: !!master, duplicateFound: !!duplicate }
        });
        return { errors };
      }

      // Critical check: Both leads converted → BLOCK
      if (master.IsConverted === true && duplicate.IsConverted === true) {
        errors.push({
          type: 'CONVERTED_LEAD_MERGE_BLOCKED',
          severity: 'TYPE1_ERROR',
          message: 'Cannot merge two converted leads - at least one must be unconverted',
          details: {
            masterLead: {
              id: master.Id,
              name: master.Name,
              isConverted: master.IsConverted,
              convertedDate: master.ConvertedDate,
              convertedAccountId: master.ConvertedAccountId,
              convertedContactId: master.ConvertedContactId,
              convertedOpportunityId: master.ConvertedOpportunityId
            },
            duplicateLead: {
              id: duplicate.Id,
              name: duplicate.Name,
              isConverted: duplicate.IsConverted,
              convertedDate: duplicate.ConvertedDate,
              convertedAccountId: duplicate.ConvertedAccountId,
              convertedContactId: duplicate.ConvertedContactId,
              convertedOpportunityId: duplicate.ConvertedOpportunityId
            }
          },
          runbookReference: 'Leads - Using SOAP API: Cannot merge two converted leads',
          remediation: [
            'BLOCKED: Salesforce does not allow merging two converted leads',
            'Best practice: Merge leads BEFORE conversion to avoid this issue',
            'Alternative 1: Merge the Account/Contact records created by conversion instead',
            'Alternative 2: If duplicate conversion was mistake, delete converted records and reconvert to correct Account/Contact',
            'Alternative 3: Manually consolidate data between the two converted Account/Contact pairs'
          ],
          recommendation: 'Deduplicate leads BEFORE conversion for clean data management'
        });
      }

      // Info: One lead converted, one not → Provide guidance
      if (master.IsConverted === true && duplicate.IsConverted === false) {
        errors.push({
          type: 'CONVERTED_LEAD_STATUS_INFO',
          severity: 'INFO',
          message: 'Master lead is converted, duplicate is not - master conversion status preserved',
          details: {
            masterConverted: {
              id: master.Id,
              convertedDate: master.ConvertedDate,
              convertedAccountId: master.ConvertedAccountId,
              convertedContactId: master.ConvertedContactId
            },
            duplicateUnconverted: {
              id: duplicate.Id,
              name: duplicate.Name
            }
          },
          note: 'After merge, the surviving record will remain converted and linked to existing Account/Contact/Opportunity'
        });
      }

      if (master.IsConverted === false && duplicate.IsConverted === true) {
        errors.push({
          type: 'CONVERTED_LEAD_STATUS_INFO',
          severity: 'INFO',
          message: 'Duplicate lead is converted, master is not - master unconverted status preserved',
          details: {
            masterUnconverted: {
              id: master.Id,
              name: master.Name
            },
            duplicateConverted: {
              id: duplicate.Id,
              convertedDate: duplicate.ConvertedDate,
              convertedAccountId: duplicate.ConvertedAccountId,
              convertedContactId: duplicate.ConvertedContactId
            }
          },
          note: 'After merge, the surviving record will remain UNCONVERTED. Duplicate conversion records (Account/Contact) will not be affected.',
          recommendation: 'Consider if you should merge the converted duplicate\'s Account/Contact instead'
        });
      }

    } catch (error) {
      this.log(`Converted lead check failed: ${error.message}`, 'ERROR');
      errors.push({
        type: 'VALIDATION_ERROR',
        severity: 'WARN',
        message: 'Could not validate converted lead status',
        details: { error: error.message }
      });
    }

    return { errors };
  }

  /**
   * Check 2: Campaign Member Conflicts
   *
   * Runbook: "When merging leads, if both leads are members of the same campaign,
   * Salesforce automatically handles the deduplication. One CampaignMember record
   * remains per Lead per Campaign."
   *
   * Implementation:
   * - Query CampaignMember records for both leads
   * - Identify shared campaigns
   * - Inform user (INFO level) - Salesforce handles automatically
   */
  async checkCampaignMembers(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.specialCases?.campaignMembers?.enabled) {
      return { errors };
    }

    try {
      // Query CampaignMember for both leads
      const cmQuery = `SELECT Id, CampaignId, Campaign.Name, LeadId, Status, CreatedDate
                       FROM CampaignMember
                       WHERE LeadId IN ('${masterRecord.Id}', '${duplicateRecord.Id}')`;

      const cmd = `sf data query --query "${cmQuery}" --target-org ${this.orgAlias} --json`;
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(result);

      const campaignMembers = parsed.result?.records || [];

      if (campaignMembers.length === 0) {
        // No campaign memberships - safe to proceed
        return { errors };
      }

      // Group by CampaignId to find shared campaigns
      const campaignMap = {};
      for (const cm of campaignMembers) {
        if (!campaignMap[cm.CampaignId]) {
          campaignMap[cm.CampaignId] = {
            campaignId: cm.CampaignId,
            campaignName: cm.Campaign?.Name,
            masterMember: null,
            duplicateMember: null
          };
        }

        if (cm.LeadId === masterRecord.Id) {
          campaignMap[cm.CampaignId].masterMember = {
            id: cm.Id,
            status: cm.Status,
            createdDate: cm.CreatedDate
          };
        } else {
          campaignMap[cm.CampaignId].duplicateMember = {
            id: cm.Id,
            status: cm.Status,
            createdDate: cm.CreatedDate
          };
        }
      }

      // Find campaigns with memberships for BOTH leads
      const sharedCampaigns = Object.values(campaignMap).filter(
        c => c.masterMember && c.duplicateMember
      );

      if (sharedCampaigns.length > 0) {
        // INFO: Shared campaigns detected - Salesforce handles automatically
        errors.push({
          type: 'DUPLICATE_CAMPAIGN_MEMBERS',
          severity: 'INFO',
          message: `${sharedCampaigns.length} shared campaign(s) detected - Salesforce will deduplicate automatically`,
          details: {
            sharedCampaigns: sharedCampaigns.map(sc => ({
              campaignId: sc.campaignId,
              campaignName: sc.campaignName,
              masterStatus: sc.masterMember.status,
              duplicateStatus: sc.duplicateMember.status,
              masterCreated: sc.masterMember.createdDate,
              duplicateCreated: sc.duplicateMember.createdDate
            }))
          },
          runbookReference: 'Salesforce automatically prevents duplicate CampaignMember records (one per Lead+Campaign)',
          note: 'After merge, one CampaignMember record will remain per Campaign. No action required.',
          automaticHandling: 'Salesforce prevents duplicate CampaignMember records at the database level'
        });
      }

      // Also report if leads are in different campaigns (not shared)
      const masterOnlyCampaigns = Object.values(campaignMap).filter(
        c => c.masterMember && !c.duplicateMember
      );
      const duplicateOnlyCampaigns = Object.values(campaignMap).filter(
        c => !c.masterMember && c.duplicateMember
      );

      if (masterOnlyCampaigns.length > 0 || duplicateOnlyCampaigns.length > 0) {
        errors.push({
          type: 'CAMPAIGN_MEMBER_CONSOLIDATION',
          severity: 'INFO',
          message: `Campaign memberships will be consolidated: ${masterOnlyCampaigns.length} master-only, ${duplicateOnlyCampaigns.length} duplicate-only`,
          details: {
            masterOnlyCampaigns: masterOnlyCampaigns.length,
            duplicateOnlyCampaigns: duplicateOnlyCampaigns.length,
            totalAfterMerge: masterOnlyCampaigns.length + duplicateOnlyCampaigns.length + sharedCampaigns.length
          },
          note: 'All campaign memberships will be reparented to the master lead'
        });
      }

    } catch (error) {
      this.log(`Campaign member check failed: ${error.message}`, 'DEBUG');
      // Not a critical error - CampaignMember check is informational
    }

    return { errors };
  }

  /**
   * Check 3: Lead Conversion Status Information
   *
   * Runbook: "Merging leads is separate from lead conversion. Merging doesn't
   * undo conversion. The master record's conversion status is preserved."
   *
   * Implementation:
   * - Provide clear information about conversion status after merge
   * - Clarify that merge does NOT create Account/Contact/Opportunity
   * - Recommend best practices
   */
  async checkLeadConversionInfo(masterRecord, duplicateRecord, profile) {
    const errors = [];

    if (!profile.specialCases?.leadConversion?.enabled) {
      return { errors };
    }

    // This is informational - always provide guidance
    errors.push({
      type: 'LEAD_CONVERSION_GUIDANCE',
      severity: 'INFO',
      message: 'Lead merge does NOT affect conversion status or create Account/Contact/Opportunity records',
      details: {
        clarification: [
          'Lead merge is SEPARATE from lead conversion',
          'Merging does NOT convert leads',
          'Merging does NOT create Account/Contact/Opportunity records',
          'Master record\'s conversion status is preserved after merge'
        ],
        bestPractices: [
          'Best practice: Merge leads BEFORE conversion for cleanest results',
          'If merging post-conversion: Prefer unconverted lead as master',
          'If both converted: Consider merging Account/Contact records instead',
          'Use queryAll() to audit merged leads: query IsDeleted=true with MasterRecordId'
        ]
      },
      runbookReference: 'Lead conversion vs merge are separate operations (merge doesn\'t create Account/Contact)',
      note: 'This is informational guidance to prevent common misconceptions about lead merging'
    });

    return { errors };
  }

  /**
   * Logging helper
   */
  log(message, level = 'INFO') {
    if (this.options.verbose || level === 'ERROR' || level === 'WARN') {
      const prefix = {
        'INFO': '  ℹ️ ',
        'WARN': '  ⚠️ ',
        'ERROR': '  ❌',
        'DEBUG': '  🔍'
      }[level] || '  ';

      console.log(`${prefix}${message}`);
    }
  }
}

module.exports = LeadMergeValidator;
