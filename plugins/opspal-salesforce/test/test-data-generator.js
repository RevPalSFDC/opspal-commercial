/**
 * Test Data Generator - Realistic test data for comprehensive testing
 *
 * Purpose: Generate realistic Salesforce data for testing
 * Coverage:
 * - Duplicate pairs with various similarity scores
 * - Merge decisions (APPROVE/REVIEW/BLOCK)
 * - Salesforce IDs (all standard objects)
 * - Account/Contact/Lead/Opportunity records
 *
 * Usage:
 *   const generators = require('./test-data-generator');
 *   const pairs = generators.generateDuplicatePairs(100);
 *   const decisions = generators.generateDecisions(50, 'APPROVE');
 *
 * @version 1.0.0
 */

const crypto = require('crypto');

// Salesforce ID prefixes by object type
const SF_ID_PREFIXES = {
  Account: '001',
  Contact: '003',
  Lead: '00Q',
  Opportunity: '006',
  Case: '500',
  Task: '00T',
  Event: '00U',
  Campaign: '701',
  User: '005',
  Quote: '0Q0',
  QuoteLine: '0QL',
  Product: '01t'
};

// Sample company names for realistic data
const COMPANY_NAMES = [
  'Acme Corp', 'Globex Corporation', 'Soylent Corp', 'Initech',
  'Umbrella Corporation', 'Hooli', 'Pied Piper', 'Massive Dynamic',
  'Wayne Enterprises', 'Stark Industries', 'Oscorp', 'LexCorp',
  'Cyberdyne Systems', 'Tyrell Corporation', 'Weyland-Yutani'
];

// Sample first/last names
const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas'
];

// Sample domains for email addresses
const EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'company.com', 'business.net',
  'enterprise.io', 'tech.co', 'startup.com'
];

/**
 * Generate a valid Salesforce ID
 *
 * @param {string} objectType - Salesforce object type (Account, Contact, etc.)
 * @returns {string} 18-character Salesforce ID
 */
function generateSalesforceId(objectType = 'Account') {
  const prefix = SF_ID_PREFIXES[objectType] || '001';

  // Generate 15 characters (3-char prefix + 12 random)
  const randomPart = crypto.randomBytes(6).toString('hex').substring(0, 12);
  const id15 = prefix + randomPart;

  // Calculate 3-char checksum for 18-char ID
  const checksum = calculateSalesforceChecksum(id15);

  return id15 + checksum;
}

/**
 * Calculate Salesforce ID checksum (converts 15-char to 18-char ID)
 *
 * @param {string} id15 - 15-character Salesforce ID
 * @returns {string} 3-character checksum
 */
function calculateSalesforceChecksum(id15) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  let checksum = '';

  for (let i = 0; i < 3; i++) {
    let bits = 0;
    for (let j = 0; j < 5; j++) {
      const char = id15.charAt(i * 5 + j);
      if (char >= 'A' && char <= 'Z') {
        bits += (1 << j);
      }
    }
    checksum += alphabet.charAt(bits);
  }

  return checksum;
}

/**
 * Generate random element from array
 *
 * @param {Array} array - Array to sample from
 * @returns {*} Random element
 */
function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate random number in range
 *
 * @param {number} min - Minimum (inclusive)
 * @param {number} max - Maximum (inclusive)
 * @returns {number} Random number
 */
function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random similarity score
 *
 * @param {string} riskLevel - Risk level (safe/moderate/dangerous)
 * @returns {number} Similarity score 0-1
 */
function randomSimilarity(riskLevel = 'safe') {
  switch (riskLevel) {
    case 'safe':
      return 0.8 + Math.random() * 0.2;  // 0.8-1.0
    case 'moderate':
      return 0.5 + Math.random() * 0.3;  // 0.5-0.8
    case 'dangerous':
      return 0.3 + Math.random() * 0.2;  // 0.3-0.5
    default:
      return Math.random();  // 0-1
  }
}

/**
 * Generate duplicate pairs for testing
 *
 * @param {number} count - Number of pairs to generate
 * @param {Object} options - Generation options
 * @param {string} options.objectType - Salesforce object type (default: Account)
 * @param {string} options.riskLevel - Risk level (safe/moderate/dangerous)
 * @param {boolean} options.includeMetadata - Include additional metadata
 * @returns {Array} Array of duplicate pairs
 */
function generateDuplicatePairs(count, options = {}) {
  const {
    objectType = 'Account',
    riskLevel = 'safe',
    includeMetadata = false
  } = options;

  const pairs = [];

  for (let i = 0; i < count; i++) {
    const pair = {
      masterId: generateSalesforceId(objectType),
      duplicateId: generateSalesforceId(objectType),
      similarity: randomSimilarity(riskLevel)
    };

    if (includeMetadata) {
      pair.metadata = {
        masterName: randomElement(COMPANY_NAMES),
        duplicateName: randomElement(COMPANY_NAMES),
        matchedFields: randomNumber(3, 10),
        conflictingFields: riskLevel === 'dangerous' ? randomNumber(2, 5) : randomNumber(0, 2)
      };
    }

    pairs.push(pair);
  }

  return pairs;
}

/**
 * Generate merge decisions for testing
 *
 * @param {number} count - Number of decisions to generate
 * @param {string} decisionType - Decision type (APPROVE/REVIEW/BLOCK)
 * @param {Object} options - Generation options
 * @returns {Array} Array of merge decisions
 */
function generateDecisions(count, decisionType = 'APPROVE', options = {}) {
  const {
    objectType = 'Account',
    includeReason = true
  } = options;

  const decisions = [];

  const reasons = {
    APPROVE: [
      'High similarity score, no conflicts',
      'All fields match, safe to merge',
      'Duplicate confirmed by user'
    ],
    REVIEW: [
      'Medium similarity, manual review recommended',
      'Some field conflicts detected',
      'Uncertain match quality'
    ],
    BLOCK: [
      'Domain mismatch detected',
      'Address mismatch - different locations',
      'Integration ID conflict'
    ]
  };

  for (let i = 0; i < count; i++) {
    const decision = {
      pair_id: `pair_${i}`,
      master_id: generateSalesforceId(objectType),
      duplicate_id: generateSalesforceId(objectType),
      decision: decisionType,
      confidence: decisionType === 'APPROVE' ? 0.8 + Math.random() * 0.2 :
                 decisionType === 'REVIEW' ? 0.4 + Math.random() * 0.4 :
                 0.2 + Math.random() * 0.3
    };

    if (includeReason) {
      decision.reason = randomElement(reasons[decisionType]);
    }

    decisions.push(decision);
  }

  return decisions;
}

/**
 * Generate Account records for testing
 *
 * @param {number} count - Number of accounts to generate
 * @returns {Array} Array of Account records
 */
function generateAccounts(count) {
  const accounts = [];

  for (let i = 0; i < count; i++) {
    accounts.push({
      Id: generateSalesforceId('Account'),
      Name: randomElement(COMPANY_NAMES),
      BillingStreet: `${randomNumber(1, 9999)} ${randomElement(['Main', 'Oak', 'Maple', 'Pine'])} St`,
      BillingCity: randomElement(['San Francisco', 'New York', 'Chicago', 'Austin', 'Seattle']),
      BillingState: randomElement(['CA', 'NY', 'IL', 'TX', 'WA']),
      BillingPostalCode: String(randomNumber(10000, 99999)),
      BillingCountry: 'USA',
      Phone: `(${randomNumber(200, 999)}) ${randomNumber(200, 999)}-${randomNumber(1000, 9999)}`,
      Website: `www.${randomElement(COMPANY_NAMES).toLowerCase().replace(' ', '')}.com`,
      NumberOfEmployees: randomNumber(10, 10000),
      AnnualRevenue: randomNumber(100000, 10000000)
    });
  }

  return accounts;
}

/**
 * Generate Contact records for testing
 *
 * @param {number} count - Number of contacts to generate
 * @param {Array} accountIds - Optional array of Account IDs to associate with
 * @returns {Array} Array of Contact records
 */
function generateContacts(count, accountIds = []) {
  const contacts = [];

  for (let i = 0; i < count; i++) {
    const firstName = randomElement(FIRST_NAMES);
    const lastName = randomElement(LAST_NAMES);

    contacts.push({
      Id: generateSalesforceId('Contact'),
      FirstName: firstName,
      LastName: lastName,
      Email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomElement(EMAIL_DOMAINS)}`,
      Phone: `(${randomNumber(200, 999)}) ${randomNumber(200, 999)}-${randomNumber(1000, 9999)}`,
      Title: randomElement(['CEO', 'CTO', 'VP Sales', 'Director', 'Manager', 'Engineer']),
      AccountId: accountIds.length > 0 ? randomElement(accountIds) : generateSalesforceId('Account')
    });
  }

  return contacts;
}

/**
 * Generate Lead records for testing
 *
 * @param {number} count - Number of leads to generate
 * @returns {Array} Array of Lead records
 */
function generateLeads(count) {
  const leads = [];

  for (let i = 0; i < count; i++) {
    const firstName = randomElement(FIRST_NAMES);
    const lastName = randomElement(LAST_NAMES);

    leads.push({
      Id: generateSalesforceId('Lead'),
      FirstName: firstName,
      LastName: lastName,
      Email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomElement(EMAIL_DOMAINS)}`,
      Company: randomElement(COMPANY_NAMES),
      Status: randomElement(['Open', 'Contacted', 'Qualified', 'Unqualified']),
      LeadSource: randomElement(['Web', 'Phone Inquiry', 'Partner Referral', 'Purchased List'])
    });
  }

  return leads;
}

/**
 * Generate Opportunity records for testing
 *
 * @param {number} count - Number of opportunities to generate
 * @param {Array} accountIds - Optional array of Account IDs to associate with
 * @returns {Array} Array of Opportunity records
 */
function generateOpportunities(count, accountIds = []) {
  const opps = [];

  for (let i = 0; i < count; i++) {
    opps.push({
      Id: generateSalesforceId('Opportunity'),
      Name: `${randomElement(COMPANY_NAMES)} - ${randomElement(['New Business', 'Renewal', 'Upsell'])}`,
      AccountId: accountIds.length > 0 ? randomElement(accountIds) : generateSalesforceId('Account'),
      StageName: randomElement(['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']),
      Amount: randomNumber(10000, 1000000),
      Probability: randomNumber(10, 90),
      CloseDate: new Date(Date.now() + randomNumber(-90, 90) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
  }

  return opps;
}

/**
 * Generate dangerous merge scenarios for testing safety guardrails
 *
 * @returns {Array} Array of dangerous duplicate pairs
 */
function generateDangerousMerges() {
  return [
    // Domain mismatch
    {
      masterId: generateSalesforceId('Account'),
      duplicateId: generateSalesforceId('Account'),
      similarity: 0.75,
      metadata: {
        masterDomain: 'company-a.com',
        duplicateDomain: 'company-b.com',
        conflict: 'domain_mismatch'
      }
    },
    // Address mismatch
    {
      masterId: generateSalesforceId('Account'),
      duplicateId: generateSalesforceId('Account'),
      similarity: 0.80,
      metadata: {
        masterAddress: '123 Main St, San Francisco, CA',
        duplicateAddress: '456 Oak Ave, New York, NY',
        conflict: 'address_mismatch'
      }
    },
    // Integration ID conflict
    {
      masterId: generateSalesforceId('Account'),
      duplicateId: generateSalesforceId('Account'),
      similarity: 0.85,
      metadata: {
        masterIntegrationId: 'ERP-12345',
        duplicateIntegrationId: 'ERP-67890',
        conflict: 'integration_id_conflict'
      }
    }
  ];
}

/**
 * Generate realistic test dataset with related records
 *
 * @param {number} accountCount - Number of accounts
 * @param {number} contactsPerAccount - Contacts per account
 * @returns {Object} Complete dataset with accounts, contacts, opportunities
 */
function generateRealisticDataset(accountCount = 10, contactsPerAccount = 3) {
  const accounts = generateAccounts(accountCount);
  const accountIds = accounts.map(a => a.Id);

  const contacts = generateContacts(accountCount * contactsPerAccount, accountIds);
  const opportunities = generateOpportunities(accountCount * 2, accountIds);
  const leads = generateLeads(accountCount * 5);

  return {
    accounts,
    contacts,
    opportunities,
    leads,
    summary: {
      accounts: accounts.length,
      contacts: contacts.length,
      opportunities: opportunities.length,
      leads: leads.length
    }
  };
}

// Export all generators
module.exports = {
  // ID generation
  generateSalesforceId,
  calculateSalesforceChecksum,

  // Duplicate pairs
  generateDuplicatePairs,
  generateDecisions,
  generateDangerousMerges,

  // Standard objects
  generateAccounts,
  generateContacts,
  generateLeads,
  generateOpportunities,

  // Realistic datasets
  generateRealisticDataset,

  // Utility functions
  randomElement,
  randomNumber,
  randomSimilarity,

  // Constants
  SF_ID_PREFIXES,
  COMPANY_NAMES,
  FIRST_NAMES,
  LAST_NAMES,
  EMAIL_DOMAINS
};
