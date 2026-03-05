/**
 * Phase 1: Salesforce-Aware Master Selection
 *
 * Selects the best master company from a duplicate group using:
 * 1. Most recent successful Salesforce sync (PRIMARY)
 * 2. Association richness (contacts, deals, tickets)
 * 3. Data completeness
 * 4. Activity recency
 * 5. Creation date (oldest as tiebreaker)
 */

/**
 * Calculate Salesforce sync score
 * Higher score = better candidate for master
 */
function getSalesforceSyncScore(company) {
  const sfId = company.properties.hs_salesforce_object_id;
  const lastSync = company.properties.hs_salesforce_last_sync;
  const syncStatus = company.properties.hs_salesforce_sync_status;

  // No Salesforce ID = lowest priority
  if (!sfId || sfId.trim() === '') {
    return 0;
  }

  // Sync errors = very low priority
  if (syncStatus === 'error' || syncStatus === 'failed') {
    return 1;
  }

  // Has Salesforce ID but no sync timestamp
  if (!lastSync) {
    return 50;
  }

  // Calculate recency score (more recent = higher score)
  const lastSyncDate = new Date(lastSync);
  const daysSinceSync = (Date.now() - lastSyncDate) / (1000 * 60 * 60 * 24);

  // Recent sync (< 1 day) = 100 points
  // Decays linearly: 1 day = 99, 2 days = 98, etc.
  // Minimum 50 points for any successful sync
  const recencyScore = Math.max(100 - daysSinceSync, 50);

  return recencyScore;
}

/**
 * Calculate association richness score
 * More associations = better candidate
 */
function getAssociationScore(company) {
  const contactCount = parseInt(company.properties.num_associated_contacts || 0);
  const dealCount = parseInt(company.properties.num_associated_deals || 0);
  const ticketCount = parseInt(company.properties.num_notes || 0); // Using notes as proxy for activity

  // Weight: contacts = 1, deals = 5, tickets/notes = 0.5
  const weightedScore = contactCount + (dealCount * 5) + (ticketCount * 0.5);

  // Normalize to 0-100 scale (assuming max reasonable is ~200 weighted associations)
  return Math.min((weightedScore / 200) * 100, 100);
}

/**
 * Calculate data completeness score
 * More populated fields = better candidate
 */
function getDataCompletenessScore(company) {
  const importantFields = [
    'phone',
    'city',
    'state',
    'zip',
    'country',
    'industry',
    'numberofemployees',
    'annualrevenue',
    'description',
    'linkedin_company_page',
    'domain',
    'website'
  ];

  const populatedCount = importantFields.filter(field => {
    const value = company.properties[field];
    return value && value.toString().trim() !== '';
  }).length;

  // Normalize to 0-100 scale
  return (populatedCount / importantFields.length) * 100;
}

/**
 * Calculate activity recency score
 * More recent activity = better candidate
 */
function getActivityRecencyScore(company) {
  const lastModified = company.properties.hs_lastmodifieddate;
  const lastEngagement = company.properties.notes_last_updated || company.properties.hs_lastmodifieddate;

  if (!lastEngagement && !lastModified) {
    return 0;
  }

  const activityDate = new Date(lastEngagement || lastModified);
  const daysSinceActivity = (Date.now() - activityDate) / (1000 * 60 * 60 * 24);

  // Recent activity (< 1 day) = 100 points
  // Decays logarithmically
  const recencyScore = Math.max(100 - Math.log10(daysSinceActivity + 1) * 20, 0);

  return recencyScore;
}

/**
 * Calculate creation date score (older = better for tiebreaker)
 */
function getCreationDateScore(company, allCompanies) {
  const createdDate = new Date(company.properties.createdate || Date.now());

  const allCreatedDates = allCompanies.map(c =>
    new Date(c.properties.createdate || Date.now()).getTime()
  );

  const oldestDate = Math.min(...allCreatedDates);
  const newestDate = Math.max(...allCreatedDates);

  // Avoid division by zero
  if (oldestDate === newestDate) {
    return 50;
  }

  // Older = higher score (inverted scale)
  const dateRange = newestDate - oldestDate;
  const position = createdDate.getTime() - oldestDate;
  const score = 100 - ((position / dateRange) * 100);

  return score;
}

/**
 * Select the master company from a duplicate group
 *
 * @param {Object} duplicateGroup - Duplicate group with companies array
 * @returns {Object} - Selected master company with selection reasoning
 */
function selectMaster(duplicateGroup) {
  const companies = duplicateGroup.companies;

  if (!companies || companies.length === 0) {
    throw new Error('No companies in duplicate group');
  }

  if (companies.length === 1) {
    return {
      master: companies[0],
      reasoning: 'Only one company in group',
      scores: {}
    };
  }

  // Calculate scores for each company
  const scored = companies.map(company => {
    const scores = {
      salesforceSync: getSalesforceSyncScore(company),
      associations: getAssociationScore(company),
      dataCompleteness: getDataCompletenessScore(company),
      activityRecency: getActivityRecencyScore(company),
      creationDate: getCreationDateScore(company, companies)
    };

    // Weighted total score
    // Salesforce sync is MOST important (50% weight)
    // Associations second (25% weight)
    // Data completeness third (15% weight)
    // Activity recency (5% weight)
    // Creation date (5% weight - tiebreaker)
    const totalScore =
      (scores.salesforceSync * 0.50) +
      (scores.associations * 0.25) +
      (scores.dataCompleteness * 0.15) +
      (scores.activityRecency * 0.05) +
      (scores.creationDate * 0.05);

    return {
      company,
      scores,
      totalScore
    };
  });

  // Sort by total score (descending)
  scored.sort((a, b) => b.totalScore - a.totalScore);

  const winner = scored[0];
  const runnerUp = scored[1];

  // Build reasoning
  const reasoning = buildReasoning(winner, runnerUp, scored);

  return {
    master: winner.company,
    scores: winner.scores,
    totalScore: winner.totalScore,
    reasoning: reasoning,
    alternatives: scored.slice(1).map(s => ({
      companyId: s.company.id,
      companyName: s.company.properties.name,
      totalScore: s.totalScore,
      scores: s.scores
    }))
  };
}

/**
 * Build human-readable reasoning for master selection
 */
function buildReasoning(winner, runnerUp, allScored) {
  const reasons = [];

  const w = winner.scores;
  const r = runnerUp ? runnerUp.scores : {};

  // Salesforce sync reason
  if (w.salesforceSync > 0) {
    if (w.salesforceSync >= 90) {
      reasons.push('Recent successful Salesforce sync (< 10 days)');
    } else if (w.salesforceSync >= 50) {
      reasons.push('Has Salesforce sync');
    }
  }

  // If winner has SF sync but runner-up doesn't
  if (runnerUp && w.salesforceSync > 50 && r.salesforceSync < 50) {
    reasons.push('Only company with active Salesforce sync');
  }

  // Association richness
  if (w.associations > 50) {
    const contactCount = parseInt(winner.company.properties.num_associated_contacts || 0);
    const dealCount = parseInt(winner.company.properties.num_associated_deals || 0);
    reasons.push(`Most associations (${contactCount} contacts, ${dealCount} deals)`);
  }

  // Data completeness
  if (w.dataCompleteness > 70) {
    reasons.push('Most complete data');
  }

  // Activity recency
  if (w.activityRecency > 70) {
    reasons.push('Most recent activity');
  }

  // Creation date (if close scores)
  if (runnerUp && Math.abs(winner.totalScore - runnerUp.totalScore) < 5) {
    if (w.creationDate > r.creationDate) {
      reasons.push('Oldest record (tiebreaker)');
    }
  }

  return reasons.join('; ');
}

/**
 * Validate master selection
 * Ensures the selected master doesn't have issues
 */
function validateMasterSelection(masterResult, duplicateGroup) {
  const warnings = [];

  const master = masterResult.master;

  // Check if master has Salesforce sync errors
  if (master.properties.hs_salesforce_sync_status === 'error') {
    warnings.push('Selected master has Salesforce sync errors');
  }

  // Check if master is missing critical fields
  const criticalFields = ['name', 'domain'];
  const missingFields = criticalFields.filter(field =>
    !master.properties[field] || master.properties[field].trim() === ''
  );

  if (missingFields.length > 0) {
    warnings.push(`Master missing critical fields: ${missingFields.join(', ')}`);
  }

  // Check if a duplicate has significantly more associations
  const masterAssociations = parseInt(master.properties.num_associated_contacts || 0) +
                              parseInt(master.properties.num_associated_deals || 0);

  duplicateGroup.companies.forEach(company => {
    if (company.id === master.id) return;

    const companyAssociations = parseInt(company.properties.num_associated_contacts || 0) +
                                 parseInt(company.properties.num_associated_deals || 0);

    if (companyAssociations > masterAssociations * 2) {
      warnings.push(
        `Duplicate ${company.id} has significantly more associations (${companyAssociations}) than master (${masterAssociations})`
      );
    }
  });

  return {
    valid: warnings.length === 0,
    warnings: warnings
  };
}

module.exports = {
  selectMaster,
  validateMasterSelection,
  getSalesforceSyncScore,
  getAssociationScore,
  getDataCompletenessScore,
  getActivityRecencyScore,
  getCreationDateScore
};
