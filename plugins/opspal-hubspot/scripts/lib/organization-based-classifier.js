#!/usr/bin/env node

/**
 * Organization-Based Government Classifier
 *
 * METHODOLOGY: Classify by DEPARTMENT/ORGANIZATION, not job title
 *
 * Key Principle:
 * - IT Manager at Police Department → Local Law Enforcement (because org is police)
 * - Chief with la.gov email → Determine department → Classify by department
 *
 * This addresses the core issue where title-based classification led to:
 * - 94.5% error rate on Sheriff classifications
 * - Too many "Unclassified" results
 * - Misclassifications based on ambiguous titles
 */

/**
 * Department to Classification Bucket Mapping
 *
 * Maps identified departments/organizations to government buckets
 * Regardless of the person's job title within that organization
 */
/**
 * HubSpot Property Values Mapping
 * Maps display labels to internal snake_case values used in persona_department property
 */
const PERSONA_DEPARTMENT_VALUES = {
  'Local Law Enforcement': 'local_law_enforcement',
  'County Sheriff': 'county_sheriff',
  'University Police': 'university_police',
  'District Attorney': 'district_attorney',
  'County Prosecutors': 'county_prosecutors',
  'Commonwealth Attorney': 'commonwealth_attorney',
  'Municipal Fire Department': 'municipal_fire_department',
  'County Fire Department': 'county_fire_department',
  'County EMS': 'county_ems',
  'Hospital EMS Divisions': 'hospital_ems_divisions',
  'City/County EM Office': 'city_county_em_office',
  'Public Safety Answering Points': 'public_safety_answering_points',
  '911 Center': '911_center',
  'Highway Patrol': 'highway_patrol',
  'State Police': 'state_police',
  'DOT': 'dot',
  'FEMA': 'fema'
};

const DEPARTMENT_TO_BUCKET = {
  // Law Enforcement - Local
  'police department': 'Local Law Enforcement',
  'police dept': 'Local Law Enforcement',
  'city police': 'Local Law Enforcement',
  'town police': 'Local Law Enforcement',
  'municipal police': 'Local Law Enforcement',
  'local police': 'Local Law Enforcement',

  // Law Enforcement - Sheriff
  'sheriff': 'County Sheriff',
  "sheriff's office": 'County Sheriff',
  "sheriff's department": 'County Sheriff',
  'county sheriff': 'County Sheriff',

  // Law Enforcement - State
  'highway patrol': 'Highway Patrol',
  'state patrol': 'Highway Patrol',
  'state police': 'State Police',
  'state trooper': 'State Police',

  // Law Enforcement - University
  'university police': 'University Police',
  'campus police': 'University Police',
  'college police': 'University Police',

  // Fire Departments
  'fire department': 'Municipal Fire Department',
  'fire dept': 'Municipal Fire Department',
  'city fire': 'Municipal Fire Department',
  'town fire': 'Municipal Fire Department',
  'fire district': 'Municipal Fire Department',
  'county fire': 'County Fire Department',

  // EMS
  'emergency medical': 'County EMS',
  'ems': 'County EMS',
  'ambulance service': 'County EMS',

  // Emergency Management
  'emergency management': 'City/County EM Office',
  'emergency services': 'City/County EM Office',
  'disaster services': 'City/County EM Office',

  // Legal/Prosecution
  'district attorney': 'District Attorney',
  "district attorney's": 'District Attorney',
  'county attorney': 'County Prosecutors',
  'county prosecutor': 'County Prosecutors',
  'commonwealth attorney': 'Commonwealth Attorney',

  // 911/Dispatch
  'psap': 'Public Safety Answering Points',
  '911': '911 Center',
  'dispatch': 'Public Safety Answering Points',
  'communications center': 'Public Safety Answering Points',

  // Federal
  'fema': 'FEMA',
  'federal emergency': 'FEMA',

  // DOT
  'department of transportation': 'DOT',
  'dot': 'DOT',
  'highway department': 'DOT'
};

/**
 * Extract department/organization from web search results
 *
 * Looks for explicit department mentions in search results
 * Prioritizes authoritative sources (.gov sites)
 *
 * @param {Array} searchResults - Array of search result objects with {title, snippet, url}
 * @param {Object} contact - Contact object with {name, title, email, company}
 * @returns {Object} - {department, source, confidence, evidence}
 */
function extractDepartmentFromSearchResults(searchResults, contact) {
  if (!searchResults || searchResults.length === 0) {
    return {
      department: null,
      source: null,
      confidence: 0,
      evidence: 'No search results available',
      method: 'no_results'
    };
  }

  // Combine all text from search results, prioritize .gov sources
  const govResults = searchResults.filter(r => r.url && r.url.includes('.gov'));
  const otherResults = searchResults.filter(r => !r.url || !r.url.includes('.gov'));

  // Process .gov results first (highest confidence)
  if (govResults.length > 0) {
    const result = extractDepartmentFromResults(govResults, contact, 'gov_site');
    if (result.department) {
      return result;
    }
  }

  // Then try other results (medium confidence)
  if (otherResults.length > 0) {
    const result = extractDepartmentFromResults(otherResults, contact, 'web_search');
    if (result.department) {
      return result;
    }
  }

  return {
    department: null,
    source: null,
    confidence: 0,
    evidence: 'No clear department found in search results',
    method: 'extraction_failed'
  };
}

/**
 * Extract department from a set of search results
 *
 * @param {Array} results - Search results to analyze
 * @param {Object} contact - Contact information
 * @param {String} sourceType - Type of source (gov_site, web_search, linkedin)
 * @returns {Object} - Department extraction result
 */
function extractDepartmentFromResults(results, contact, sourceType) {
  // Combine all text
  const allText = results
    .map(r => `${r.title || ''} ${r.snippet || ''}`)
    .join(' ')
    .toLowerCase();

  // Look for explicit department mentions
  const departmentPatterns = [
    /(?:works?\s+for|employed\s+by|with|at)\s+(?:the\s+)?([a-z\s]+(?:police|sheriff|fire|ems|emergency|district attorney|court|government)(?:\s+department|\s+office|\s+division)?)/i,
    /([a-z\s]+(?:police|sheriff|fire))\s+(?:department|dept|office)/i,
    /((?:city|town|county|municipal)\s+of\s+[a-z\s]+)\s+(?:police|fire|government)/i,
    /(?:chief|captain|lieutenant|sergeant|deputy|director)\s+(?:of|at)\s+(?:the\s+)?([a-z\s]+(?:police|sheriff|fire|ems))/i
  ];

  for (const pattern of departmentPatterns) {
    const match = allText.match(pattern);
    if (match && match[1]) {
      const department = match[1].trim();
      const confidence = sourceType === 'gov_site' ? 95 : 85;

      return {
        department: department,
        source: results[0].url || 'search_result',
        confidence: confidence,
        evidence: `Found "${department}" in ${sourceType}`,
        method: `department_extracted_${sourceType}`,
        matchedText: match[0]
      };
    }
  }

  // Check if contact's company name contains department info
  if (contact.company && contact.company !== 'Unknown') {
    const companyLower = contact.company.toLowerCase();
    for (const [deptKeyword, bucket] of Object.entries(DEPARTMENT_TO_BUCKET)) {
      if (companyLower.includes(deptKeyword)) {
        return {
          department: contact.company,
          source: 'hubspot_company_field',
          confidence: 80,
          evidence: `Company name "${contact.company}" indicates department`,
          method: 'company_field_match',
          matchedKeyword: deptKeyword
        };
      }
    }
  }

  return { department: null };
}

/**
 * Convert display label to HubSpot internal value
 *
 * @param {String} displayLabel - Display label (e.g., "Local Law Enforcement")
 * @returns {String} - Internal value (e.g., "local_law_enforcement")
 */
function toHubSpotValue(displayLabel) {
  return PERSONA_DEPARTMENT_VALUES[displayLabel] || null;
}

/**
 * Convert HubSpot internal value to display label
 *
 * @param {String} internalValue - Internal value (e.g., "local_law_enforcement")
 * @returns {String} - Display label (e.g., "Local Law Enforcement")
 */
function toDisplayLabel(internalValue) {
  for (const [label, value] of Object.entries(PERSONA_DEPARTMENT_VALUES)) {
    if (value === internalValue) {
      return label;
    }
  }
  return null;
}

/**
 * Classify a contact based on identified department/organization
 *
 * @param {String} department - Identified department/organization
 * @returns {Object} - {bucket, hubspotValue, confidence, rationale}
 */
function classifyByDepartment(department) {
  if (!department) {
    return {
      bucket: 'Unclassified',
      hubspotValue: null,
      confidence: 0,
      rationale: 'No department identified',
      requiresManualReview: true
    };
  }

  const deptLower = department.toLowerCase();

  // Try exact matches first
  for (const [keyword, bucket] of Object.entries(DEPARTMENT_TO_BUCKET)) {
    if (deptLower.includes(keyword)) {
      return {
        bucket: bucket,
        hubspotValue: toHubSpotValue(bucket),
        confidence: 90,
        rationale: `Department "${department}" maps to ${bucket}`,
        matchedKeyword: keyword,
        requiresManualReview: false
      };
    }
  }

  // If no match, flag for manual review
  return {
    bucket: 'Unclassified',
    hubspotValue: null,
    confidence: 0,
    rationale: `Department "${department}" does not match known patterns`,
    requiresManualReview: true
  };
}

/**
 * Build search queries to find department affiliation
 *
 * @param {Object} contact - Contact information
 * @returns {Array} - Array of search query strings
 */
function buildDepartmentSearchQueries(contact) {
  const queries = [];

  // Extract domain from email
  let domain = null;
  if (contact.email) {
    const emailMatch = contact.email.match(/@([a-z0-9.-]+)/i);
    if (emailMatch) {
      domain = emailMatch[1];
    }
  }

  // Query 1: Official site search (highest priority)
  if (domain && contact.name) {
    queries.push({
      query: `"${contact.name}" site:${domain}`,
      priority: 1,
      type: 'official_site'
    });
  }

  // Query 2: Name + Title + City/Org
  if (contact.name && contact.title) {
    const cityOrOrg = contact.company || (domain ? domain.split('.')[0] : '');
    if (cityOrOrg) {
      queries.push({
        query: `"${contact.name}" "${contact.title}" ${cityOrOrg} department`,
        priority: 2,
        type: 'general_search'
      });
    }
  }

  // Query 3: Name + Email (for mentions)
  if (contact.name && contact.email) {
    queries.push({
      query: `"${contact.name}" "${contact.email}"`,
      priority: 3,
      type: 'email_search'
    });
  }

  // Query 4: Just name + domain context
  if (contact.name && domain) {
    const city = domain.split('.')[0];
    queries.push({
      query: `"${contact.name}" ${city} government department`,
      priority: 4,
      type: 'context_search'
    });
  }

  return queries;
}

/**
 * Classify a contact using organization-first methodology
 *
 * @param {Object} contact - Contact with {name, title, email, company}
 * @param {Array} searchResults - Web search results (optional)
 * @returns {Object} - Classification result
 */
function classifyByOrganization(contact, searchResults = null) {
  const result = {
    contactId: contact.id || contact.contactId,
    name: contact.name,
    title: contact.title,
    email: contact.email,
    company: contact.company,

    // Department extraction
    departmentFound: null,
    departmentSource: null,
    departmentConfidence: 0,
    departmentEvidence: null,

    // Classification
    classification: 'Unclassified',
    hubspotValue: null, // Internal value for persona_department property
    classificationRationale: null,
    confidence: 0,
    method: null,

    // Metadata
    requiresManualReview: false,
    searchQueries: []
  };

  // Generate search queries
  result.searchQueries = buildDepartmentSearchQueries(contact);

  // If search results provided, extract department
  if (searchResults && searchResults.length > 0) {
    const extraction = extractDepartmentFromSearchResults(searchResults, contact);

    result.departmentFound = extraction.department;
    result.departmentSource = extraction.source;
    result.departmentConfidence = extraction.confidence;
    result.departmentEvidence = extraction.evidence;
    result.method = extraction.method;

    // Classify based on department
    if (extraction.department) {
      const classification = classifyByDepartment(extraction.department);
      result.classification = classification.bucket;
      result.hubspotValue = classification.hubspotValue;
      result.classificationRationale = classification.rationale;
      result.confidence = Math.min(extraction.confidence, classification.confidence);
      result.requiresManualReview = classification.requiresManualReview;
    } else {
      result.requiresManualReview = true;
      result.classificationRationale = 'Could not identify department from search results';
    }
  } else {
    // No search results - try to infer from company name
    if (contact.company && contact.company !== 'Unknown') {
      const classification = classifyByDepartment(contact.company);
      if (classification.bucket !== 'Unclassified') {
        result.departmentFound = contact.company;
        result.departmentSource = 'hubspot_company_field';
        result.departmentConfidence = 70;
        result.departmentEvidence = 'Inferred from HubSpot company name';
        result.classification = classification.bucket;
        result.hubspotValue = classification.hubspotValue;
        result.classificationRationale = classification.rationale;
        result.confidence = 70;
        result.method = 'company_field_inference';
      } else {
        result.requiresManualReview = true;
        result.classificationRationale = 'No search results and company name unclear';
      }
    } else {
      result.requiresManualReview = true;
      result.classificationRationale = 'No search results and no company information';
    }
  }

  return result;
}

/**
 * Compare with existing classification to identify changes
 *
 * @param {Object} newClassification - New classification result
 * @param {Object} existingClassification - Current classification from HubSpot
 * @returns {Object} - Comparison result
 */
function compareClassifications(newClassification, existingClassification) {
  const changed = newClassification.classification !== existingClassification.bucket;

  return {
    changed: changed,
    previousBucket: existingClassification.bucket,
    newBucket: newClassification.classification,
    previousConfidence: existingClassification.confidence,
    newConfidence: newClassification.confidence,
    changeType: determineChangeType(existingClassification.bucket, newClassification.classification),
    improvementReason: changed ?
      `Changed from title-based "${existingClassification.bucket}" to organization-based "${newClassification.classification}"` :
      'Classification confirmed with organization verification'
  };
}

/**
 * Determine the type of classification change
 *
 * @param {String} oldBucket - Previous classification
 * @param {String} newBucket - New classification
 * @returns {String} - Change type
 */
function determineChangeType(oldBucket, newBucket) {
  if (oldBucket === 'Unclassified' && newBucket !== 'Unclassified') {
    return 'resolved_unclassified';
  } else if (oldBucket !== 'Unclassified' && newBucket === 'Unclassified') {
    return 'degraded_to_unclassified';
  } else if (oldBucket === newBucket) {
    return 'confirmed';
  } else {
    return 'classification_changed';
  }
}

module.exports = {
  classifyByOrganization,
  extractDepartmentFromSearchResults,
  classifyByDepartment,
  buildDepartmentSearchQueries,
  compareClassifications,
  toHubSpotValue,
  toDisplayLabel,
  DEPARTMENT_TO_BUCKET,
  PERSONA_DEPARTMENT_VALUES
};
