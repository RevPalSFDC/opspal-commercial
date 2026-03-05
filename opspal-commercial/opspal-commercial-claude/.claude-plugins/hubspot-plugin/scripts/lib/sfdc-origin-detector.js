/**
 * SFDC Origin Detector
 *
 * Detects if HubSpot companies have Salesforce integration origin,
 * which blocks API-based merging due to HubSpot's SFDC constraint.
 *
 * @see docs/HUBSPOT_SFDC_MERGE_CONSTRAINT.md
 */

class SFDCOriginDetector {
  constructor(hubspotClient) {
    this.client = hubspotClient;
  }

  /**
   * Check if a single company has SFDC origin
   *
   * @param {string} companyId - HubSpot company ID
   * @returns {Promise<Object>} Detection result
   */
  async check(companyId) {
    try {
      const company = await this.client.get(`/crm/v3/objects/companies/${companyId}`, {
        properties: [
          'name',
          'salesforceaccountid',
          'createdate',
          'hs_created_by_user_id',
          'hs_object_source',
          'hs_object_source_id'
        ]
      });

      const indicators = this._analyzeIndicators(company);
      const confidence = this._calculateConfidence(indicators);

      return {
        companyId,
        companyName: company.properties.name,
        hasSFDCOrigin: confidence >= 0.5,
        confidence,
        canUseMergeAPI: confidence < 0.5,
        recommendedMethod: confidence >= 0.5 ? 'lift-and-shift' : 'merge-api',
        indicators,
        details: {
          salesforceAccountId: company.properties.salesforceaccountid || null,
          createdDate: company.properties.createdate,
          objectSource: company.properties.hs_object_source,
          createdByUserId: company.properties.hs_created_by_user_id
        }
      };
    } catch (error) {
      return {
        companyId,
        error: error.message,
        hasSFDCOrigin: null,
        canUseMergeAPI: null,
        confidence: null
      };
    }
  }

  /**
   * Check if a pair of companies can be merged via API
   *
   * @param {string} companyId1 - First company ID
   * @param {string} companyId2 - Second company ID
   * @returns {Promise<Object>} Merge feasibility assessment
   */
  async checkPair(companyId1, companyId2) {
    const [result1, result2] = await Promise.all([
      this.check(companyId1),
      this.check(companyId2)
    ]);

    const anySFDCOrigin = result1.hasSFDCOrigin || result2.hasSFDCOrigin;
    const maxConfidence = Math.max(result1.confidence || 0, result2.confidence || 0);

    return {
      company1: result1,
      company2: result2,
      canUseMergeAPI: !anySFDCOrigin,
      mustUseLiftAndShift: anySFDCOrigin,
      recommendedMethod: anySFDCOrigin ? 'lift-and-shift' : 'merge-api',
      confidence: maxConfidence,
      reasoning: anySFDCOrigin
        ? 'One or both companies have SFDC integration origin - merge API will fail'
        : 'Neither company has SFDC origin - merge API should work'
    };
  }

  /**
   * Batch check multiple companies
   *
   * @param {Array<string>} companyIds - Array of company IDs
   * @returns {Promise<Object>} Batch results
   */
  async checkBatch(companyIds) {
    const results = [];
    let sfdcOriginCount = 0;
    let canUseMergeAPICount = 0;

    for (const companyId of companyIds) {
      const result = await this.check(companyId);
      results.push(result);

      if (result.hasSFDCOrigin) sfdcOriginCount++;
      if (result.canUseMergeAPI) canUseMergeAPICount++;
    }

    return {
      total: companyIds.length,
      sfdcOriginCount,
      sfdcOriginPercent: ((sfdcOriginCount / companyIds.length) * 100).toFixed(1) + '%',
      canUseMergeAPICount,
      mustUseLiftAndShiftCount: companyIds.length - canUseMergeAPICount,
      results,
      summary: {
        recommendation:
          sfdcOriginCount > 0
            ? `Use lift-and-shift for all ${companyIds.length} companies (${sfdcOriginCount} have SFDC origin)`
            : `Merge API safe for all ${companyIds.length} companies`,
        safestMethod: 'lift-and-shift' // Always safe
      }
    };
  }

  /**
   * Analyze SFDC origin indicators
   * @private
   */
  _analyzeIndicators(company) {
    const indicators = {
      hasSalesforceAccountId: false,
      objectSourceIsSFDC: false,
      createdBySFDCConnector: false,
      likelySFDCNaming: false
    };

    // Check for Salesforce Account ID (strongest indicator)
    if (company.properties.salesforceaccountid) {
      indicators.hasSalesforceAccountId = true;
    }

    // Check object source
    const source = company.properties.hs_object_source;
    if (source && (source.includes('SALESFORCE') || source.includes('SFDC'))) {
      indicators.objectSourceIsSFDC = true;
    }

    // Check if created by Salesforce connector user
    const sourceId = company.properties.hs_object_source_id;
    if (sourceId && sourceId.includes('salesforce')) {
      indicators.createdBySFDCConnector = true;
    }

    return indicators;
  }

  /**
   * Calculate confidence that company has SFDC origin
   * @private
   */
  _calculateConfidence(indicators) {
    let score = 0;
    let maxScore = 0;

    // Salesforce Account ID is strongest indicator
    maxScore += 10;
    if (indicators.hasSalesforceAccountId) score += 10;

    // Object source is strong indicator
    maxScore += 5;
    if (indicators.objectSourceIsSFDC) score += 5;

    // Created by SFDC connector is moderate indicator
    maxScore += 3;
    if (indicators.createdBySFDCConnector) score += 3;

    return maxScore > 0 ? score / maxScore : 0;
  }
}

module.exports = SFDCOriginDetector;

// CLI usage
if (require.main === module) {
  const HubSpotClientV3 = require('../../lib/hubspot-client-v3');

  const companyId = process.argv[2];
  if (!companyId) {
    console.error('Usage: node sfdc-origin-detector.js <company-id>');
    console.error('Example: node sfdc-origin-detector.js 40979075625');
    process.exit(1);
  }

  const client = new HubSpotClientV3({
    accessToken: process.env.HUBSPOT_API_KEY,
    portalId: process.env.HUBSPOT_PORTAL_ID
  });

  const detector = new SFDCOriginDetector(client);

  detector
    .check(companyId)
    .then((result) => {
      console.log('\n🔍 SFDC Origin Detection Results\n');
      console.log('Company:', result.companyName);
      console.log('ID:', result.companyId);
      console.log('Has SFDC Origin:', result.hasSFDCOrigin ? '✅ YES' : '❌ NO');
      console.log('Confidence:', (result.confidence * 100).toFixed(1) + '%');
      console.log('Can Use Merge API:', result.canUseMergeAPI ? '✅ YES' : '❌ NO');
      console.log('Recommended Method:', result.recommendedMethod.toUpperCase());
      console.log('\nIndicators:');
      console.log('  Salesforce Account ID:', result.indicators.hasSalesforceAccountId ? '✅' : '❌');
      console.log('  Object Source is SFDC:', result.indicators.objectSourceIsSFDC ? '✅' : '❌');
      console.log('  Created by SFDC Connector:', result.indicators.createdBySFDCConnector ? '✅' : '❌');
      console.log('\nDetails:');
      console.log('  SF Account ID:', result.details.salesforceAccountId || 'None');
      console.log('  Created Date:', result.details.createdDate);
      console.log('  Object Source:', result.details.objectSource || 'None');
    })
    .catch((err) => {
      console.error('❌ Detection failed:', err.message);
      process.exit(1);
    });
}
